import Phaser from 'phaser';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { Coord, GameState, UnitState } from '../data/types';
import { loadingScreen } from './LoadingScreen';
import './FirstTurnGuide.css';

const FIRST_TURN_GUIDE_STORAGE_KEY = 'nidocardbattle.firstTurnGuideCompleted';

type GuideStep = 'card' | 'move' | 'end-turn';

export interface FirstTurnGuideSceneInternals {
  state: GameState;
  message: string;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

export class FirstTurnGuide {
  private root?: HTMLElement;
  private beacon?: HTMLElement;
  private step: GuideStep = 'card';
  private active = false;
  private destroyed = false;
  private initialHandCount: number;
  private frame: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: FirstTurnGuideSceneInternals,
  ) {
    this.initialHandCount = game.state.players[1].hand.length;
  }

  install(): void {
    if (this.isCompleted()) return;
    void this.startWhenReady();
  }

  sync(): void {
    if (!this.active || this.destroyed) return;
    const state = this.game.state;

    if (this.step === 'card' && state.players[1].hand.length < this.initialHandCount) {
      this.step = 'move';
    }
    if (this.step === 'move' && state.units.some((unit) => unit.owner === 1 && unit.moved)) {
      this.step = 'end-turn';
    }
    if (this.step === 'end-turn' && state.currentPlayer !== 1) {
      this.complete();
      return;
    }

    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    this.active = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.clearTargets();
    this.root?.remove();
    this.root = undefined;
    this.beacon?.remove();
    this.beacon = undefined;
  }

