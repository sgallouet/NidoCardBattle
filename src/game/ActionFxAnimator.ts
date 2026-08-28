import Phaser from 'phaser';
import type { Coord, PlayerId } from '../data/types';
import type { AnimatedUnitView } from './UnitMotionAnimator';

const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x55b9f3, 2: 0xf05b67 };

export class ActionFxAnimator {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: () => Phaser.GameObjects.Container | undefined,
    private readonly center: (coord: Coord) => Phaser.Math.Vector2,
  ) {}

  async assistHit(coord: Coord, damage: number): Promise<void> {
    const point = this.center(coord);
    const ring = this.scene.add.graphics();
    ring.lineStyle(damage >= 2 ? 5 : 3, damage >= 2 ? 0xffd86f : 0xf4f0dd, 0.94);
    ring.strokeCircle(point.x, point.y, damage >= 2 ? 27 : 22);
    this.board()?.add(ring);

    const label = this.scene.add.text(point.x, point.y - 50, `ASSIST +${damage}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: damage >= 2 ? '13px' : '11px',
      color: damage >= 2 ? '#ffe89b' : '#fffdf0',
      fontStyle: 'bold',
      stroke: '#161a16',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.board()?.add(label);

    this.scene.tweens.add({ targets: ring, alpha: 0, scaleX: 1.45, scaleY: 1.45, duration: 150, onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: label, y: label.y - 17, alpha: 0, duration: 300, onComplete: () => label.destroy() });
    await this.wait(75);
  }

  async summon(view: AnimatedUnitView, owner: PlayerId): Promise<void> {
    const point = new Phaser.Math.Vector2(view.container.x, view.container.y);
    view.container.setAlpha(0).setScale(0.55);
    const ring = this.scene.add.graphics();
    ring.lineStyle(4, PLAYER_COLORS[owner], 0.9);
    ring.strokeCircle(point.x, point.y + 14, 25);
    this.board()?.add(ring);
    this.scene.tweens.add({ targets: ring, alpha: 0, scaleX: 1.65, scaleY: 1.65, duration: 260, onComplete: () => ring.destroy() });
    await this.tween(view.container, { alpha: 1, scaleX: 1.08, scaleY: 1.08, y: point.y - 4 }, 180, 'Back.easeOut');
    await this.tween(view.container, { scaleX: 1, scaleY: 1, y: point.y }, 90, 'Quad.easeIn');
  }

  async tacticPulse(coord: Coord, owner: PlayerId): Promise<void> {
    const point = this.center(coord);
    const ring = this.scene.add.graphics();
    ring.lineStyle(4, PLAYER_COLORS[owner], 0.9);
    ring.strokeCircle(point.x, point.y, 18);
    this.board()?.add(ring);
    this.scene.tweens.add({ targets: ring, alpha: 0, scaleX: 2.1, scaleY: 2.1, duration: 260, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    await this.wait(230);
  }

  private tween(target: Phaser.GameObjects.GameObject, values: Record<string, number>, duration: number, ease: string): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: target, ...values, duration, ease, onComplete: () => resolve() });
    });
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }
}
