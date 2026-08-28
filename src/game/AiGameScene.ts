import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { ActionResult, Coord, GameState, PlayerId } from '../data/types';
import type { AbilityVfxEvent } from './AbilityVfxAnimator';
import {
  applyAiAction,
  type AiAction,
  type AiPlan,
} from './ai';
import { LIVE_AI_OPTIONS_V6, planAiTurnV6 } from './aiPlannerV6';
import {
  coordKey,
  curseUnit,
  endTurn,
  findUnit,
  getCurseTargets,
  getSoulLinkTargets,
  getTacticTargetCoords,
  getTacticTargets,
  hexDistance,
  playTacticCard,
  playTacticCardAtCoord,
  rallyAdjacentAllies,
  soulLinkUnit,
  unitAt,
  unitDefinition,
} from './engine';
import { elapsedSince, setDebugStatus } from './DebugStatus';
import { GameScene } from './GameScene';

interface HighlightSets {
  move: Set<string>;
  attack: Set<string>;
  summon: Set<string>;
  selected: Set<string>;
}

interface GameSceneInternals {
  state: GameState;
  message: string;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  mode: string | null;
  clearInteraction: () => void;
  renderAll: () => void;
  renderHud: () => void;
  highlights: () => HighlightSets;
  handleHexClick: (coord: Coord) => Promise<void>;
  beginDisplace: () => void;
  animatePlayedCard: (index: number) => void;
  playCardDraw: () => void;
  playCardPlay: () => void;
  playTacticSound: (cardId: CardDefinitionId) => void;
  playProfaneWellComplete: () => void;
  playProfaneWellTick: () => void;
  playHealingAura: () => void;
  playSiteCapture: () => void;
  playTurnEnd: () => void;
  playUnitDeath: (owner: PlayerId, commander?: boolean) => void;
  playVictoryCountdown: () => void;
  presentAbilityVfx: (event: AbilityVfxEvent) => Promise<void>;
  playAiAction?: (action: AiAction) => Promise<ActionResult>;
  presentAiThinking?: () => void;
  center: (coord: Coord) => { x: number; y: number };
  recordAiPlan: (plan: AiPlan) => void;
  beginAiAction: () => void;
  recordAiAction: (actor: PlayerId, action: AiAction | { kind: 'endTurn' }, result: ActionResult) => void;
}

interface AiWorkerResponse {
  requestId: number;
  plan: AiPlan;
}

const MAX_LIVE_AI_STEPS = 8;

export class AiGameScene extends GameScene {
  private aiTurnInProgress = false;
  private aiWorker: Worker | null = null;
  private aiRequestId = 0;
  private aiStartedAt = 0;
  private aiThinkStartedAt = 0;
  private aiStepCount = 0;
  private aiHeartbeat: number | null = null;