  private async startWhenReady(): Promise<void> {
    await loadingScreen.whenBattlefieldReady();
    while (!this.destroyed && document.querySelector('#app')?.classList.contains('match-intro-active')) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (this.destroyed || this.isCompleted()) return;

    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;
    const root = document.createElement('aside');
    root.className = 'first-turn-guide';
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <span class="first-turn-guide-step"></span>
      <strong class="first-turn-guide-title"></strong>
      <span class="first-turn-guide-copy"></span>`;
    app.append(root);
    this.root = root;

    const beacon = document.createElement('div');
    beacon.className = 'first-turn-guide-beacon';
    beacon.setAttribute('aria-hidden', 'true');
    app.append(beacon);
    this.beacon = beacon;

    this.active = true;
    this.render();
    this.frame = requestAnimationFrame(this.positionLoop);
  }

  private render(): void {
    if (!this.root) return;
    this.clearTargets();

    const step = this.root.querySelector<HTMLElement>('.first-turn-guide-step');
    const title = this.root.querySelector<HTMLElement>('.first-turn-guide-title');
    const copy = this.root.querySelector<HTMLElement>('.first-turn-guide-copy');
    if (!step || !title || !copy) return;

    if (this.step === 'card') {
      step.textContent = '1 / 3';
      title.textContent = 'Play a card';
      const targeting = document.querySelector('#hand')?.classList.contains('targeting') ?? false;
      copy.textContent = targeting
        ? 'Now choose a highlighted hex.'
        : 'Choose a glowing card you can afford.';
      if (!targeting) this.highlightPlayableCards();
      this.setBeaconVisible(false);
      this.positionGuide();
      return;
    }

    if (this.step === 'move') {
      step.textContent = '2 / 3';
      title.textContent = 'Move a unit';
      const unitSelected = / selected\.$/i.test(this.game.message);
      copy.textContent = unitSelected
        ? 'Choose a blue highlighted hex.'
        : 'Select one of your ready units.';
      this.setBeaconVisible(!unitSelected);
      this.positionGuide();
      return;
    }

    step.textContent = '3 / 3';
    title.textContent = 'End your turn';
    copy.textContent = 'End the turn and watch the enemy respond.';
    document.querySelector<HTMLButtonElement>('#end-turn-button')?.classList.add('ftue-end-turn-target');
    this.setBeaconVisible(false);
    this.positionGuide();
  }

  private highlightPlayableCards(): void {
    const mana = this.game.state.players[1].mana;
    for (const button of document.querySelectorAll<HTMLButtonElement>('.card[data-hand-index]')) {
      const index = Number(button.dataset.handIndex);
      const cardId = this.game.state.players[1].hand[index] as CardDefinitionId | undefined;
      if (!cardId) continue;
      const card = CARD_DEFINITIONS[cardId];
      const blocked = button.disabled || button.getAttribute('aria-disabled') === 'true';
      if (!blocked && card.cost <= mana) button.classList.add('ftue-card-target');
    }
  }

  private clearTargets(): void {
    for (const card of document.querySelectorAll('.ftue-card-target')) card.classList.remove('ftue-card-target');
    document.querySelector('#end-turn-button')?.classList.remove('ftue-end-turn-target');
  }

  private readonly positionLoop = (): void => {
    this.frame = null;
    if (!this.active || this.destroyed) return;
    if (this.step === 'move' && this.beacon && !this.beacon.hidden) this.positionBeacon();
    this.positionGuide();
    this.frame = requestAnimationFrame(this.positionLoop);
  };

  private positionGuide(): void {
    const root = this.root;
    const app = document.querySelector<HTMLElement>('#app');
    if (!root || !app) return;
    const appRect = app.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0) return;

    if (this.step === 'card') {
      const target = document.querySelector<HTMLElement>('.ftue-card-target') ?? document.querySelector<HTMLElement>('#hand');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      this.placeAbove(
        rect.left + rect.width / 2 - appRect.left,
        rect.top - appRect.top,
        rootRect,
        appRect,
      );
      return;
    }

    if (this.step === 'end-turn') {
      const target = document.querySelector<HTMLElement>('#end-turn-button');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      this.placeAbove(
        rect.left + rect.width / 2 - appRect.left,
        rect.top - appRect.top,
        rootRect,
        appRect,
      );
      return;
    }

    const unit = this.guideUnit();
    if (!unit) return;
    const point = this.unitViewportPoint(unit);
    const x = point.x - appRect.left;
    const y = point.y - appRect.top;
    const gap = 52;
    const fitsRight = x + gap + rootRect.width <= appRect.width - 10;
    const left = fitsRight ? x + gap : x - gap - rootRect.width;
    const top = y - rootRect.height / 2;
    root.dataset.placement = fitsRight ? 'right' : 'left';
    root.style.left = `${Math.round(Phaser.Math.Clamp(left, 10, appRect.width - rootRect.width - 10))}px`;
    root.style.top = `${Math.round(Phaser.Math.Clamp(top, 10, appRect.height - rootRect.height - 10))}px`;
  }

  private placeAbove(
    anchorX: number,
    anchorTop: number,
    rootRect: DOMRect,
    appRect: DOMRect,
  ): void {
    const left = anchorX - rootRect.width / 2;
    const top = anchorTop - rootRect.height - 14;
    this.root!.dataset.placement = 'above';
    this.root!.style.left = `${Math.round(Phaser.Math.Clamp(left, 10, appRect.width - rootRect.width - 10))}px`;
    this.root!.style.top = `${Math.round(Phaser.Math.Clamp(top, 10, appRect.height - rootRect.height - 10))}px`;
  }

  private positionBeacon(): void {
    if (!this.beacon) return;
    const unit = this.guideUnit();
    if (!unit) {
      this.beacon.hidden = true;
      return;
    }

    const point = this.unitViewportPoint(unit);
    this.beacon.style.left = `${Math.round(point.x)}px`;
    this.beacon.style.top = `${Math.round(point.y)}px`;
  }

  private guideUnit(): UnitState | undefined {
    return this.game.state.units.find((candidate) =>
      candidate.owner === 1
      && candidate.definitionId !== 'commander'
      && !candidate.exhausted
      && !candidate.moved)
      ?? this.game.state.units.find((candidate) => candidate.owner === 1 && !candidate.exhausted && !candidate.moved);
  }

  private unitViewportPoint(unit: UnitState): { x: number; y: number } {
    const world = this.game.center(unit.coord);
    const camera = this.scene.cameras.main;
    const canvas = this.scene.game.canvas.getBoundingClientRect();
    return {
      x: canvas.left + camera.x + (world.x - camera.worldView.x) * camera.zoom,
      y: canvas.top + camera.y + (world.y - camera.worldView.y) * camera.zoom,
    };
  }

  private setBeaconVisible(visible: boolean): void {
    if (!this.beacon) return;
    this.beacon.hidden = !visible;
    if (visible) this.positionBeacon();
  }

  private complete(): void {
    try {
      window.localStorage.setItem(FIRST_TURN_GUIDE_STORAGE_KEY, 'true');
    } catch {
      // Completing the live guide matters more than persistence if storage is unavailable.
    }
    this.active = false;
    this.clearTargets();
    this.beacon?.remove();
    this.beacon = undefined;
    this.root?.classList.add('is-complete');
    window.setTimeout(() => {
      this.root?.remove();
      this.root = undefined;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 320);
  }

  private isCompleted(): boolean {
    try {
      return window.localStorage.getItem(FIRST_TURN_GUIDE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
