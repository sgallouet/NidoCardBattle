import type Phaser from 'phaser';
import { FACTION_CURSOR_ART } from '../data/cursorArt';
import type { GameState } from '../data/types';

export interface FactionCursorSceneInternals {
  state: GameState;
  renderHud: () => void;
}

export class FactionCursor {
  private app?: HTMLElement;
  private pressed = false;
  private pointerDown?: { id: number; x: number; y: number };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    this.pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.pressed = true;
    this.sync();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown || event.pointerId !== this.pointerDown.id) return;
    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y,
    );
    if (distance < 7) this.showClickFx(event.clientX, event.clientY);
    this.release();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pointerDown && event.pointerId === this.pointerDown.id) this.release();
  };

  private readonly handleWindowBlur = (): void => this.release();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: FactionCursorSceneInternals,
  ) {}

  install(): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    this.app = app;
    const originalRenderHud = this.game.renderHud.bind(this.scene);
    this.game.renderHud = () => {
      originalRenderHud();
      this.sync();
    };
    app.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);
    window.addEventListener('blur', this.handleWindowBlur);
    this.sync();

    this.scene.events.once('shutdown', () => this.destroy());
  }

  private sync(): void {
    if (!this.app) return;
    const faction = this.game.state.players[this.game.state.currentPlayer].faction;
    const art = FACTION_CURSOR_ART[faction];
    const pose = this.pressed ? art.pressed : art.idle;
    const [hotspotX, hotspotY] = pose.hotspot;
    this.app.style.setProperty(
      '--faction-cursor',
      `url(${JSON.stringify(pose.url)}) ${hotspotX} ${hotspotY}, auto`,
    );
    this.app.dataset.cursorFaction = faction;
    this.app.dataset.cursorState = this.pressed ? 'pressed' : 'idle';
  }

  private showClickFx(clientX: number, clientY: number): void {
    if (!this.app) return;
    const faction = this.game.state.players[this.game.state.currentPlayer].faction;
    const [primary, secondary] = FACTION_CURSOR_ART[faction].fx;
    const bounds = this.app.getBoundingClientRect();
    const effect = document.createElement('span');
    effect.className = 'cursor-click-fx';
    effect.setAttribute('aria-hidden', 'true');
    effect.style.left = `${clientX - bounds.left}px`;
    effect.style.top = `${clientY - bounds.top}px`;
    effect.style.setProperty('--cursor-fx-primary', primary);
    effect.style.setProperty('--cursor-fx-secondary', secondary);
    effect.addEventListener('animationend', () => effect.remove(), { once: true });
    this.app.append(effect);
  }

  private release(): void {
    if (!this.pressed && !this.pointerDown) return;
    this.pressed = false;
    this.pointerDown = undefined;
    this.sync();
  }

  private destroy(): void {
    this.app?.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerCancel);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.app?.style.removeProperty('--faction-cursor');
    if (this.app) {
      delete this.app.dataset.cursorFaction;
      delete this.app.dataset.cursorState;
    }
    this.app = undefined;
    this.pressed = false;
    this.pointerDown = undefined;
  }
}
