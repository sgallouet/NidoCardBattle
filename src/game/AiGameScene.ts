import type { Coord, GameState } from '../data/types';
import {
  applyAiAction,
  COMMON_AI_OPTIONS,
  runSmartAiTurn,
  type AiPlan,
} from './ai';
import {
  coordKey,
  curseUnit,
  endTurn,
  findUnit,
  getCurseTargets,
  getSoulLinkTargets,
  rallyAdjacentAllies,
  soulLinkUnit,
  unitAt,
  unitDefinition,
} from './engine';
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
  mode: string | null;
  clearInteraction: () => void;
  renderAll: () => void;
  renderHud: () => void;
  highlights: () => HighlightSets;
  handleHexClick: (coord: Coord) => Promise<void>;
  beginDisplace: () => void;
}

interface AiWorkerResponse {
  requestId: number;
  plan: AiPlan;
}

export class AiGameScene extends GameScene {
  private aiTurnInProgress = false;
  private aiWorker: Worker | null = null;
  private aiRequestId = 0;

  create(): void {
    super.create();
    this.installUnitAbilityInteractions();
    if (typeof Worker !== 'undefined') {
      this.aiWorker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (event: MessageEvent<AiWorkerResponse>) => this.finishWorkerPlan(event.data);
      this.aiWorker.onerror = () => this.fallbackToMainThread();
      this.events.once('shutdown', () => this.aiWorker?.terminate());
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

  private useUndeadSetupAbilities(state: GameState): void {
    if (state.currentPlayer !== 2 || state.winner) return;

    const commander = state.units.find((unit) => unit.owner === 2 && unit.definitionId === 'commander');
    if (commander && !commander.exhausted && !commander.attacked) {
      const linkTargets = getSoulLinkTargets(state, commander.id)
        .sort((a, b) => b.hp - a.hp || unitDefinition(b).maxHp - unitDefinition(a).maxHp);
      if (linkTargets.length > 0) soulLinkUnit(state, commander.id, linkTargets[0].id);
    }

    for (const necromancer of state.units.filter((unit) => unit.owner === 2 && unitDefinition(unit).ability === 'Curse')) {
      if (necromancer.exhausted || necromancer.attacked) continue;
      const targets = getCurseTargets(state, necromancer.id).sort((a, b) => {
        const commanderPriority = Number(b.definitionId === 'commander') - Number(a.definitionId === 'commander');
        if (commanderPriority !== 0) return commanderPriority;
        return b.hp - a.hp;
      });
      if (targets.length > 0) curseUnit(state, necromancer.id, targets[0].id);
    }
  }

  update(): void {
    const scene = this as unknown as GameSceneInternals;
    if (this.aiTurnInProgress
      || scene.animationInProgress
      || scene.state.winner
      || scene.state.currentPlayer !== 2) return;

    this.aiTurnInProgress = true;
    scene.animationInProgress = true;
    scene.clearInteraction();
    this.useUndeadSetupAbilities(scene.state);
    scene.message = 'Enemy thinking…';
    scene.renderAll();
    document.querySelector<HTMLElement>('#hand')?.replaceChildren();

    if (!this.aiWorker) {
      this.fallbackToMainThread();
      return;
    }

    this.aiRequestId += 1;
    this.aiWorker.postMessage({
      requestId: this.aiRequestId,
      state: scene.state,
      options: COMMON_AI_OPTIONS,
    });
  }

  private finishWorkerPlan(response: AiWorkerResponse): void {
    if (response.requestId !== this.aiRequestId) return;
    const scene = this as unknown as GameSceneInternals;
    if (scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }

    const messages: string[] = [];
    for (const action of response.plan.actions) {
      if (scene.state.winner || scene.state.currentPlayer !== 2) break;
      const result = applyAiAction(scene.state, action);
      if (!result.ok) {
        messages.push(`AI plan stopped: ${result.message}`);
        break;
      }
      messages.push(result.message);
    }

    if (!scene.state.winner && scene.state.currentPlayer === 2) {
      const result = endTurn(scene.state);
      messages.push(result.message);
    }

    scene.message = scene.state.winner === 2
      ? 'The Undead Commander survived the countdown. Enemy wins.'
      : messages.length > 0
        ? `Enemy turn complete: ${messages.at(-1)}`
        : 'Enemy turn complete.';
    this.finishAiUi(scene);
  }

  private fallbackToMainThread(): void {
    const scene = this as unknown as GameSceneInternals;
    if (!this.aiTurnInProgress || scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }

    this.aiWorker?.terminate();
    this.aiWorker = null;
    const result = runSmartAiTurn(scene.state, Math.random, COMMON_AI_OPTIONS);
    const meaningfulActions = result.actions.filter((action) => !action.startsWith('Player 1'));
    scene.message = scene.state.winner === 2
      ? 'The Undead Commander survived the countdown. Enemy wins.'
      : meaningfulActions.length > 0
        ? `Enemy turn complete: ${meaningfulActions.at(-1)}`
        : 'Enemy turn complete.';
    this.finishAiUi(scene);
  }

  private finishAiUi(scene: GameSceneInternals): void {
    scene.animationInProgress = false;
    scene.clearInteraction();
    scene.renderAll();
    this.aiTurnInProgress = false;
  }
}