  create(): void {
    super.create();
    this.installUnitAbilityInteractions();
    if (typeof Worker !== 'undefined') {
      this.aiWorker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
        void this.finishWorkerPlan(event.data).catch((error: unknown) => this.reportAiFailure(error));
      };
      this.aiWorker.onerror = (event) => {
        setDebugStatus(`AI worker error after ${elapsedSince(this.aiStartedAt)}: ${event.message || 'unknown error'}.`, 'error');
        this.fallbackToMainThread();
      };
      this.events.once('shutdown', () => {
        this.stopAiHeartbeat();
        this.aiWorker?.terminate();
      });
    }
  }

  private installUnitAbilityInteractions(): void {
    const scene = this as unknown as GameSceneInternals;
    const originalBeginAbility = scene.beginDisplace.bind(this);
    const originalHighlights = scene.highlights.bind(this);
    const originalHandleHexClick = scene.handleHexClick.bind(this);
    const originalRenderHud = scene.renderHud.bind(this);

    scene.beginDisplace = () => {
      if (scene.animationInProgress) return;
      const selected = scene.selectedUnitId ? findUnit(scene.state, scene.selectedUnitId) : undefined;
      if (!selected || selected.owner !== scene.state.currentPlayer) return originalBeginAbility();

      const ability = unitDefinition(selected).ability;
      if (ability === 'Rally') {
        const result = rallyAdjacentAllies(scene.state, selected.id);
        scene.message = result.message;
        if (result.ok) scene.mode = 'unit';
        scene.renderAll();
        return;
      }
      if (ability === 'SoulLink') {
        const targets = getSoulLinkTargets(scene.state, selected.id);
        if (targets.length === 0) {
          scene.message = 'No adjacent Undead ally can receive Soul Link.';
          scene.renderAll();
          return;
        }
        scene.mode = 'soul-link-target';
        scene.message = 'Choose a highlighted adjacent Undead ally for Soul Link.';
        scene.renderAll();
        return;
      }
      if (ability === 'Curse') {
        const targets = getCurseTargets(scene.state, selected.id);
        if (targets.length === 0) {
          scene.message = 'No enemy is within Curse range.';
          scene.renderAll();
          return;
        }
        scene.mode = 'curse-target';
        scene.message = 'Choose a highlighted enemy to Curse for 3 turns.';
        scene.renderAll();
        return;
      }
      originalBeginAbility();
    };

    scene.highlights = () => {
      const highlight = originalHighlights();
      const cardId = scene.selectedCardIndex === null
        ? undefined
        : scene.state.players[scene.state.currentPlayer].hand[scene.selectedCardIndex] as CardDefinitionId | undefined;
      const card = cardId ? CARD_DEFINITIONS[cardId] : undefined;
      if (scene.mode === 'card' && card?.type === 'tactic') {
        highlight.summon.clear();
        for (const target of getTacticTargetCoords(scene.state, card.id)) highlight.summon.add(coordKey(target));
        for (const target of getTacticTargets(scene.state, card.id)) highlight.summon.add(coordKey(target.coord));
      }

      const selected = scene.selectedUnitId ? findUnit(scene.state, scene.selectedUnitId) : undefined;
      if (!selected) return highlight;
      if (scene.mode === 'soul-link-target') {
        for (const target of getSoulLinkTargets(scene.state, selected.id)) highlight.summon.add(coordKey(target.coord));
      }
      if (scene.mode === 'curse-target') {
        for (const target of getCurseTargets(scene.state, selected.id)) highlight.attack.add(coordKey(target.coord));
      }
      return highlight;
    };

    scene.handleHexClick = async (coord: Coord) => {
      const cardId = scene.selectedCardIndex === null
        ? undefined
        : scene.state.players[scene.state.currentPlayer].hand[scene.selectedCardIndex] as CardDefinitionId | undefined;
      const card = cardId ? CARD_DEFINITIONS[cardId] : undefined;
      if (scene.mode === 'card' && scene.selectedCardIndex !== null && card?.type === 'tactic') {
        const cardIndex = scene.selectedCardIndex;
        const occupant = unitAt(scene.state, coord);
        const result = card.effect.kind === 'profaneWell'
          ? occupant
            ? playTacticCard(scene.state, cardIndex, occupant.id)
            : { ok: false, message: 'Choose a highlighted friendly non-Commander unit.' }
          : playTacticCardAtCoord(scene.state, cardIndex, coord);
        scene.message = result.message;
        if (result.ok) {
          scene.playCardPlay();
          if (
            card.id === 'graveLock'
            || card.id === 'buildBridge'
            || card.id === 'scorch'
            || card.id === 'raiseFort'
            || card.id === 'profaneWell'
          ) scene.playTacticSound(card.id);
          scene.animatePlayedCard(cardIndex);
          scene.clearInteraction();
        }
        scene.renderAll();
        return;
      }

      const selected = scene.selectedUnitId ? findUnit(scene.state, scene.selectedUnitId) : undefined;
      const occupant = unitAt(scene.state, coord);
      if (scene.mode === 'soul-link-target' && selected) {
        const result = occupant
          ? soulLinkUnit(scene.state, selected.id, occupant.id)
          : { ok: false, message: 'Choose a highlighted adjacent Undead ally.' };
        scene.message = result.message;
        if (result.ok) scene.mode = 'unit';
        scene.renderAll();
        return;
      }
      if (scene.mode === 'curse-target' && selected) {
        const result = occupant
          ? curseUnit(scene.state, selected.id, occupant.id)
          : { ok: false, message: 'Choose a highlighted enemy within Curse range.' };
        scene.message = result.message;
        if (result.ok) scene.mode = 'unit';
        scene.renderAll();
        return;
      }
      await originalHandleHexClick(coord);
    };

    scene.renderHud = () => {
      originalRenderHud();

      const cardId = scene.selectedCardIndex === null
        ? undefined
        : scene.state.players[scene.state.currentPlayer].hand[scene.selectedCardIndex] as CardDefinitionId | undefined;
      const card = cardId ? CARD_DEFINITIONS[cardId] : undefined;
      if (scene.mode === 'card' && card?.type === 'tactic') {
        switch (card.effect.kind) {
          case 'graveLock':
            scene.message = 'Choose a highlighted passable hex for Grave Lock.';
            break;
          case 'buildBridge':
            scene.message = 'Choose a highlighted Water hex to build a Bridge.';
            break;
          case 'scorch':
            scene.message = 'Choose a highlighted Forest hex to Scorch.';
            break;
          case 'raiseFort':
            scene.message = 'Choose a highlighted empty Plain or Hill hex to Raise a Fort.';
            break;
          case 'profaneWell':
            scene.message = 'Choose a highlighted friendly non-Commander unit to sacrifice.';
            break;
          default:
            scene.message = 'Choose a highlighted target for this tactic.';
        }
        const status = document.querySelector<HTMLElement>('#status');
        if (status) status.textContent = scene.message;
      }

      const selected = scene.selectedUnitId ? findUnit(scene.state, scene.selectedUnitId) : undefined;
      const abilityButton = document.querySelector<HTMLButtonElement>('#ability-button');
      if (!abilityButton) return;
      const ability = selected?.owner === scene.state.currentPlayer ? unitDefinition(selected).ability : undefined;
      const activeAbility = ability === 'Displace' || ability === 'Rally' || ability === 'SoulLink' || ability === 'Curse';
      abilityButton.hidden = !activeAbility;
      if (!activeAbility || !selected) return;
      abilityButton.textContent = ability === 'Displace'
        ? 'Use Displace'
        : ability === 'Rally'
          ? 'Use Rally'
          : ability === 'SoulLink'
            ? 'Use Soul Link'
            : 'Use Curse';
      abilityButton.disabled = selected.exhausted
        || selected.attacked
        || scene.state.winner !== null
        || scene.animationInProgress;
    };

    scene.renderAll();
  }

  update(): void {
    const scene = this as unknown as GameSceneInternals;
    if (this.aiTurnInProgress
      || scene.animationInProgress
      || scene.state.winner
      || scene.state.currentPlayer !== 2) return;

    this.aiTurnInProgress = true;
    this.aiStartedAt = performance.now();
    this.aiStepCount = 0;
    scene.animationInProgress = true;
    scene.clearInteraction();
    this.hideAiHand();
    this.requestAiPlan(scene);
  }

  private requestAiPlan(scene: GameSceneInternals): void {
    if (!this.aiTurnInProgress || scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }
    this.presentThinking(scene);
    if (!this.aiWorker) {
      setDebugStatus('AI: Web Worker unavailable; planning on the main thread.', 'warning');
      this.fallbackToMainThread();
      return;
    }
    this.aiRequestId += 1;
    this.aiThinkStartedAt = performance.now();
    this.startAiHeartbeat();
    setDebugStatus(`AI: thinking up to 1s for action ${this.aiStepCount + 1} (request ${this.aiRequestId}).`, 'active');
    this.aiWorker.postMessage({
      requestId: this.aiRequestId,
      state: scene.state,
      options: LIVE_AI_OPTIONS_V6,
    });
  }

  private presentThinking(scene: GameSceneInternals): void {
    scene.presentAiThinking?.();
    const commander = scene.state.units.find((unit) => unit.owner === 2 && unit.definitionId === 'commander');
    if (commander && !scene.presentAiThinking) {
      const point = scene.center(commander.coord);
      this.cameras.main.pan(point.x, point.y, 220, 'Sine.easeInOut');
    }
    scene.message = 'Enemy thinking…';
    scene.renderAll();
    this.hideAiHand();
  }

  private async finishWorkerPlan(response: AiWorkerResponse): Promise<void> {
    if (response.requestId !== this.aiRequestId) return;
    this.stopAiHeartbeat();
    const scene = this as unknown as GameSceneInternals;
    await this.playAiPlan(scene, response.plan);
  }

  private fallbackToMainThread(): void {
    const scene = this as unknown as GameSceneInternals;
    if (!this.aiTurnInProgress || scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }

    this.aiWorker?.terminate();
    this.aiWorker = null;
    this.stopAiHeartbeat();
    const planningStartedAt = performance.now();
    const plan = planAiTurnV6(scene.state, LIVE_AI_OPTIONS_V6);
    setDebugStatus(
      `AI: main-thread plan finished in ${elapsedSince(planningStartedAt)} — ${plan.actions.length} actions.`,
      'warning',
    );
    void this.playAiPlan(scene, plan).catch((error: unknown) => this.reportAiFailure(error));
  }

  private async playAiPlan(scene: GameSceneInternals, plan: AiPlan): Promise<void> {
    if (scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }

    scene.recordAiPlan(plan);
    const action = plan.actions[0];
    if (!action || this.aiStepCount >= MAX_LIVE_AI_STEPS) {
      await this.endEnemyTurn(scene, []);
      return;
    }

    const actor = scene.state.currentPlayer;
    scene.beginAiAction();
    this.aiStepCount += 1;
    const totalNodes = plan.diagnostics.strategy.nodes + plan.diagnostics.tactical.nodes;
    setDebugStatus(
      `AI: playing step ${this.aiStepCount} (${action.kind}) after ${totalNodes} states.`,
      'active',
    );
    const result = scene.playAiAction
      ? await scene.playAiAction(action)
      : applyAiAction(scene.state, action);
    scene.recordAiAction(actor, action, result);
    if (!result.ok) {
      setDebugStatus(`AI replay stopped on step ${this.aiStepCount}: ${result.message}`, 'error');
      await this.endEnemyTurn(scene, [`AI plan stopped: ${result.message}`]);
      return;
    }
    scene.message = result.message;
    scene.renderAll();
    this.hideAiHand();
    await this.waitForAiAction(75);

    if (scene.state.winner || scene.state.currentPlayer !== 2) {
      await this.endEnemyTurn(scene, [result.message]);
      return;
    }
    this.requestAiPlan(scene);
  }

  private async endEnemyTurn(scene: GameSceneInternals, messages: string[]): Promise<void> {
    if (!scene.state.winner && scene.state.currentPlayer === 2) {
      setDebugStatus('AI: actions complete; ending Player 2 turn.', 'active');
      const endingPlayer = scene.state.currentPlayer;
      const nextPlayer = 1;
      const nextHandSize = scene.state.players[nextPlayer].hand.length;
      const pendingWellsBefore = new Map(scene.state.pendingManaWells.map((well) => [well.id, well.remainingTurns]));
      const commandersBefore = scene.state.units.filter((unit) => unit.definitionId === 'commander');
      const siteOwnersBefore = new Map(scene.state.sites.map((site) => [site.id, site.owner]));
      const countdownBefore = scene.state.countdown ? { ...scene.state.countdown } : null;
      const healingAuraSources = scene.state.units
        .filter((unit) => unit.owner === nextPlayer && unitDefinition(unit).traits.includes('HealingAura'))
        .map((unit) => ({ id: unit.id, coord: { ...unit.coord } }));
      const healingAuraTargetHpBefore = new Map(scene.state.units
        .filter((target) => target.owner === nextPlayer
          && target.hp < unitDefinition(target).maxHp
          && scene.state.units.some((source) => source.owner === nextPlayer
            && source.id !== target.id
            && unitDefinition(source).traits.includes('HealingAura')
            && hexDistance(source.coord, target.coord) === 1))
        .map((target) => [target.id, target.hp]));
      scene.beginAiAction();
      let healingAuraVfx: AbilityVfxEvent | undefined;
      const result = endTurn(scene.state);
      scene.recordAiAction(endingPlayer, { kind: 'endTurn' }, result);
      if (result.ok) {
        const siteCaptured = scene.state.sites.some(
          (site) => siteOwnersBefore.has(site.id) && site.owner !== siteOwnersBefore.get(site.id),
        );
        if (siteCaptured) scene.playSiteCapture();
        const deadCommander = commandersBefore.find((commander) => !findUnit(scene.state, commander.id));
        if (deadCommander) scene.playUnitDeath(deadCommander.owner, true);
        const profaneWellTicked = scene.state.pendingManaWells.some(
          (well) => well.remainingTurns < (pendingWellsBefore.get(well.id) ?? well.remainingTurns),
        );
        const profaneWellCompleted = scene.state.sites.some(
          (site) => site.type === 'well' && pendingWellsBefore.has(site.id.replace(/^profane-/, '')),
        );
        if (profaneWellTicked) scene.playProfaneWellTick();
        if (profaneWellCompleted) scene.playProfaneWellComplete();
        const countdownAdvanced = countdownBefore
          && scene.state.countdown?.player === countdownBefore.player
          && scene.state.countdown.checkpoints > countdownBefore.checkpoints;
        if (countdownAdvanced && !scene.state.winner) scene.playVictoryCountdown();
        if (scene.state.currentPlayer !== endingPlayer) {
          scene.playTurnEnd();
          const healedTargets = scene.state.units.filter(
            (unit) => unit.hp > (healingAuraTargetHpBefore.get(unit.id) ?? unit.hp),
          );
          if (healedTargets.length > 0) {
            scene.playHealingAura();
            const healedIds = new Set(healedTargets.map((unit) => unit.id));
            healingAuraVfx = {
              kind: 'healingAura',
              sources: healingAuraSources
                .filter((source) => scene.state.units.some((target) => healedIds.has(target.id)
                  && hexDistance(source.coord, target.coord) === 1))
                .map((source) => source.coord),
              targets: healedTargets.map((unit) => ({ ...unit.coord })),
            };
          }
          if (scene.state.players[nextPlayer].hand.length > nextHandSize) scene.playCardDraw();
        }
      }
      messages.push(result.message);
      scene.message = result.message;
      scene.renderAll();
      if (healingAuraVfx) await scene.presentAbilityVfx(healingAuraVfx);
      this.hideAiHand();
      await this.waitForAiAction(90);
    }

    scene.message = scene.state.winner === 2
      ? scene.state.units.some((unit) => unit.owner === 1)
        ? 'The Undead Commander survived the countdown. Enemy wins.'
        : 'The Human army was eliminated. Enemy wins.'
      : scene.state.winner === 1
        ? scene.state.units.some((unit) => unit.owner === 2)
          ? 'The Human Commander survived the countdown. Player 1 wins.'
          : 'The Undead army was eliminated. Player 1 wins.'
      : messages.length > 0
        ? `Enemy turn complete: ${messages.at(-1)}`
        : 'Enemy turn complete.';
    setDebugStatus(
      `AI turn complete in ${elapsedSince(this.aiStartedAt)}; control is with Player ${scene.state.currentPlayer}.`,
      'success',
    );
    this.finishAiUi(scene);
  }

  private startAiHeartbeat(): void {
    this.stopAiHeartbeat();
    this.aiHeartbeat = window.setInterval(() => {
      const elapsed = elapsedSince(this.aiThinkStartedAt);
      setDebugStatus(`AI: still thinking after ${elapsed} (up to 1s).`, 'warning');
    }, 1_100);
  }

  private stopAiHeartbeat(): void {
    if (this.aiHeartbeat === null) return;
    window.clearInterval(this.aiHeartbeat);
    this.aiHeartbeat = null;
  }

  private reportAiFailure(error: unknown): void {
    this.stopAiHeartbeat();
    const message = error instanceof Error ? error.message : String(error);
    setDebugStatus(`AI failed during planning/replay after ${elapsedSince(this.aiStartedAt)}: ${message}`, 'error');
    console.error('AI turn failed.', error);
  }

  private hideAiHand(): void {
    document.querySelector<HTMLElement>('#hand')?.replaceChildren();
  }

  private waitForAiAction(duration: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(duration, resolve));
  }

  private finishAiUi(scene: GameSceneInternals): void {
    scene.animationInProgress = false;
    scene.clearInteraction();
    scene.renderAll();
    this.aiTurnInProgress = false;
  }
}
