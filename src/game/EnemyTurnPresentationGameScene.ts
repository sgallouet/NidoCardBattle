import { CARD_DEFINITIONS } from '../data/cards';
import type { ActionResult, Coord, GameState } from '../data/types';
import { applyAiAction, type AiAction } from './ai';
import { findUnit, unitDefinition } from './engine';
import { StableInputGameScene } from './StableInputGameScene';
import './EnemyTurnPresentation.css';

const ENEMY_ANIMATION_STORAGE_KEY = 'nido.enemyTurnAnimations';
const CAMERA_FOCUS_MS = 220;

const ACTION_PACING: Record<AiAction['kind'], { leadIn: number; settle: number }> = {
  summon: { leadIn: 260, settle: 400 },
  tactic: { leadIn: 280, settle: 420 },
  move: { leadIn: 260, settle: 240 },
  attack: { leadIn: 280, settle: 420 },
  displace: { leadIn: 260, settle: 340 },
  rally: { leadIn: 240, settle: 320 },
  soulLink: { leadIn: 260, settle: 340 },
  curse: { leadIn: 260, settle: 340 },
  thunder: { leadIn: 260, settle: 380 },
  invoke: { leadIn: 260, settle: 380 },
};

interface EnemyPresentationInternals {
  state: GameState;
  message: string;
  renderAll: () => void;
  center: (coord: Coord) => { x: number; y: number };
  playAiAction?: (action: AiAction) => Promise<ActionResult>;
  presentAiThinking?: () => void;
  waitForAiAction: (duration: number) => Promise<void>;
  finishAiUi: (scene: EnemyPresentationInternals) => void;
}

export class EnemyTurnPresentationGameScene extends StableInputGameScene {
  private enemyAnimationsEnabled = true;
  private forceInstant = false;
  private enemyActionBanner?: HTMLElement;
  private enemyAnimationToggle?: HTMLButtonElement;

  create(): void {
    super.create();

    const game = this as unknown as EnemyPresentationInternals;
    const animatedAiAction = game.playAiAction?.bind(this);
    const baseWaitForAiAction = game.waitForAiAction.bind(this);
    const baseFinishAiUi = game.finishAiUi.bind(this);

    this.forceInstant = this.isSimulationMode();
    this.enemyAnimationsEnabled = this.forceInstant ? false : this.loadAnimationPreference();
    this.installPresentationUi();

    game.presentAiThinking = () => {
      const commander = game.state.units.find((unit) =>
        unit.owner === 2 && unit.definitionId === 'commander');
      this.showEnemyAction('Enemy thinking…');
      if (!this.enemyAnimationsEnabled || !commander) return;
      const point = game.center(commander.coord);
      this.cameras.main.pan(point.x, point.y, CAMERA_FOCUS_MS, 'Sine.easeInOut');
    };

    game.waitForAiAction = (duration) => {
      if (!this.enemyAnimationsEnabled) return Promise.resolve();
      return baseWaitForAiAction(duration);
    };

    game.finishAiUi = (scene) => {
      this.hideEnemyAction();
      baseFinishAiUi(scene);
    };

    if (animatedAiAction) {
      game.playAiAction = async (action) => {
        if (!this.enemyAnimationsEnabled) {
          this.hideEnemyAction();
          return applyAiAction(game.state, action);
        }

        const pacing = ACTION_PACING[action.kind];
        const actionLabel = this.describeAction(game.state, action);
        this.showEnemyAction(actionLabel);
        this.focusAction(game, action);
        game.message = actionLabel;
        game.renderAll();
        document.querySelector<HTMLElement>('#hand')?.replaceChildren();

        await baseWaitForAiAction(pacing.leadIn);
        const result = await animatedAiAction(action);
        if (result.ok) await baseWaitForAiAction(pacing.settle);
        return result;
      };
    }

    this.events.once('shutdown', () => {
      this.enemyAnimationToggle?.removeEventListener('click', this.handleAnimationToggle);
      this.enemyAnimationToggle?.remove();
      this.enemyActionBanner?.remove();
      this.enemyAnimationToggle = undefined;
      this.enemyActionBanner = undefined;
    });
  }

