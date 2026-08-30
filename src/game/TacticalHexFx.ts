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
  path?: Phaser.Math.Vector2[];
  palette: TacticalHexFxPalette;
  phase: number;
  hovered: boolean;
}

const PALETTES: Record<TacticalHexFxKind, TacticalHexFxPalette> = {
  move: { fill: 0x168dff, glow: 0x159dff, core: 0x54b9ff, hot: 0xb9e5ff },
  attack: { fill: 0xff243e, glow: 0xff304d, core: 0xff5a6d, hot: 0xffd7dc },
  deploy: { fill: 0xe9ad32, glow: 0xffb82f, core: 0xffdc72, hot: 0xfff5be },
  spell: { fill: 0x8438ff, glow: 0xa23fff, core: 0xe16dff, hot: 0xffdcff },
};
const TRACER_FRAME_MS = 50;

const drawHexCorners = (
  graphics: Phaser.GameObjects.Graphics,
  points: Phaser.Geom.Point[],
  length: number,
): void => {
  for (let index = 0; index < points.length; index += 1) {
    const corner = new Phaser.Math.Vector2(points[index].x, points[index].y);
    const previous = new Phaser.Math.Vector2(
      points[(index + points.length - 1) % points.length].x,
      points[(index + points.length - 1) % points.length].y,
    );
    const next = new Phaser.Math.Vector2(
      points[(index + 1) % points.length].x,
      points[(index + 1) % points.length].y,
    );
    const towardPrevious = previous.subtract(corner).normalize().scale(length).add(corner);
    const towardNext = next.subtract(corner).normalize().scale(length).add(corner);
    graphics.beginPath();
    graphics.moveTo(towardPrevious.x, towardPrevious.y);
    graphics.lineTo(corner.x, corner.y);
    graphics.lineTo(towardNext.x, towardNext.y);
    graphics.strokePath();
  }
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

const samplePath = (points: Phaser.Math.Vector2[], progress: number): Phaser.Math.Vector2 => {
  if (points.length < 2) return points[0]?.clone() ?? new Phaser.Math.Vector2();
  const clamped = Phaser.Math.Clamp(progress, 0, 1);
  const scaled = clamped * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  return points[index].clone().lerp(points[index + 1], scaled - index);
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
    worldPath?: Phaser.Math.Vector2[],
  ): void {
    const palette = PALETTES[kind];
    const points = worldPoints.map((point) => new Phaser.Geom.Point(point.x - center.x, point.y - center.y));
    const effectContainer = this.scene.add.container(center.x, center.y);
    const glow = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const core = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const tracer = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const glyph = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    glow.fillStyle(palette.fill, kind === 'move' ? 0.025 : 0.09);
    glow.fillPoints(points, true);
    if (kind === 'move') {
      glow.lineStyle(8, palette.glow, 0.1);
      drawHexCorners(glow, points, 7);
      core.lineStyle(1.5, palette.core, 0.46);
      drawHexCorners(core, points, 6);
    } else if (kind === 'attack') {
      glow.lineStyle(16, palette.glow, 0.15);
      drawHexCorners(glow, points, 17);
      glow.lineStyle(8, palette.glow, 0.24);
      drawHexCorners(glow, points, 17);
      core.lineStyle(4, palette.core, 0.94);
      drawHexCorners(core, points, 15);
      core.lineStyle(1.25, palette.hot, 1);
      drawHexCorners(core, points, 15);
    } else {
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
    }

    const path = worldPath?.map((point) => point.clone().subtract(center));
    this.drawGlyph(glyph, kind, palette, path);
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
      path,
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
    const tracerFrame = Math.floor(this.elapsed / TRACER_FRAME_MS);
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
    if (effect.path && effect.path.length > 1) {
      this.drawMovementArrows(effect, seconds);
      return;
    }
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

  private drawMovementArrows(effect: TacticalHexFxEntry, seconds: number): void {
    const path = effect.path;
    if (!path) return;
    effect.tracer.clear();
    const cycle = (seconds * 0.48 + effect.phase * 0.035) % 1;
    for (let index = 0; index < 2; index += 1) {
      const delayed = cycle - index * 0.24;
      if (delayed < 0 || delayed > 0.82) continue;
      const progress = 0.14 + delayed / 0.82 * 0.74;
      const tip = samplePath(path, progress);
      const behind = samplePath(path, Math.max(0, progress - 0.035));
      const direction = tip.clone().subtract(behind).normalize();
      const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x);
      const size = effect.hovered ? 7 : 5.5;
      const tail = tip.clone().subtract(direction.clone().scale(size));
      const left = tail.clone().add(perpendicular.clone().scale(size * 0.55));
      const right = tail.clone().subtract(perpendicular.clone().scale(size * 0.55));
      const alpha = (index === 0 ? 0.9 : 0.48) + (effect.hovered ? 0.08 : 0);
      effect.tracer.lineStyle(effect.hovered ? 7 : 5, effect.palette.glow, 0.16);
      effect.tracer.lineBetween(left.x, left.y, tip.x, tip.y);
      effect.tracer.lineBetween(right.x, right.y, tip.x, tip.y);
      effect.tracer.lineStyle(effect.hovered ? 3 : 2.2, effect.palette.hot, alpha);
      effect.tracer.lineBetween(left.x, left.y, tip.x, tip.y);
      effect.tracer.lineBetween(right.x, right.y, tip.x, tip.y);
    }
  }

  private drawGlyph(
    graphics: Phaser.GameObjects.Graphics,
    kind: TacticalHexFxKind,
    palette: TacticalHexFxPalette,
    path?: Phaser.Math.Vector2[],
  ): void {
    if (kind === 'move') {
      if (!path) return;
      graphics.lineStyle(1.2, palette.core, 0.3);
      for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        const direction = to.clone().subtract(from).normalize();
        graphics.lineBetween(
          from.x + direction.x * 22,
          from.y + direction.y * 22,
          to.x - direction.x * 17,
          to.y - direction.y * 17,
        );
      }
      return;
    }

    if (kind === 'attack') {
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
