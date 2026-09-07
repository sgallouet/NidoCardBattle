import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { GameState, UnitState } from '../data/types';
import {
  getAttackTargets,
  getCurseTargets,
  getDisplaceTargets,
  getInvokeDestinations,
  getRallyTargets,
  getReachableCoords,
  getSoulLinkTargets,
  getTacticTargetCoords,
  getTacticTargets,
  getThunderTargetCoords,
  getValidSummonCoords,
  unitAt,
  unitDefinition,
} from './engine';
import './EndTurnPresentation.css';

interface EndTurnPresentationOptions {
  getState: () => GameState;
}

type PresentationTone = 'normal' | 'ready' | 'capture' | 'survive' | 'danger' | 'enemy' | 'finished';

interface EndTurnSnapshot {
  tone: PresentationTone;
  context: string;
  detail: string;
  ariaLabel: string;
}

export class EndTurnPresentation {
  private button?: HTMLButtonElement;
  private main?: HTMLElement;
  private context?: HTMLElement;
  private detail?: HTMLElement;
  private lastTone?: PresentationTone;
  private changeTimer?: number;

  constructor(private readonly options: EndTurnPresentationOptions) {}

  install(): void {
    const button = document.querySelector<HTMLButtonElement>('#end-turn-button');
    if (!button) return;
    this.button = button;
    button.classList.add('end-turn-premium');
    button.innerHTML = `
      <span class="end-turn-main">END TURN</span>
      <span class="end-turn-context"></span>
      <span class="end-turn-detail"></span>`;
    this.main = button.querySelector<HTMLElement>('.end-turn-main') ?? undefined;
    this.context = button.querySelector<HTMLElement>('.end-turn-context') ?? undefined;
    this.detail = button.querySelector<HTMLElement>('.end-turn-detail') ?? undefined;
    this.sync();
  }

  sync(): void {
    const button = this.button;
    if (!button) return;
    const state = this.options.getState();
    const snapshot = this.snapshot(state);

    button.classList.remove(
      'is-ready',
      'is-capture',
      'is-survive',
      'is-danger',
      'is-enemy',
      'is-finished',
      'has-actions',
    );
    if (snapshot.tone !== 'normal') button.classList.add(`is-${snapshot.tone}`);
    if (snapshot.tone === 'normal' && snapshot.detail) button.classList.add('has-actions');

    if (state.currentPlayer !== 1 && !state.winner) button.disabled = true;
    this.main!.textContent = snapshot.tone === 'enemy' ? 'ENEMY TURN' : state.winner ? 'BATTLE OVER' : 'END TURN';
    this.context!.textContent = snapshot.context;
    this.context!.hidden = snapshot.context.length === 0;
    this.detail!.textContent = snapshot.detail;
    this.detail!.hidden = snapshot.detail.length === 0;
    button.setAttribute('aria-label', snapshot.ariaLabel);
    button.title = snapshot.ariaLabel;

    const turnIndicator = document.querySelector<HTMLElement>('#turn-indicator');
    if (turnIndicator) {
      const round = Math.ceil(state.turnNumber / 2);
      turnIndicator.textContent = state.winner
        ? 'Battle complete'
        : `${state.currentPlayer === 1 ? 'Your turn' : 'Enemy turn'} · Round ${round}`;
      turnIndicator.classList.toggle('is-enemy-turn', state.currentPlayer === 2 && !state.winner);
    }

    if (snapshot.tone !== this.lastTone) {
      button.classList.remove('state-pop');
      void button.offsetWidth;
      button.classList.add('state-pop');
      if (this.changeTimer !== undefined) window.clearTimeout(this.changeTimer);
      this.changeTimer = window.setTimeout(() => button.classList.remove('state-pop'), 420);
      this.lastTone = snapshot.tone;
    }
  }

  destroy(): void {
    if (this.changeTimer !== undefined) window.clearTimeout(this.changeTimer);
    this.changeTimer = undefined;
    this.button?.classList.remove(
      'end-turn-premium',
      'is-ready',
      'is-capture',
      'is-survive',
      'is-danger',
      'is-enemy',
      'is-finished',
      'has-actions',
      'state-pop',
    );
    this.button = undefined;
    this.main = undefined;
    this.context = undefined;
    this.detail = undefined;
    this.lastTone = undefined;
  }

