import Phaser from 'phaser';
import type { Coord, GameState, SiteState } from '../data/types';
import { sameCoord } from './engine';
import './CaptureHint.css';

const CAPTURE_HINT_STORAGE_KEY = 'nidocardbattle.captureHintCompleted';
const CAPTURE_MARKER_DEPTH = 997;

interface CaptureHintGame {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

export class CaptureHint {
  private marker?: Phaser.GameObjects.Container;
  private markerPulse?: Phaser.GameObjects.Graphics;
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

    if (this.activeSiteId !== site.id || !this.marker?.active) this.show(site);
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
    const center = this.game.center(site.coord);
    const marker = this.scene.add.container(center.x, center.y).setDepth(CAPTURE_MARKER_DEPTH);

    const pulse = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    pulse.lineStyle(4, 0xf6cf66, 0.48);
    pulse.strokeCircle(0, 0, 37);
    pulse.lineStyle(9, 0x66dcff, 0.12);
    pulse.strokeCircle(0, 0, 37);

    const ring = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(2.5, 0xffe9a2, 0.92);
    ring.strokeCircle(0, 0, 34);
    ring.lineStyle(1, 0x66dcff, 0.72);
    ring.strokeCircle(0, 0, 41);
    for (let index = 0; index < 4; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 90 - 45);
      ring.fillStyle(0xffe9a2, 0.9);
      ring.fillCircle(Math.cos(angle) * 41, Math.sin(angle) * 41, 2.2);
    }

    const flag = this.scene.add.graphics();
    flag.lineStyle(3, 0xffefb4, 0.95);
    flag.lineBetween(-2, -50, -2, -22);
    flag.fillStyle(0xf1bf47, 0.96);
    flag.fillTriangle(0, -49, 18, -43, 0, -35);
    flag.lineStyle(1, 0xfff2bd, 0.8);
    flag.strokeTriangle(0, -49, 18, -43, 0, -35);

    marker.add([pulse, ring, flag]);
    this.game.boardLayer?.add(marker);
    this.game.boardLayer?.sort('depth');
    this.marker = marker;
    this.markerPulse = pulse;
    this.activeSiteId = site.id;
    document.querySelector('#end-turn-button')?.classList.add('capture-ftue-end-turn');

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.scene.tweens.add({
        targets: pulse,
        alpha: 0.12,
        scaleX: 1.34,
        scaleY: 1.34,
        duration: 820,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private hide(): void {
    if (this.markerPulse) this.scene.tweens.killTweensOf(this.markerPulse);
    this.marker?.destroy(true);
    this.marker = undefined;
    this.markerPulse = undefined;
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
