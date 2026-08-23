import Phaser from 'phaser';

export type TacticalHexFxKind = 'move' | 'attack' | 'deploy' | 'spell';

interface TacticalHexFxPalette {
  fill: number;
  glow: number;
  core: number;
  hot: number;
}

interface TacticalHexFxEntry {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  core: Phaser.GameObjects.Graphics;
  tracer: Phaser.GameObjects.Graphics;
  glyph: Phaser.GameObjects.Graphics;
  points: Phaser.Geom.Point[];
  palette: TacticalHexFxPalette;
  phase: number;
  hovered: boolean;
}

const PALETTES: Record<TacticalHexFxKind, TacticalHexFxPalette> = {
  move: { fill: 0x1bd8c1, glow: 0x18e0cb, core: 0x79ffe8, hot: 0xe5fffb },
  attack: { fill: 0xff6a36, glow: 0xff7c24, core: 0xffbd45, hot: 0xfff0ad },
  deploy: { fill: 0xe9ad32, glow: 0xffb82f, core: 0xffdc72, hot: 0xfff5be },
  spell: { fill: 0x8438ff, glow: 0xa23fff, core: 0xe16dff, hot: 0xffdcff },
};

const samplePerimeter = (points: Phaser.Geom.Point[], progress: number): Phaser.Math.Vector2 => {
  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * points.length;
  const index = Math.floor(scaled) % points.length;
  const next = (index + 1) % points.length;
  const amount = scaled - Math.floor(scaled);
  return new Phaser.Math.Vector2(
    Phaser.Math.Linear(points[index].x, points[next].x, amount),
    Phaser.Math.Linear(points[index].y, points[next].y, amount),
  );
};