  private snapshot(state: GameState): EndTurnSnapshot {
    if (state.winner) {
      return {
        tone: 'finished',
        context: state.winner === 1 ? 'VICTORY' : 'DEFEAT',
        detail: '',
        ariaLabel: 'Battle complete',
      };
    }

    if (state.currentPlayer !== 1) {
      return {
        tone: 'enemy',
        context: 'Watching the enemy move',
        detail: '',
        ariaLabel: 'Enemy turn in progress',
      };
    }

    const capture = state.sites.find((site) => {
      if (site.owner === 1) return false;
      return unitAt(state, site.coord)?.owner === 1;
    });
    if (capture) {
      const label = capture.type === 'keep' ? 'KEEP' : capture.type === 'fort' ? 'FORT' : 'MANA WELL';
      return {
        tone: 'capture',
        context: `⚑ CAPTURE ${label}`,
        detail: 'Control changes when the turn ends',
        ariaLabel: `End turn and capture ${label.toLowerCase()}`,
      };
    }

    if (state.countdown?.player === 1) {
      const remaining = Math.max(1, 3 - state.countdown.checkpoints);
      return {
        tone: 'survive',
        context: `SURVIVE · ${remaining} TURN${remaining === 1 ? '' : 'S'}`,
        detail: 'Keep your Commander alive',
        ariaLabel: `End turn. Survive ${remaining} more turn${remaining === 1 ? '' : 's'} to win`,
      };
    }

    if (state.countdown?.player === 2) {
      const remaining = Math.max(1, 3 - state.countdown.checkpoints);
      return {
        tone: 'danger',
        context: `DANGER · ENEMY ${remaining} TURN${remaining === 1 ? '' : 'S'}`,
        detail: 'Stop their victory countdown',
        ariaLabel: `End turn. Enemy can win in ${remaining} turn${remaining === 1 ? '' : 's'}`,
      };
    }

    const actionableUnits = state.units.filter((unit) => this.unitCanStillAct(state, unit)).length;
    const playableCards = this.playableCardCount(state);
    if (actionableUnits > 0 || playableCards > 0) {
      const parts: string[] = [];
      if (actionableUnits > 0) parts.push(`${actionableUnits} unit${actionableUnits === 1 ? '' : 's'} can still act`);
      if (playableCards > 0) parts.push(`${playableCards} card${playableCards === 1 ? '' : 's'} playable`);
      const detail = parts.join(' · ');
      return {
        tone: 'normal',
        context: 'You still have options',
        detail,
        ariaLabel: `End turn. ${detail}`,
      };
    }

    return {
      tone: 'ready',
      context: 'READY',
      detail: 'No obvious actions remaining',
      ariaLabel: 'End turn. No obvious actions remaining',
    };
  }

  private unitCanStillAct(state: GameState, unit: UnitState): boolean {
    if (unit.owner !== 1 || unit.exhausted) return false;
    if (getReachableCoords(state, unit.id).size > 0) return true;
    if (getAttackTargets(state, unit.id).length > 0) return true;
    if (unit.attacked) return false;

    const definition = unitDefinition(unit);
    if (definition.traits.includes('Invoker') && getInvokeDestinations(state, unit.id).length > 0) return true;
    if (definition.ability === 'Displace' && getDisplaceTargets(state, unit.id).length > 0) return true;
    if (definition.ability === 'Rally' && getRallyTargets(state, unit.id).length > 0) return true;
    if (definition.ability === 'SoulLink' && getSoulLinkTargets(state, unit.id).length > 0) return true;
    if (definition.ability === 'Curse' && getCurseTargets(state, unit.id).length > 0) return true;
    if (definition.ability === 'Thunder' && getThunderTargetCoords(state, unit.id).length > 0) return true;
    return false;
  }

  private playableCardCount(state: GameState): number {
    const player = state.players[1];
    const summonAvailable = getValidSummonCoords(state).length > 0;
    return player.hand.reduce((count, rawCardId) => {
      const cardId = rawCardId as CardDefinitionId;
      const card = CARD_DEFINITIONS[cardId];
      if (card.cost > player.mana) return count;
      if (card.type === 'unit') return count + (summonAvailable ? 1 : 0);
      const hasTarget = getTacticTargetCoords(state, card.id).length > 0
        || getTacticTargets(state, card.id).length > 0;
      return count + (hasTarget ? 1 : 0);
    }, 0);
  }
}
