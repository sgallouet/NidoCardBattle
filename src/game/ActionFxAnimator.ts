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

  async displace(view: AnimatedUnitView, destination: Coord): Promise<void> {
    const target = this.center(destination);
    const ghost = this.scene.add.graphics();
    ghost.lineStyle(3, 0x86e5ff, 0.72);
    ghost.strokeCircle(view.container.x, view.container.y, 24);
    this.board()?.add(ghost);
    this.scene.tweens.add({ targets: ghost, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 220, onComplete: () => ghost.destroy() });

    await this.tween(view.container, { alpha: 0.55, scaleX: 0.82, scaleY: 1.12 }, 70, 'Quad.easeIn');
    await this.tween(view.container, { x: target.x, y: target.y, alpha: 0.82, scaleX: 1.14, scaleY: 0.9 }, 145, 'Expo.easeOut');
    await this.tween(view.container, { alpha: 1, scaleX: 1, scaleY: 1 }, 85, 'Back.easeOut');
  }

  async rally(actor: Coord, targets: Coord[], owner: PlayerId): Promise<void> {
    const point = this.center(actor);
    const color = PLAYER_COLORS[owner];
    const ring = this.scene.add.graphics();
    ring.lineStyle(5, 0xffd774, 0.92);
    ring.strokeCircle(point.x, point.y, 15);
    this.board()?.add(ring);
    this.scene.tweens.add({ targets: ring, alpha: 0, scaleX: 4, scaleY: 4, duration: 300, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

    for (const coord of targets) {
      const target = this.center(coord);
      const pulse = this.scene.add.graphics();
      pulse.lineStyle(3, color, 0.9);
      pulse.strokeCircle(target.x, target.y, 28);
      this.board()?.add(pulse);
      this.scene.tweens.add({ targets: pulse, alpha: 0, scaleX: 1.35, scaleY: 1.35, duration: 270, onComplete: () => pulse.destroy() });
    }
    await this.wait(280);
  }

  async soulLink(from: Coord, to: Coord): Promise<void> {
    const start = this.center(from);
    const end = this.center(to);
    const beam = this.scene.add.graphics();
    beam.lineStyle(8, 0x8c50c9, 0.28);
    beam.lineBetween(start.x, start.y - 8, end.x, end.y - 8);
    beam.lineStyle(3, 0xe3c5ff, 0.95);
    beam.lineBetween(start.x, start.y - 8, end.x, end.y - 8);
    this.board()?.add(beam);
    this.scene.tweens.add({ targets: beam, alpha: 0.12, duration: 160, yoyo: true, repeat: 1, onComplete: () => beam.destroy() });
    await this.wait(300);
  }

  async curse(coord: Coord): Promise<void> {
    const point = this.center(coord);
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(4, 0xb76cff, 0.95);
    for (let index = 0; index < 4; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 90 + 45);
      graphics.strokeCircle(point.x + Math.cos(angle) * 28, point.y + Math.sin(angle) * 20, 6);
    }
    graphics.strokeCircle(point.x, point.y, 31);
    this.board()?.add(graphics);
    this.scene.tweens.add({ targets: graphics, alpha: 0, scaleX: 0.72, scaleY: 0.72, duration: 300, ease: 'Cubic.easeIn', onComplete: () => graphics.destroy() });
    await this.wait(260);
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
