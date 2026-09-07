import Phaser from 'phaser';
import type { Coord, GameState } from '../data/types';

export interface CommanderObjectiveFxSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

export class CommanderObjectiveFx {
  private container?: Phaser.GameObjects.Container;
  private glow?: Phaser.GameObjects.Graphics;
  private ring?: Phaser.GameObjects.Graphics;
  private orbit?: Phaser.GameObjects.Graphics;
  private pulseTween?: Phaser.Tweens.Tween;
  private orbitTween?: Phaser.Tweens.Tween;
  private lastKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: CommanderObjectiveFxSceneInternals,
  ) {}

  sync(): void {
    const countdown = this.game.state.countdown;
    if (!countdown || this.game.state.winner) {
      this.hide();
      return;
    }

    const commander = this.game.state.units.find((unit) =>
      unit.owner === countdown.player && unit.definitionId === 'commander');
    if (!commander) {
      this.hide();
      return;
    }

    this.ensureFx();
    if (!this.container) return;

    const center = this.game.center(commander.coord);
    this.container.setPosition(center.x, center.y);
    this.container.setVisible(true);

    const key = `${countdown.player}:${countdown.checkpoints}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.redraw(countdown.player, countdown.checkpoints);
      this.presentCheckpointPulse(countdown.player);
    }
  }

  destroy(): void {
    this.pulseTween?.stop();
    this.orbitTween?.stop();
    this.pulseTween = undefined;
    this.orbitTween = undefined;
    this.container?.destroy(true);
    this.container = undefined;
    this.glow = undefined;
    this.ring = undefined;
    this.orbit = undefined;
    this.lastKey = '';
  }

  private hide(): void {
    this.container?.setVisible(false);
    this.lastKey = '';
  }

  private ensureFx(): void {
    if (this.container) return;
    const boardLayer = this.game.boardLayer;
    if (!boardLayer) return;

    const container = this.scene.add.container(0, 0).setDepth(999.5);
    const glow = this.scene.add.graphics();
    const ring = this.scene.add.graphics();
    const orbit = this.scene.add.graphics();
    container.add([glow, ring, orbit]);
    boardLayer.add(container);

    this.container = container;
    this.glow = glow;
    this.ring = ring;
    this.orbit = orbit;

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.pulseTween = this.scene.tweens.add({
        targets: container,
        scaleX: 1.055,
        scaleY: 1.055,
        alpha: 0.82,
        duration: 820,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
      this.orbitTween = this.scene.tweens.add({
        targets: orbit,
        angle: 360,
        duration: 7200,
        ease: 'Linear',
        repeat: -1,
      });
    }
  }

  private redraw(player: 1 | 2, checkpoints: number): void {
    const glow = this.glow;
    const ring = this.ring;
    const orbit = this.orbit;
    if (!glow || !ring || !orbit) return;

    const friendly = player === 1;
    const color = friendly ? 0x67dcff : 0xff6677;
    const pale = friendly ? 0xd9f8ff : 0xffdce1;

    glow.clear();
    glow.fillStyle(color, friendly ? 0.08 : 0.095);
    glow.fillCircle(0, 2, 43);
    glow.lineStyle(7, color, friendly ? 0.08 : 0.1);
    glow.strokeCircle(0, 2, 36);

    ring.clear();
    ring.lineStyle(2, color, 0.32);
    ring.strokeCircle(0, 2, 33);
    ring.lineStyle(1, pale, 0.16);
    ring.strokeCircle(0, 2, 39);

    for (let index = 0; index < 3; index += 1) {
      const angle = Phaser.Math.DegToRad(-90 + index * 120);
      const x = Math.cos(angle) * 33;
      const y = 2 + Math.sin(angle) * 33;
      const complete = index < checkpoints;
      ring.fillStyle(complete ? pale : 0x081116, complete ? 0.98 : 0.78);
      ring.fillCircle(x, y, complete ? 4.6 : 3.6);
      ring.lineStyle(complete ? 2 : 1, color, complete ? 0.95 : 0.5);
      ring.strokeCircle(x, y, complete ? 5.8 : 4.7);
    }

    orbit.clear();
    orbit.lineStyle(2, pale, friendly ? 0.34 : 0.42);
    orbit.beginPath();
    orbit.arc(0, 2, 43, Phaser.Math.DegToRad(-12), Phaser.Math.DegToRad(42), false);
    orbit.strokePath();
    orbit.beginPath();
    orbit.arc(0, 2, 43, Phaser.Math.DegToRad(168), Phaser.Math.DegToRad(204), false);
    orbit.strokePath();
  }

  private presentCheckpointPulse(player: 1 | 2): void {
    const container = this.container;
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const color = player === 1 ? 0x67dcff : 0xff6677;
    const pulse = this.scene.add.graphics();
    pulse.lineStyle(3, color, 0.9);
    pulse.strokeCircle(0, 2, 31);
    container.addAt(pulse, 0);
    this.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.72,
      scaleY: 1.72,
      duration: 560,
      ease: 'Cubic.easeOut',
      onComplete: () => pulse.destroy(),
    });
  }
}
