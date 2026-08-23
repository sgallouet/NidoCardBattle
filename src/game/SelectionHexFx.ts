import Phaser from 'phaser';

const ORBIT_DURATION_MS = 2_400;
const ENTRANCE_DURATION_MS = 180;
const BREATH_DURATION_MS = 1_800;
const TRAIL_SPACING = 0.009;

interface OrbitLight {
  object: Phaser.GameObjects.Arc;
  lag: number;
  baseScale: number;
}

export class SelectionHexFx {
  readonly container: Phaser.GameObjects.Container;

  private readonly localPoints: Phaser.Geom.Point[];
  private readonly outerGlow: Phaser.GameObjects.Graphics;
  private readonly innerGlow: Phaser.GameObjects.Graphics;
  private readonly orbitLights: OrbitLight[];
  private readonly createdAt: number;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    center: Phaser.Math.Vector2,
    worldPoints: Phaser.Geom.Point[],
    depth: number,
  ) {
    this.localPoints = worldPoints.map(
      (point) => new Phaser.Geom.Point(point.x - center.x, point.y - center.y),
    );
    this.container = scene.add.container(center.x, center.y).setDepth(depth);

    const wash = scene.add.graphics();
    wash.fillStyle(0x168dff, 0.07);
    wash.fillPoints(this.localPoints, true);

    this.outerGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.stroke(this.outerGlow, 16, 0x0b72ff, 0.1);
    this.stroke(this.outerGlow, 9, 0x189dff, 0.17);

    this.innerGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.stroke(this.innerGlow, 4, 0x27b9ff, 0.58);
    this.stroke(this.innerGlow, 2, 0xb9eaff, 0.94);

    const cornerLights = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    cornerLights.fillStyle(0xb3e4ff, 0.55);
    for (const point of this.localPoints) cornerLights.fillCircle(point.x, point.y, 1.65);

    this.orbitLights = [
      this.createOrbitLight(8.5, 0x0a7cff, 0.16, 0, 1),
      this.createOrbitLight(5.5, 0x2dadff, 0.34, 0, 1),
      this.createOrbitLight(2.5, 0xffffff, 1, 0, 1),
      this.createOrbitLight(3.2, 0x74cfff, 0.52, TRAIL_SPACING, 0.9),
      this.createOrbitLight(2.8, 0x49baff, 0.4, TRAIL_SPACING * 2, 0.78),
      this.createOrbitLight(2.4, 0x2aa7ff, 0.3, TRAIL_SPACING * 3, 0.66),
      this.createOrbitLight(2, 0x168fff, 0.2, TRAIL_SPACING * 4, 0.54),
      this.createOrbitLight(1.6, 0x0d7eff, 0.12, TRAIL_SPACING * 5, 0.42),
    ];

    this.container.add([
      wash,
      this.outerGlow,
      this.innerGlow,
      cornerLights,
      ...this.orbitLights.map(({ object }) => object),
    ]);

    this.createdAt = scene.time.now;
    this.container.setAlpha(0);
    this.scene.events.on('update', this.handleUpdate);
    this.handleUpdate();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('update', this.handleUpdate);
    if (this.container.active) this.container.destroy(true);
  }

  private readonly handleUpdate = (): void => {
    if (this.destroyed || !this.container.active) return;
    const elapsed = this.scene.time.now - this.createdAt;
    const entrance = Phaser.Math.Clamp(elapsed / ENTRANCE_DURATION_MS, 0, 1);
    const breath = (Math.sin(elapsed * Math.PI * 2 / BREATH_DURATION_MS) + 1) / 2;
    const orbitProgress = (elapsed % ORBIT_DURATION_MS) / ORBIT_DURATION_MS;

    this.container.setAlpha(Phaser.Math.Easing.Cubic.Out(entrance));
    this.outerGlow.setAlpha(0.72 + breath * 0.28);
    this.outerGlow.setScale(0.995 + breath * 0.012);
    this.innerGlow.setAlpha(0.88 + breath * 0.12);

    const segmentProgress = orbitProgress * this.localPoints.length % 1;
    const cornerDistance = Math.min(segmentProgress, 1 - segmentProgress);
    const cornerBloom = 1 - Phaser.Math.Clamp(cornerDistance / 0.18, 0, 1);

    for (const light of this.orbitLights) {
      const point = this.pointAt(orbitProgress - light.lag);
      light.object.setPosition(point.x, point.y);
      const headBloom = light.lag === 0 ? 1 + cornerBloom * 0.32 : 1;
      light.object.setScale(light.baseScale * headBloom);
    }
  };

  private stroke(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    color: number,
    alpha: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    graphics.strokePoints(this.localPoints, true);
  }

  private createOrbitLight(
    radius: number,
    color: number,
    alpha: number,
    lag: number,
    baseScale: number,
  ): OrbitLight {
    const object = this.scene.add.circle(0, 0, radius, color, alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    return { object, lag, baseScale };
  }

  private pointAt(progress: number): Phaser.Geom.Point {
    const wrapped = Phaser.Math.Wrap(progress, 0, 1);
    const scaled = wrapped * this.localPoints.length;
    const fromIndex = Math.floor(scaled) % this.localPoints.length;
    const toIndex = (fromIndex + 1) % this.localPoints.length;
    const amount = scaled - Math.floor(scaled);
    const from = this.localPoints[fromIndex];
    const to = this.localPoints[toIndex];
    return new Phaser.Geom.Point(
      Phaser.Math.Linear(from.x, to.x, amount),
      Phaser.Math.Linear(from.y, to.y, amount),
    );
  }
}
