import Phaser from 'phaser';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { Coord, GameState } from '../data/types';
import {
  findUnit,
  getAttackTargets,
  getCurseTargets,
  getDisplaceDestinations,
  getInvokeDestinations,
  getRallyTargets,
  getRestoreTargets,
  getSoulLinkTargets,
  getTacticTargetCoords,
  getTacticTargets,
  getValidSummonCoords,
  sameCoord,
  unitAt,
  unitDefinition,
} from './engine';
import { TacticCardPresentationGameScene } from './TacticCardPresentationGameScene';
import './PlayerCameraChoreography.css';

const CAMERA_CHOREOGRAPHY_STORAGE_KEY = 'nido.playerCameraChoreography';
const CAMERA_FOCUS_MS = 180;
const CAMERA_FOCUS_STRENGTH = 0.34;
const CAMERA_MAX_SCREEN_SHIFT = 118;
const HUMAN_PLAYER_ID = 1;

interface PlayerCameraInternals {
  state: GameState;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  displaceTargetId: string | null;
  restoreSourceId: string | null;
  mode: string | null;
  handleHexClick: (coord: Coord) => Promise<void>;
  beginDisplace: () => void;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

/**
 * Presentation-only camera nudges for the human-controlled player's meaningful actions.
 * Normal movement, free camera navigation and all gameplay state remain untouched.
 */
export class PlayerCameraChoreographyGameScene extends TacticCardPresentationGameScene {
  private cameraChoreographyEnabled = true;
  private cameraChoreographyToggle?: HTMLButtonElement;

  create(): void {
    super.create();

    const game = this as unknown as PlayerCameraInternals;
    const originalHandleHexClick = game.handleHexClick.bind(this);
    const originalBeginAbility = game.beginDisplace.bind(this);

    this.cameraChoreographyEnabled = this.loadCameraPreference();
    this.installCameraToggle();

    game.handleHexClick = async (coord) => {
      const focus = this.cameraChoreographyEnabled
        ? this.actionFocusPoint(game, coord)
        : null;
      if (focus) await this.focusCamera(focus);
      await originalHandleHexClick(coord);
    };

    // Rally resolves immediately from the ability button rather than a target hex.
    game.beginDisplace = () => {
      if (this.cameraChoreographyEnabled && this.canFocusRally(game)) {
        const selected = game.selectedUnitId ? findUnit(game.state, game.selectedUnitId) : undefined;
        if (selected) void this.focusCamera(game.center(selected.coord));
      }
      originalBeginAbility();
    };

    this.events.once('shutdown', () => {
      this.cameraChoreographyToggle?.removeEventListener('click', this.handleCameraToggle);
      this.cameraChoreographyToggle?.remove();
      this.cameraChoreographyToggle = undefined;
    });
  }