  private readonly handleAnimationToggle = (): void => {
    if (this.forceInstant) return;
    this.enemyAnimationsEnabled = !this.enemyAnimationsEnabled;
    try {
      window.localStorage.setItem(ENEMY_ANIMATION_STORAGE_KEY, `${this.enemyAnimationsEnabled}`);
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
    this.updateAnimationToggle();
    if (!this.enemyAnimationsEnabled) this.hideEnemyAction();
  };

  private installPresentationUi(): void {
    const turnControls = document.querySelector<HTMLElement>('.turn-control');
    if (turnControls) {
      const toggle = document.createElement('button');
      toggle.id = 'enemy-animation-toggle';
      toggle.className = 'secondary enemy-animation-toggle';
      toggle.type = 'button';
      toggle.addEventListener('click', this.handleAnimationToggle);
      turnControls.insertBefore(toggle, document.querySelector('#new-game-button'));
      this.enemyAnimationToggle = toggle;
      this.updateAnimationToggle();
    }

    const app = document.querySelector<HTMLElement>('#app');
    if (app) {
      const banner = document.createElement('div');
      banner.className = 'enemy-action-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.hidden = true;
      app.appendChild(banner);
      this.enemyActionBanner = banner;
    }
  }

  private updateAnimationToggle(): void {
    const toggle = this.enemyAnimationToggle;
    if (!toggle) return;

    if (this.forceInstant) {
      toggle.textContent = 'Enemy: Instant';
      toggle.disabled = true;
      toggle.title = 'Enemy animations are disabled in simulation mode.';
      toggle.setAttribute('aria-label', 'Enemy animations disabled in simulation mode');
      toggle.setAttribute('aria-pressed', 'false');
      return;
    }

    toggle.disabled = false;
    toggle.textContent = this.enemyAnimationsEnabled ? 'Enemy: Animated' : 'Enemy: Instant';
    toggle.title = this.enemyAnimationsEnabled
      ? 'Disable enemy turn animations and pacing'
      : 'Enable readable enemy turn animations and pacing';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-pressed', `${this.enemyAnimationsEnabled}`);
  }

  private showEnemyAction(label: string): void {
    const banner = this.enemyActionBanner;
    if (!banner) return;
    banner.textContent = label;
    banner.hidden = false;
    banner.classList.remove('is-showing');
    void banner.offsetWidth;
    banner.classList.add('is-showing');
  }

  private hideEnemyAction(): void {
    if (!this.enemyActionBanner) return;
    this.enemyActionBanner.hidden = true;
    this.enemyActionBanner.classList.remove('is-showing');
  }

  private focusAction(game: EnemyPresentationInternals, action: AiAction): void {
    const coord = this.actionFocusCoord(game.state, action);
    if (!coord) return;
    const point = game.center(coord);
    this.cameras.main.pan(point.x, point.y, CAMERA_FOCUS_MS, 'Sine.easeInOut');
  }

  private actionFocusCoord(state: GameState, action: AiAction): Coord | undefined {
    switch (action.kind) {
      case 'summon':
      case 'move':
      case 'thunder':
      case 'invoke':
        return action.destination;
      case 'tactic':
        return 'destination' in action ? action.destination : findUnit(state, action.targetId)?.coord;
      case 'attack':
      case 'displace':
      case 'soulLink':
      case 'curse':
        return findUnit(state, action.targetId)?.coord;
      case 'rally':
        return findUnit(state, action.unitId)?.coord;
      default: {
        const unhandledAction: never = action;
        return unhandledAction;
      }
    }
  }

  private describeAction(state: GameState, action: AiAction): string {
    const unitName = (unitId: string): string => {
      const unit = findUnit(state, unitId);
      return unit ? unitDefinition(unit).name : 'Unit';
    };

    switch (action.kind) {
      case 'summon':
        return `Enemy summons ${CARD_DEFINITIONS[action.cardId].name}`;
      case 'tactic':
        return `Enemy plays ${CARD_DEFINITIONS[action.cardId].name}`;
      case 'move':
        return `Enemy ${unitName(action.unitId)} moves`;
      case 'attack':
        return `Enemy ${unitName(action.unitId)} attacks ${unitName(action.targetId)}`;
      case 'displace':
        return `Enemy ${unitName(action.unitId)} displaces ${unitName(action.targetId)}`;
      case 'rally':
        return `Enemy ${unitName(action.unitId)} rallies nearby allies`;
      case 'soulLink':
        return `Enemy ${unitName(action.unitId)} links with ${unitName(action.targetId)}`;
      case 'curse':
        return `Enemy ${unitName(action.unitId)} curses ${unitName(action.targetId)}`;
      case 'thunder':
        return `Enemy ${unitName(action.unitId)} calls Thunder`;
      case 'invoke':
        return `Enemy ${unitName(action.unitId)} invokes a beast`;
      default: {
        const unhandledAction: never = action;
        return unhandledAction;
      }
    }
  }

  private loadAnimationPreference(): boolean {
    try {
      return window.localStorage.getItem(ENEMY_ANIMATION_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  }

  private isSimulationMode(): boolean {
    if (import.meta.env.MODE === 'simulation') return true;
    const params = new URLSearchParams(window.location.search);
    return params.get('simulation') === '1'
      || params.get('simulation') === 'true'
      || params.get('aiAnimation') === 'off';
  }
}
