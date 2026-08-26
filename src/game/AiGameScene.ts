import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { ActionResult, Coord, GameState, PlayerId } from '../data/types';
import {
  applyAiAction,
  COMMON_AI_OPTIONS,
  planSmartAiTurn,
  type AiAction,
  type AiPlan,
} from './ai';
import {
  coordKey,
  curseUnit,
  endTurn,
  findUnit,
  getCurseTargets,
  getSoulLinkTargets,
  getTacticTargetCoords,
  getTacticTargets,
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
  playSiteCapture: () => void;
  playTurnEnd: () => void;
  playUnitDeath: (owner: PlayerId, commander?: boolean) => void;
  playVictoryCountdown: () => void;
  playAiAction?: (action: AiAction) => Promise<ActionResult>;
  recordAiPlan: (plan: AiPlan) => void;
  beginAiAction: () => void;
  recordAiAction: (actor: PlayerId, action: AiAction | { kind: 'endTurn' }, result: ActionResult) => void;
}

interface AiWorkerResponse {
  requestId: number;
  plan: AiPlan;
}

export class AiGameScene extends GameScene {
  private aiTurnInProgress = false;
  private aiWorker: Worker | null = null;
  private aiRequestId = 0;
  private aiStartedAt = 0;
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
    scene.animationInProgress = true;
    scene.clearInteraction();
    scene.message = 'Enemy thinking…';
    scene.renderAll();
    this.hideAiHand();
    this.startAiHeartbeat();

    if (!this.aiWorker) {
      setDebugStatus('AI: Web Worker unavailable; planning on the main thread.', 'warning');
      this.fallbackToMainThread();
      return;
    }

    this.aiRequestId += 1;
    setDebugStatus(`AI: request ${this.aiRequestId} sent to worker; thinking…`, 'active');
    this.aiWorker.postMessage({
      requestId: this.aiRequestId,
      state: scene.state,
      options: COMMON_AI_OPTIONS,
    });
  }

  private async finishWorkerPlan(response: AiWorkerResponse): Promise<void> {
    if (response.requestId !== this.aiRequestId) return;
    this.stopAiHeartbeat();
    const scene = this as unknown as GameSceneInternals;
    if (scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }
    const totalNodes = response.plan.diagnostics.strategy.nodes + response.plan.diagnostics.tactical.nodes;
    const budgetReached = response.plan.diagnostics.strategy.stopReason !== 'complete'
      || response.plan.diagnostics.tactical.stopReason !== 'complete';
    setDebugStatus(
      `AI: plan received in ${elapsedSince(this.aiStartedAt)} — ${response.plan.actions.length} actions, ${totalNodes} states${budgetReached ? ', budget reached' : ''}.`,
      budgetReached ? 'warning' : 'active',
    );
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
    const plan = planSmartAiTurn(scene.state, COMMON_AI_OPTIONS);
    const totalNodes = plan.diagnostics.strategy.nodes + plan.diagnostics.tactical.nodes;
    const budgetReached = plan.diagnostics.strategy.stopReason !== 'complete'
      || plan.diagnostics.tactical.stopReason !== 'complete';
    setDebugStatus(
      `AI: main-thread plan finished in ${elapsedSince(planningStartedAt)} — ${plan.actions.length} actions, ${totalNodes} states.`,
      budgetReached ? 'warning' : 'active',
    );
    void this.playAiPlan(scene, plan).catch((error: unknown) => this.reportAiFailure(error));
  }

  private async playAiPlan(scene: GameSceneInternals, plan: AiPlan): Promise<void> {
    const messages: string[] = [];
    scene.recordAiPlan(plan);
    for (const [index, action] of plan.actions.entries()) {
      if (scene.state.winner || scene.state.currentPlayer !== 2) break;
      const actor = scene.state.currentPlayer;
      scene.beginAiAction();
      setDebugStatus(`AI: running action ${index + 1}/${plan.actions.length} (${action.kind}).`, 'active');
      const result = scene.playAiAction
        ? await scene.playAiAction(action)
        : applyAiAction(scene.state, action);
      scene.recordAiAction(actor, action, result);
      if (!result.ok) {
        messages.push(`AI plan stopped: ${result.message}`);
        setDebugStatus(`AI replay stopped on action ${index + 1}: ${result.message}`, 'error');
        break;
      }
      messages.push(result.message);
      scene.message = result.message;
      scene.renderAll();
      this.hideAiHand();
      await this.waitForAiAction(75);
    }

    if (!scene.state.winner && scene.state.currentPlayer === 2) {
      setDebugStatus('AI: actions complete; ending Player 2 turn.', 'active');
      const endingPlayer = scene.state.currentPlayer;
      const nextPlayer = 1;
      const nextHandSize = scene.state.players[nextPlayer].hand.length;
      const pendingWellsBefore = new Map(scene.state.pendingManaWells.map((well) => [well.id, well.remainingTurns]));
      const commandersBefore = scene.state.units.filter((unit) => unit.definitionId === 'commander');
      const siteOwnersBefore = new Map(scene.state.sites.map((site) => [site.id, site.owner]));
      const countdownBefore = scene.state.countdown ? { ...scene.state.countdown } : null;
      scene.beginAiAction();
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
        if (countdownAdvanced) scene.playVictoryCountdown();
        if (scene.state.currentPlayer !== endingPlayer) {
          scene.playTurnEnd();
          if (scene.state.players[nextPlayer].hand.length > nextHandSize) scene.playCardDraw();
        }
      }
      messages.push(result.message);
      scene.message = result.message;
      scene.renderAll();
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
      const elapsed = elapsedSince(this.aiStartedAt);
      setDebugStatus(`AI: worker still thinking after ${elapsed}; no plan received yet.`, 'warning');
    }, 500);
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