  private readonly handleCameraToggle = (): void => {
    this.cameraChoreographyEnabled = !this.cameraChoreographyEnabled;
    try {
      window.localStorage.setItem(
        CAMERA_CHOREOGRAPHY_STORAGE_KEY,
        `${this.cameraChoreographyEnabled}`,
      );
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
    this.updateCameraToggle();
  };

  private installCameraToggle(): void {
    const turnControls = document.querySelector<HTMLElement>('.turn-control');
    if (!turnControls) return;

    const toggle = document.createElement('button');
    toggle.id = 'player-camera-toggle';
    toggle.className = 'secondary player-camera-toggle';
    toggle.type = 'button';
    toggle.addEventListener('click', this.handleCameraToggle);

    const enemyToggle = document.querySelector('#enemy-animation-toggle');
    const newGameButton = document.querySelector('#new-game-button');
    turnControls.insertBefore(toggle, enemyToggle ?? newGameButton);
    this.cameraChoreographyToggle = toggle;
    this.updateCameraToggle();
  }

  private updateCameraToggle(): void {
    const toggle = this.cameraChoreographyToggle;
    if (!toggle) return;
    toggle.textContent = this.cameraChoreographyEnabled ? 'Camera: Cinematic' : 'Camera: Manual';
    toggle.title = this.cameraChoreographyEnabled
      ? 'Disable player-action camera choreography for A/B playtesting'
      : 'Enable subtle player-action camera choreography for A/B playtesting';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-pressed', `${this.cameraChoreographyEnabled}`);
  }

  private actionFocusPoint(game: PlayerCameraInternals, coord: Coord): Phaser.Math.Vector2 | null {
    if (game.animationInProgress || game.state.winner || game.state.currentPlayer !== HUMAN_PLAYER_ID) return null;

    const selected = game.selectedUnitId ? findUnit(game.state, game.selectedUnitId) : undefined;
    const occupant = unitAt(game.state, coord);

    if (game.mode === 'unit' && selected && occupant && occupant.owner !== selected.owner) {
      const legalAttack = getAttackTargets(game.state, selected.id).some((target) => target.id === occupant.id);
      if (!legalAttack) return null;
      return this.midpoint(game.center(selected.coord), game.center(occupant.coord));
    }

    if (game.mode === 'card' && game.selectedCardIndex !== null) {
      const cardId = game.state.players[game.state.currentPlayer].hand[game.selectedCardIndex] as CardDefinitionId | undefined;
      const card = cardId ? CARD_DEFINITIONS[cardId] : undefined;
      if (!card) return null;

      if (card.type === 'unit') {
        return getValidSummonCoords(game.state).some((target) => sameCoord(target, coord))
          ? game.center(coord)
          : null;
      }

      const legalCoord = getTacticTargetCoords(game.state, card.id).some((target) => sameCoord(target, coord));
      const legalUnit = occupant
        ? getTacticTargets(game.state, card.id).some((target) => target.id === occupant.id)
        : false;
      return legalCoord || legalUnit ? game.center(coord) : null;
    }

    if (game.mode === 'invoke-destination' && selected) {
      return getInvokeDestinations(game.state, selected.id).some((target) => sameCoord(target, coord))
        ? game.center(coord)
        : null;
    }

    if (game.mode === 'restore-target' && game.restoreSourceId && occupant) {
      return getRestoreTargets(game.state, game.restoreSourceId).some((target) => target.id === occupant.id)
        ? this.midpoint(game.center(findUnit(game.state, game.restoreSourceId)?.coord ?? coord), game.center(coord))
        : null;
    }

    if (game.mode === 'soul-link-target' && selected && occupant) {
      return getSoulLinkTargets(game.state, selected.id).some((target) => target.id === occupant.id)
        ? this.midpoint(game.center(selected.coord), game.center(coord))
        : null;
    }

    if (game.mode === 'curse-target' && selected && occupant) {
      return getCurseTargets(game.state, selected.id).some((target) => target.id === occupant.id)
        ? this.midpoint(game.center(selected.coord), game.center(coord))
        : null;
    }

    if (game.mode === 'displace-destination' && selected && game.displaceTargetId) {
      const target = findUnit(game.state, game.displaceTargetId);
      const legal = getDisplaceDestinations(game.state, selected.id, game.displaceTargetId)
        .some((destination) => sameCoord(destination, coord));
      return legal && target
        ? this.midpoint(game.center(target.coord), game.center(coord))
        : null;
    }

    return null;
  }

  private canFocusRally(game: PlayerCameraInternals): boolean {
    if (game.animationInProgress || game.state.winner || game.state.currentPlayer !== HUMAN_PLAYER_ID) return false;
    const selected = game.selectedUnitId ? findUnit(game.state, game.selectedUnitId) : undefined;
    return !!selected
      && unitDefinition(selected).ability === 'Rally'
      && getRallyTargets(game.state, selected.id).length > 0;
  }

  private async focusCamera(target: Phaser.Math.Vector2): Promise<void> {
    if (!this.cameraChoreographyEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const camera = this.cameras.main;
    const centerX = camera.worldView.centerX;
    const centerY = camera.worldView.centerY;
    const dx = target.x - centerX;
    const dy = target.y - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance < 18 / camera.zoom) return;

    const desiredDx = dx * CAMERA_FOCUS_STRENGTH;
    const desiredDy = dy * CAMERA_FOCUS_STRENGTH;
    const desiredDistance = Math.hypot(desiredDx, desiredDy);
    const maxWorldShift = CAMERA_MAX_SCREEN_SHIFT / camera.zoom;
    const scale = desiredDistance > maxWorldShift ? maxWorldShift / desiredDistance : 1;

    camera.pan(
      centerX + desiredDx * scale,
      centerY + desiredDy * scale,
      CAMERA_FOCUS_MS,
      'Sine.easeInOut',
      true,
    );

    await new Promise<void>((resolve) => {
      this.time.delayedCall(CAMERA_FOCUS_MS, () => resolve());
    });
  }

  private midpoint(a: Phaser.Math.Vector2, b: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  private loadCameraPreference(): boolean {
    try {
      return window.localStorage.getItem(CAMERA_CHOREOGRAPHY_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  }
}
