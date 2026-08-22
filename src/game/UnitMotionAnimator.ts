import Phaser from 'phaser';
import type { Coord, UnitState } from '../data/types';
import type { UnitArtDefinition } from '../data/unitArt';
import { COMBAT_VFX_ART, SWORD_SWING_CONTRACT } from '../data/vfxArt';
import { unitDefinition } from './engine';

export type UnitMotionStyle = 'standard' | 'heavy' | 'agile' | 'ranged' | 'flying' | 'spectral';

export interface AnimatedUnitView {
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  art?: UnitArtDefinition;
}

interface TweenValues {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  alpha?: number;
}

export class UnitMotionAnimator {
  private hunterArrowTexturePromise?: Promise<void>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: () => Phaser.GameObjects.Container | undefined,
  ) {}

  styleFor(unit: UnitState): UnitMotionStyle {
    const definition = unitDefinition(unit);
    if (definition.traits.includes('Phase') || definition.id === 'banshee') return 'spectral';
    if (definition.traits.includes('Flying')) return 'flying';
    if (definition.traits.includes('AgileAssault')) return 'agile';
    if (definition.range > 1) return 'ranged';
    if (definition.id === 'commander' || definition.id === 'graveKnight' || definition.traits.includes('Blocking')) return 'heavy';
    return 'standard';
  }

  async move(
    view: AnimatedUnitView,
    unit: UnitState,
    path: Coord[],
    center: (coord: Coord) => Phaser.Math.Vector2,
    face: (from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) => void,
  ): Promise<void> {
    if (path.length < 2) return;
    const style = this.styleFor(unit);
    this.playClip(view, 'walk');
    this.board()?.bringToTop(view.container);

    if (style !== 'flying' && style !== 'spectral') {
      await this.tween(view.container, { scaleX: 1.05, scaleY: 0.92 }, 65, 'Quad.easeOut');
      await this.tween(view.container, { scaleX: 1, scaleY: 1 }, 55, 'Quad.easeIn');
    }

    for (let index = 1; index < path.length; index += 1) {
      const from = center(path[index - 1]);
      const to = center(path[index]);
      face(from, to);
      const duration = view.art?.movementMsPerHex ?? 190;
      if (style === 'flying') {
        await this.glideStep(view, from, to, duration, 5);
      } else if (style === 'spectral') {
        this.spawnSpectralTrail(from);
        await this.tween(view.container, {
          x: to.x,
          y: to.y,
          scaleX: 1.08,
          scaleY: 0.96,
          alpha: 0.78,
        }, Math.round(duration * 0.72), 'Sine.easeInOut');
        await this.tween(view.container, { scaleX: 1, scaleY: 1, alpha: 1 }, Math.round(duration * 0.28), 'Quad.easeOut');
      } else {
        const hop = style === 'agile' ? 10 : style === 'heavy' ? 4 : 7;
        const tilt = Phaser.Math.Clamp((to.x - from.x) * 0.06, -5, 5);
        const mid = new Phaser.Math.Vector2(
          Phaser.Math.Linear(from.x, to.x, 0.56),
          Phaser.Math.Linear(from.y, to.y, 0.56) - hop,
        );
        await this.tween(view.container, {
          x: mid.x,
          y: mid.y,
          scaleX: style === 'agile' ? 1.06 : 1.03,
          scaleY: 0.96,
          angle: tilt,
        }, Math.round(duration * 0.55), 'Sine.easeOut');
        await this.tween(view.container, {
          x: to.x,
          y: to.y,
          scaleX: 1.04,
          scaleY: 0.93,
          angle: 0,
        }, Math.round(duration * 0.32), 'Sine.easeIn');
        await this.tween(view.container, { scaleX: 1, scaleY: 1 }, Math.max(35, Math.round(duration * 0.13)), 'Back.easeOut');
        if (style === 'heavy') this.spawnDust(to, 0x9b8663, 3);
      }
    }

    this.playClip(view, 'idle');
  }

  async beginAttack(
    view: AnimatedUnitView,
    unit: UnitState,
    target: Phaser.Math.Vector2,
    face: (from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) => void,
    counter = false,
  ): Promise<{ source: Phaser.Math.Vector2; ranged: boolean }> {
    const source = new Phaser.Math.Vector2(view.container.x, view.container.y);
    const definition = unitDefinition(unit);
    const style = this.styleFor(unit);
    const ranged = definition.range > 1;
    const direction = target.clone().subtract(source).normalize();
    face(source, target);
    this.playClip(view, 'attack');
    this.board()?.bringToTop(view.container);

    const speed = counter ? 0.72 : 1;
    const back = style === 'heavy' ? 5 : 7;
    await this.tween(view.container, {
      x: source.x - direction.x * back,
      y: source.y - direction.y * back + 2,
      scaleX: 0.96,
      scaleY: 1.04,
      angle: -direction.x * 3,
    }, Math.round(85 * speed), 'Quad.easeOut');

    if (ranged) {
      await this.tween(view.container, {
        x: source.x + direction.x * 4,
        y: source.y + direction.y * 4,
        scaleX: 1.05,
        scaleY: 0.96,
        angle: direction.x * 2,
      }, Math.round(70 * speed), 'Expo.easeOut');
      await this.launchProjectile(unit, source, target, counter);
    } else {
      const lunge = style === 'agile' ? 28 : style === 'heavy' ? 18 : 22;
      await this.tween(view.container, {
        x: source.x + direction.x * lunge,
        y: source.y + direction.y * lunge,
        scaleX: style === 'heavy' ? 1.08 : 1.1,
        scaleY: 0.93,
        angle: direction.x * (style === 'heavy' ? 3 : 5),
      }, Math.round((counter ? 78 : 105) * speed), 'Expo.easeIn');
      this.spawnSwordSwingFallback(source, target, counter);
    }

    return { source, ranged };
  }

  async finishAttack(view: AnimatedUnitView, source: Phaser.Math.Vector2, counter = false): Promise<void> {
    await this.tween(view.container, {
      x: source.x,
      y: source.y,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      alpha: 1,
    }, counter ? 85 : 125, 'Back.easeOut');
    this.playClip(view, 'idle');
  }

  async impact(coord: Coord, center: (coord: Coord) => Phaser.Math.Vector2, power = 1): Promise<void> {
    const point = center(coord);
    const burst = this.scene.add.graphics();
    burst.lineStyle(3, 0xfff1cf, 0.95);
    const rayCount = power > 1.25 ? 9 : 6;
    for (let index = 0; index < rayCount; index += 1) {
      const angle = (Math.PI * 2 * index) / rayCount;
      const inner = 10;
      const outer = 20 + power * 7;
      burst.lineBetween(
        point.x + Math.cos(angle) * inner,
        point.y + Math.sin(angle) * inner,
        point.x + Math.cos(angle) * outer,
        point.y + Math.sin(angle) * outer,
      );
    }
    burst.fillStyle(0xffffff, 0.72);
    burst.fillCircle(point.x, point.y, 6 + power * 2);
    this.board()?.add(burst);
    this.scene.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy(),
    });
    this.scene.cameras.main.shake(55 + Math.round(power * 20), 0.0012 * power);
    await this.wait(power > 1.25 ? 72 : 48);
  }

  async hurt(
    view: AnimatedUnitView,
    unit: UnitState,
    damage: number,
    source: Phaser.Math.Vector2,
    lethal: boolean,
  ): Promise<void> {
    if (damage <= 0) return;
    const style = this.styleFor(unit);
    const origin = new Phaser.Math.Vector2(view.container.x, view.container.y);
    const direction = origin.clone().subtract(source).normalize();
    const strength = Phaser.Math.Clamp(6 + damage * 2.2 + (lethal ? 5 : 0), 8, 20);
    const flashMs = lethal ? 105 : 72;

    if (view.sprite) {
      view.sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(flashMs, () => {
        if (view.sprite?.active) view.sprite.clearTint();
      });
    }
    this.showDamageNumber(origin, damage, lethal);

    if (style === 'spectral') {
      this.spawnSpectralTrail(origin);
      await this.tween(view.container, {
        x: origin.x + direction.x * strength,
        y: origin.y + direction.y * strength - 3,
        alpha: 0.55,
        scaleX: 1.12,
        scaleY: 0.92,
      }, 85, 'Quad.easeOut');
    } else {
      await this.tween(view.container, {
        x: origin.x + direction.x * strength,
        y: origin.y + direction.y * strength - (lethal ? 4 : 1),
        angle: direction.x * (lethal ? 9 : 5),
        scaleX: 1.06,
        scaleY: 0.9,
      }, 82, 'Quad.easeOut');
    }

    if (!lethal) {
      await this.tween(view.container, {
        x: origin.x,
        y: origin.y,
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
      }, 115, 'Back.easeOut');
    }
  }

  async die(view: AnimatedUnitView, unit: UnitState): Promise<void> {
    const style = this.styleFor(unit);
    const commander = unit.definitionId === 'commander';
    const duration = commander ? 520 : 300;
    const point = new Phaser.Math.Vector2(view.container.x, view.container.y);

    if (commander) {
      this.scene.cameras.main.shake(220, 0.004);
      await this.wait(75);
    }

    if (style === 'spectral') {
      this.spawnSpiritFragments(point, commander ? 12 : 7);
      await this.tween(view.container, {
        y: point.y - (commander ? 28 : 18),
        scaleX: 0.78,
        scaleY: 1.28,
        alpha: 0,
        angle: 0,
      }, duration, 'Sine.easeIn');
      return;
    }

    if (unit.owner === 2) {
      this.spawnUndeadFragments(point, commander ? 14 : 8);
      if (view.sprite) view.sprite.setTint(0x7c4a9d);
      await this.tween(view.container, {
        y: point.y - 8,
        scaleX: commander ? 1.18 : 1.1,
        scaleY: 0.72,
        alpha: 0,
        angle: commander ? 7 : 4,
      }, duration, 'Quad.easeIn');
      return;
    }

    this.spawnDust(point, 0xcbb78c, commander ? 8 : 5);
    if (view.sprite) view.sprite.setTint(0x8c8c8c);
    await this.tween(view.container, {
      y: point.y + (commander ? 25 : 17),
      scaleX: 1.05,
      scaleY: commander ? 0.48 : 0.58,
      angle: commander ? 16 : 11,
      alpha: 0,
    }, duration, 'Cubic.easeIn');
  }

  async reflect(from: Coord, to: Coord, center: (coord: Coord) => Phaser.Math.Vector2): Promise<void> {
    const start = center(from);
    const end = center(to);
    const beam = this.scene.add.graphics();
    beam.lineStyle(6, 0xa75cff, 0.38);
    beam.lineBetween(start.x, start.y - 8, end.x, end.y - 8);
    beam.lineStyle(2, 0xf0c9ff, 0.95);
    beam.lineBetween(start.x, start.y - 8, end.x, end.y - 8);
    this.board()?.add(beam);
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => beam.destroy(),
    });
    await this.wait(75);
  }

  redirect(from: Coord, to: Coord, center: (coord: Coord) => Phaser.Math.Vector2): void {
    const start = center(from);
    const end = center(to);
    const beam = this.scene.add.graphics();
    beam.lineStyle(5, 0x9b63dc, 0.42);
    beam.lineBetween(start.x, start.y - 6, end.x, end.y - 6);
    beam.lineStyle(2, 0xe2c6ff, 0.9);
    beam.lineBetween(start.x, start.y - 6, end.x, end.y - 6);
    this.board()?.add(beam);
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 230,
      ease: 'Quad.easeOut',
      onComplete: () => beam.destroy(),
    });
  }

  spawnNecromancyBurst(coord: Coord, center: (coord: Coord) => Phaser.Math.Vector2): void {
    const point = center(coord);
    const ring = this.scene.add.graphics();
    ring.lineStyle(4, 0x8f58c8, 0.92);
    ring.strokeCircle(point.x, point.y, 12);
    ring.lineStyle(2, 0xdcc3ff, 0.72);
    ring.strokeCircle(point.x, point.y, 24);
    this.board()?.add(ring);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: 1.7,
      scaleY: 1.7,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.spawnSpiritFragments(point, 6);
  }

  private async glideStep(
    view: AnimatedUnitView,
    from: Phaser.Math.Vector2,
    to: Phaser.Math.Vector2,
    duration: number,
    lift: number,
  ): Promise<void> {
    const mid = new Phaser.Math.Vector2(
      Phaser.Math.Linear(from.x, to.x, 0.5),
      Phaser.Math.Linear(from.y, to.y, 0.5) - lift,
    );
    await this.tween(view.container, { x: mid.x, y: mid.y, scaleX: 1.03, scaleY: 0.98 }, Math.round(duration * 0.5), 'Sine.easeInOut');
    await this.tween(view.container, { x: to.x, y: to.y, scaleX: 1, scaleY: 1 }, Math.round(duration * 0.5), 'Sine.easeInOut');
  }

  private async launchProjectile(unit: UnitState, source: Phaser.Math.Vector2, target: Phaser.Math.Vector2, counter: boolean): Promise<void> {
    const definition = unitDefinition(unit);
    const arrow = definition.id === 'longbowRanger' || definition.id === 'boneArcher';
    if (arrow && await this.ensureHunterArrowTexture()) {
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const projectile = this.scene.add.image(
        source.x,
        source.y - 8,
        COMBAT_VFX_ART.hunterArrow.textureKey,
      ).setDisplaySize(30, 11).setRotation(angle);
      this.board()?.add(projectile);

      const distance = Phaser.Math.Distance.Between(source.x, source.y, target.x, target.y);
      const duration = Phaser.Math.Clamp(distance * (counter ? 0.8 : 1.02), 120, counter ? 190 : 260);
      const midX = Phaser.Math.Linear(source.x, target.x, 0.5);
      const midY = Phaser.Math.Linear(source.y - 8, target.y - 8, 0.5) - 7;
      await this.tween(projectile, { x: midX, y: midY }, Math.round(duration * 0.5), 'Sine.easeOut');
      await this.tween(projectile, { x: target.x, y: target.y - 8 }, Math.round(duration * 0.5), 'Sine.easeIn');
      projectile.destroy();
      return;
    }

    const projectile = this.scene.add.graphics();
    projectile.fillStyle(unit.owner === 2 ? 0xac64e7 : 0x8ce7ff, 0.95);
    projectile.fillCircle(0, 0, 6);
    projectile.lineStyle(2, unit.owner === 2 ? 0xe0b8ff : 0xd8fbff, 0.9);
    projectile.strokeCircle(0, 0, 9);
    projectile.setPosition(source.x, source.y - 8);
    this.board()?.add(projectile);
    const distance = Phaser.Math.Distance.Between(source.x, source.y, target.x, target.y);
    const duration = Phaser.Math.Clamp(distance * (counter ? 0.75 : 0.9), 90, counter ? 170 : 220);
    await this.tween(projectile, { x: target.x, y: target.y - 8 }, duration, 'Linear');
    projectile.destroy();
  }

  private async ensureHunterArrowTexture(): Promise<boolean> {
    const { textureKey, url } = COMBAT_VFX_ART.hunterArrow;
    if (this.scene.textures.exists(textureKey)) return true;
    if (!this.hunterArrowTexturePromise) {
      this.hunterArrowTexturePromise = new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          if (!this.scene.textures.exists(textureKey)) this.scene.textures.addImage(textureKey, image);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = url;
      });
    }
    await this.hunterArrowTexturePromise;
    return this.scene.textures.exists(textureKey);
  }

  private spawnSwordSwingFallback(source: Phaser.Math.Vector2, target: Phaser.Math.Vector2, counter: boolean): void {
    const direction = target.clone().subtract(source).normalize();
    const center = source.clone().add(direction.clone().scale(25));
    const angle = Math.atan2(direction.y, direction.x);
    const graphics = this.scene.add.graphics();
    graphics.setPosition(center.x, center.y - 7);
    graphics.lineStyle(9, 0xfff1c5, 0.28);
    graphics.beginPath();
    graphics.arc(0, 0, 32, angle - 1.05, angle + 1.05, false);
    graphics.strokePath();
    graphics.lineStyle(4, 0xfffcf0, 0.92);
    graphics.beginPath();
    graphics.arc(0, 0, 30, angle - 0.92, angle + 0.92, false);
    graphics.strokePath();
    this.board()?.add(graphics);
    this.scene.tweens.add({
      targets: graphics,
      alpha: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: counter ? Math.round(SWORD_SWING_CONTRACT.durationMs * 0.7) : SWORD_SWING_CONTRACT.durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => graphics.destroy(),
    });
  }

  private showDamageNumber(point: Phaser.Math.Vector2, damage: number, lethal: boolean): void {
    const text = this.scene.add.text(point.x, point.y - 55, `-${damage}`, {
      fontFamily: 'Georgia, serif',
      fontSize: lethal ? '23px' : '19px',
      color: lethal ? '#fff5e9' : '#fff4e5',
      fontStyle: 'bold',
      stroke: lethal ? '#b20d2c' : '#8c1727',
      strokeThickness: lethal ? 6 : 5,
    }).setOrigin(0.5);
    this.board()?.add(text);
    this.scene.tweens.add({
      targets: text,
      y: text.y - (lethal ? 32 : 24),
      scaleX: lethal ? 1.18 : 1,
      scaleY: lethal ? 1.18 : 1,
      alpha: 0,
      duration: lethal ? 520 : 420,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private spawnDust(point: Phaser.Math.Vector2, color: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const particle = this.scene.add.circle(point.x, point.y + 18, 3 + (index % 2), color, 0.62);
      this.board()?.add(particle);
      const direction = index % 2 === 0 ? -1 : 1;
      this.scene.tweens.add({
        targets: particle,
        x: point.x + direction * (10 + index * 3),
        y: point.y + 8 - (index % 3) * 4,
        alpha: 0,
        scaleX: 1.8,
        scaleY: 1.8,
        duration: 220 + index * 18,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private spawnSpectralTrail(point: Phaser.Math.Vector2): void {
    for (let index = 0; index < 3; index += 1) {
      const wisp = this.scene.add.circle(point.x - index * 5, point.y + index * 2, 5 - index, 0x9c6dde, 0.26 - index * 0.05);
      this.board()?.add(wisp);
      this.scene.tweens.add({
        targets: wisp,
        y: wisp.y - 12 - index * 3,
        alpha: 0,
        scaleX: 1.8,
        scaleY: 0.7,
        duration: 210 + index * 35,
        onComplete: () => wisp.destroy(),
      });
    }
  }

  private spawnSpiritFragments(point: Phaser.Math.Vector2, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const particle = this.scene.add.circle(point.x, point.y - 3, 2 + (index % 3), index % 2 === 0 ? 0xc095ff : 0x7242a4, 0.86);
      this.board()?.add(particle);
      this.scene.tweens.add({
        targets: particle,
        x: point.x + Math.cos(angle) * (20 + index * 1.5),
        y: point.y - 18 - Math.sin(angle) * (18 + index),
        alpha: 0,
        scaleX: 0.4,
        scaleY: 2.1,
        duration: 280 + index * 18,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private spawnUndeadFragments(point: Phaser.Math.Vector2, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const particle = this.scene.add.rectangle(point.x, point.y, 3 + (index % 3), 7 + (index % 4), index % 2 === 0 ? 0x241b2c : 0x8257a1, 0.9);
      particle.setRotation(angle);
      this.board()?.add(particle);
      this.scene.tweens.add({
        targets: particle,
        x: point.x + Math.cos(angle) * (18 + index * 2),
        y: point.y + Math.sin(angle) * (12 + index) - 8,
        angle: Phaser.Math.RadToDeg(angle) + 120,
        alpha: 0,
        duration: 260 + index * 16,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private playClip(view: AnimatedUnitView, state: 'idle' | 'walk' | 'attack'): void {
    if (!view.sprite || !view.art) return;
    view.sprite.play(view.art.animations[state].animationKey, true);
  }

  private tween<T extends Phaser.GameObjects.GameObject>(
    target: T,
    values: TweenValues,
    duration: number,
    ease: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: target,
        ...values,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }
}
