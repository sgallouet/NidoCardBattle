import Phaser from 'phaser';
import type { Coord, GameState, SiteState } from '../data/types';
import { sameCoord } from './engine';
import './CaptureHint.css';

const CAPTURE_HINT_STORAGE_KEY = 'nidocardbattle.captureHintCompleted';

interface CaptureHintGame {
  state: GameState;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

export class CaptureHint {
  private root?: HTMLElement;
  private activeSiteId?: string;
  private completed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: CaptureHintGame,
  ) {
    try {
      this.completed = window.localStorage.getItem(CAPTURE_HINT_STORAGE_KEY) === 'true';
    } catch {
      this.completed = false;
    }
  }

  install(): void {
    this.sync();
  }

  sync(): void {
    if (this.completed || this.game.state.winner) return this.hide();

    if (this.activeSiteId) {
      const active = this.game.state.sites.find((site) => site.id === this.activeSiteId);
      if (active?.owner === 1) {
        this.complete();
        return;
      }
    }

    if (this.game.state.currentPlayer !== 1) return this.hide();
    if (document.querySelector('#app')?.classList.contains('match-intro-active')) return this.hide();

    const site = this.findCapturableOccupiedSite();
    if (!site) return this.hide();

    if (this.activeSiteId !== site.id || !this.root) this.show(site);
    else this.position(site.coord);
  }

  destroy(): void {
    this.hide();
  }

  private findCapturableOccupiedSite(): SiteState | undefined {
    return this.game.state.sites.find((site) => {
      if (site.owner === 1) return false;
      return this.game.state.units.some((unit) => unit.owner === 1 && sameCoord(unit.coord, site.coord));
    });
  }

  private show(site: SiteState): void {
    this.hide();
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    const root = document.createElement('aside');
    root.className = 'capture-ftue-hint';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <span class="capture-ftue-kicker">Capture ready</span>
      <strong></strong>
      <span class="capture-ftue-copy">End your turn while your unit is here to take control.</span>`;
    const name = site.type === 'keep' ? 'Keep' : site.type === 'fort' ? 'Fort' : 'Mana Well';
    root.querySelector<HTMLElement>('strong')!.textContent = `Take this ${name}`;
    app.append(root);
    this.root = root;
    this.activeSiteId = site.id;
    document.querySelector('#end-turn-button')?.classList.add('capture-ftue-end-turn');
    this.position(site.coord);
    requestAnimationFrame(() => root.classList.add('is-visible'));
  }

  private position(coord: Coord): void {
    if (!this.root) return;
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;
    const appRect = app.getBoundingClientRect();
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const world = this.game.center(coord);
    const camera = this.scene.cameras.main;
    const x = canvasRect.left - appRect.left + camera.x + (world.x - camera.worldView.x) * camera.zoom;
    const y = canvasRect.top - appRect.top + camera.y + (world.y - camera.worldView.y) * camera.zoom;
    const width = this.root.getBoundingClientRect().width || 240;
    const left = Phaser.Math.Clamp(x - width / 2, 12, Math.max(12, appRect.width - width - 12));
    const top = Phaser.Math.Clamp(y - 132, 70, Math.max(70, appRect.height - 150));
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  private hide(): void {
    this.root?.remove();
    this.root = undefined;
    this.activeSiteId = undefined;
    document.querySelector('#end-turn-button')?.classList.remove('capture-ftue-end-turn');
  }

  private complete(): void {
    this.completed = true;
    try {
      window.localStorage.setItem(CAPTURE_HINT_STORAGE_KEY, 'true');
    } catch {
      // The current match can continue without persistence.
    }
    this.hide();
  }
}