/** Presentation-only tactical range lighting. Gameplay owns every highlighted coordinate. */
export class TacticalHexFxLayer {
  readonly container: Phaser.GameObjects.Container;
  private readonly effects = new Map<string, TacticalHexFxEntry>();
  private elapsed = 0;
  private lastTracerFrame = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    this.container = scene.add.container(0, 0).setDepth(depth);
    scene.events.on('update', this.handleUpdate);
  }

  add(
    key: string,
    center: Phaser.Math.Vector2,
    worldPoints: Phaser.Geom.Point[],
    kind: TacticalHexFxKind,
    phase: number,
  ): void {
    const palette = PALETTES[kind];
    const points = worldPoints.map((point) => new Phaser.Geom.Point(point.x - center.x, point.y - center.y));
    const effectContainer = this.scene.add.container(center.x, center.y);
    const glow = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const core = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const tracer = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const glyph = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    glow.fillStyle(palette.fill, 0.09);
    glow.fillPoints(points, true);
    glow.lineStyle(14, palette.glow, 0.11);
    glow.strokePoints(points, true);
    glow.lineStyle(7, palette.glow, 0.18);
    glow.strokePoints(points, true);

    core.lineStyle(3.2, palette.core, 0.88);
    core.strokePoints(points, true);
    core.lineStyle(1.1, palette.hot, 0.95);
    core.strokePoints(points, true);
    for (const point of points) {
      core.fillStyle(palette.hot, 0.9);
      core.fillCircle(point.x, point.y, 2.1);
    }

    this.drawGlyph(glyph, kind, palette);
    effectContainer.add([glow, core, glyph, tracer]);
    effectContainer.setAlpha(0);
    this.container.add(effectContainer);
    this.effects.set(key, {
      container: effectContainer,
      glow,
      core,
      tracer,
      glyph,
      points,
      palette,
      phase,
      hovered: false,
    });

    this.scene.tweens.add({
      targets: effectContainer,
      alpha: 1,
      duration: 180,
      ease: 'Cubic.Out',
    });
  }

  setHovered(key: string, hovered: boolean): void {
    const effect = this.effects.get(key);
    if (effect) effect.hovered = hovered;
  }

  destroy(): void {
    this.scene.events.off('update', this.handleUpdate);
    this.effects.clear();
    if (this.container.active) this.container.destroy(true);
  }

  private readonly handleUpdate = (_time: number, delta: number): void => {
    this.elapsed += Math.min(delta, 50);
    const seconds = this.elapsed / 1000;
    const tracerFrame = Math.floor(this.elapsed / 34);
    const redrawTracers = tracerFrame !== this.lastTracerFrame;
    this.lastTracerFrame = tracerFrame;

    for (const effect of this.effects.values()) {
      if (!effect.container.active) continue;
      const breath = 0.5 + Math.sin(seconds * 2.8 + effect.phase) * 0.5;
      const hover = effect.hovered ? 1 : 0;
      effect.container.setScale(1 + breath * 0.006 + hover * 0.016);
      effect.glow.setAlpha(0.58 + breath * 0.32 + hover * 0.22);
      effect.core.setAlpha(0.72 + breath * 0.22 + hover * 0.18);
      effect.glyph.setAlpha(0.28 + breath * 0.16 + hover * 0.24);
      if (redrawTracers) this.drawTracer(effect, seconds);
    }
  };

  private drawTracer(effect: TacticalHexFxEntry, seconds: number): void {
    const progress = seconds * 0.22 + effect.phase / (Math.PI * 2);
    const tail = samplePerimeter(effect.points, progress - 0.038);
    const head = samplePerimeter(effect.points, progress);
    effect.tracer.clear();
    effect.tracer.lineStyle(effect.hovered ? 5 : 3.5, effect.palette.hot, effect.hovered ? 0.95 : 0.82);
    effect.tracer.lineBetween(tail.x, tail.y, head.x, head.y);
    effect.tracer.fillStyle(0xffffff, 0.98);
    effect.tracer.fillCircle(head.x, head.y, effect.hovered ? 3.2 : 2.5);
    effect.tracer.lineStyle(9, effect.palette.glow, effect.hovered ? 0.26 : 0.16);
    effect.tracer.lineBetween(tail.x, tail.y, head.x, head.y);
  }

  private drawGlyph(
    graphics: Phaser.GameObjects.Graphics,
    kind: TacticalHexFxKind,
    palette: TacticalHexFxPalette,
  ): void {
    if (kind === 'move') {
      graphics.fillStyle(palette.hot, 0.72);
      graphics.fillCircle(-8, 5, 1.8);
      graphics.fillCircle(0, 1, 2.2);
      graphics.fillCircle(9, -5, 2.7);
      return;
    }

    if (kind === 'attack') {
      graphics.lineStyle(2, palette.hot, 0.78);
      graphics.strokeCircle(0, 0, 10);
      graphics.strokeCircle(0, 0, 4);
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        graphics.lineBetween(Math.cos(angle) * 13, Math.sin(angle) * 13, Math.cos(angle) * 19, Math.sin(angle) * 19);
      }
      graphics.fillStyle(0xff4238, 0.88);
      graphics.fillCircle(0, 0, 2.6);
      return;
    }

    if (kind === 'spell') {
      graphics.lineStyle(2.2, palette.hot, 0.78);
      graphics.strokeEllipse(0, 0, 28, 15);
      graphics.strokeCircle(0, 0, 5.5);
      graphics.fillStyle(palette.hot, 0.9);
      graphics.fillCircle(0, 0, 2.2);
      return;
    }

    graphics.lineStyle(2, palette.hot, 0.76);
    graphics.strokePoints([
      new Phaser.Geom.Point(0, -15),
      new Phaser.Geom.Point(13, 0),
      new Phaser.Geom.Point(0, 15),
      new Phaser.Geom.Point(-13, 0),
    ], true);
    graphics.lineBetween(-7, 4, 0, -3);
    graphics.lineBetween(0, -3, 7, 4);
    graphics.lineBetween(-7, 10, 0, 3);
    graphics.lineBetween(0, 3, 7, 10);
  }
}
