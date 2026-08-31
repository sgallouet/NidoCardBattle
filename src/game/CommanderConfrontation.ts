import Phaser from 'phaser';
import { UNIT_ART } from '../data/unitArt';
import type { Coord, GameState, UnitState } from '../data/types';
import './CommanderConfrontation.css';

interface CommanderConfrontationGame {
  state: GameState;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

const ENEMY_LINE_HOLD_MS = 3400;
const FRIENDLY_LINE_HOLD_MS = 2300;
const COMMANDER_RENDER_SCALE = 1.12;
const BUBBLE_UNIT_GAP_PX = 18;
const BUBBLE_EDGE_GAP_PX = 8;

export class CommanderConfrontation {
  private bubble?: HTMLElement;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: CommanderConfrontationGame,
  ) {}

  async play(enemy: UnitState, friendly: UnitState): Promise<void> {
    if (this.destroyed) return;
    const camera = this.scene.cameras.main;
    const returnView: CameraSnapshot = {
      x: camera.worldView.centerX,
      y: camera.worldView.centerY,
      zoom: camera.zoom,
    };
    const app = document.querySelector<HTMLElement>('#app');
    app?.classList.add('match-intro-dialogue-active');

    await this.focus(enemy.coord, Math.max(camera.zoom, 1.48), 620);
    if (this.destroyed) return;
    this.showBubble(enemy, 'Enemy Commander', 'Come for me, little hero. Your bones will serve me when this is over.', false);
    await this.wait(ENEMY_LINE_HOLD_MS);
    this.hideBubble();
    await this.wait(140);

    await this.focus(friendly.coord, Math.max(returnView.zoom, 1.42), 560);
    if (this.destroyed) return;
    this.showBubble(friendly, 'Your Commander', 'Then I’d better end you first.', true);
    await this.wait(FRIENDLY_LINE_HOLD_MS);
    this.hideBubble();
    await this.wait(120);

    camera.pan(returnView.x, returnView.y, 650, 'Sine.easeInOut', true);
    camera.zoomTo(returnView.zoom, 650, 'Sine.easeInOut', true);
    await this.wait(700);
    app?.classList.remove('match-intro-dialogue-active');
  }

  destroy(): void {
    this.destroyed = true;
    this.bubble?.remove();
    this.bubble = undefined;
    document.querySelector<HTMLElement>('#app')?.classList.remove('match-intro-dialogue-active');
  }

  private async focus(coord: Coord, zoom: number, duration: number): Promise<void> {
    const point = this.game.center(coord);
    const camera = this.scene.cameras.main;
    camera.pan(point.x, point.y - 12, duration, 'Sine.easeInOut', true);
    camera.zoomTo(zoom, duration, 'Sine.easeInOut', true);
    await this.wait(duration + 40);
  }

  private showBubble(unit: UnitState, speaker: string, line: string, friendly: boolean): void {
    this.bubble?.remove();
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    const bubble = document.createElement('div');
    bubble.className = `commander-confrontation-bubble${friendly ? ' is-friendly' : ''}`;
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubble.innerHTML = `
      <span class="commander-confrontation-speaker"></span>
      <strong class="commander-confrontation-line"></strong>`;
    bubble.querySelector<HTMLElement>('.commander-confrontation-speaker')!.textContent = speaker;
    bubble.querySelector<HTMLElement>('.commander-confrontation-line')!.textContent = line;
    app.append(bubble);
    this.bubble = bubble;
    this.positionBubble(bubble, unit);
    requestAnimationFrame(() => bubble.classList.add('is-visible'));
  }

  private positionBubble(bubble: HTMLElement, unit: UnitState): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;
    const appRect = app.getBoundingClientRect();
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const world = this.game.center(unit.coord);
    const camera = this.scene.cameras.main;
    const screenX = canvasRect.left - appRect.left + camera.x + (world.x - camera.worldView.x) * camera.zoom;
    const screenY = canvasRect.top - appRect.top + camera.y + (world.y - camera.worldView.y) * camera.zoom;
    const halfWidth = Math.min(150, Math.max(90, appRect.width * .34));
    const x = Phaser.Math.Clamp(screenX, halfWidth + 8, appRect.width - halfWidth - 8);

    const art = UNIT_ART[unit.owner === 1 ? 'humanCommander' : 'undeadCommander'];
    const renderedHeightWorld = art ? art.frameSize * art.scale * COMMANDER_RENDER_SCALE : 64;
    const spriteTopWorld = art
      ? art.offsetY - art.anchorY * renderedHeightWorld
      : -56;
    const spriteBottomWorld = art
      ? art.offsetY + (1 - art.anchorY) * renderedHeightWorld
      : 16;
    const spriteTopY = screenY + spriteTopWorld * camera.zoom;
    const spriteBottomY = screenY + spriteBottomWorld * camera.zoom;
    const bubbleHeight = bubble.getBoundingClientRect().height;
    const aboveAnchorY = spriteTopY - BUBBLE_UNIT_GAP_PX;
    const fitsAbove = aboveAnchorY - bubbleHeight >= BUBBLE_EDGE_GAP_PX;
    const anchorY = fitsAbove
      ? aboveAnchorY
      : spriteBottomY + BUBBLE_UNIT_GAP_PX;

    bubble.style.left = `${Math.round(x)}px`;
    bubble.style.top = `${Math.round(anchorY)}px`;
    bubble.classList.toggle('is-below', !fitsAbove);
  }

  private hideBubble(): void {
    const bubble = this.bubble;
    if (!bubble) return;
    bubble.classList.remove('is-visible');
    window.setTimeout(() => bubble.remove(), 180);
    this.bubble = undefined;
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }
}
