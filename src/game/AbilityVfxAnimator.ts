import Phaser from 'phaser';
import type { Coord, PlayerId } from '../data/types';
import { ABILITY_VFX_CONTRACT } from './AbilityVfxContract';
import type { AnimatedUnitView } from './UnitMotionAnimator';

const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x55b9f3, 2: 0xf05b67 };

export type AbilityVfxEvent =
  | { kind: 'thunder'; destination: Coord; affected: Coord[] }
  | { kind: 'invokeBeast'; source: Coord; destination: Coord; unitId: string; owner: PlayerId }
  | { kind: 'healingAura'; sources: Coord[]; targets: Coord[] }
  | { kind: 'curse'; source: Coord; target: Coord }
  | { kind: 'soulLink'; source: Coord; target: Coord }
  | { kind: 'rally'; source: Coord; targets: Coord[]; owner: PlayerId }
  | { kind: 'displace'; source: Coord; targetId: string; destination: Coord };

/** Presentation-only ability effects. Engine state is committed before these run. */
export class AbilityVfxAnimator {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: () => Phaser.GameObjects.Container | undefined,
    private readonly center: (coord: Coord) => Phaser.Math.Vector2,
  ) {}

  async play(event: AbilityVfxEvent, views: Map<string, AnimatedUnitView>): Promise<void> {
    switch (event.kind) {
      case 'thunder':
        return this.thunder(event.destination, event.affected);
      case 'invokeBeast': {
        const view = views.get(event.unitId);
        if (view) return this.invokeBeast(event.source, event.destination, view, event.owner);
        return;
      }
      case 'healingAura':
        return this.healingAura(event.sources, event.targets);
      case 'curse':
        return this.curse(event.source, event.target);
      case 'soulLink':
        return this.soulLink(event.source, event.target);
      case 'rally':
        return this.rally(event.source, event.targets, event.owner);
      case 'displace': {
        const view = views.get(event.targetId);
        if (view) return this.displace(event.source, event.destination, view);
        return;
      }
      default: {
        const unhandled: never = event;
        return unhandled;
      }
    }
  }

  private async thunder(destination: Coord, affected: Coord[]): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.thunder;
    const bolt = this.at(destination);
    const glow = this.scene.add.graphics();
    const core = this.scene.add.graphics();
    const flash = this.scene.add.graphics();
    this.drawBolt(glow, 11, contract.color, 0.42);
    this.drawBolt(core, 3, 0xf2fbff, 1);
    flash.fillStyle(0xc8f4ff, 0.72);
    flash.fillCircle(0, 0, 24);
    bolt.add([glow, core, flash]);
    bolt.setAlpha(0);
    this.scene.tweens.add({
      targets: bolt,
      alpha: 1,
      duration: 42,
      yoyo: true,
      repeat: 1,
      hold: 35,
      onComplete: () => bolt.destroy(),
    });

    for (const [index, coord] of affected.entries()) {
      const impact = this.at(coord);
      const ring = this.scene.add.graphics();
      const strong = index === 0;
      ring.fillStyle(contract.color, strong ? 0.22 : 0.11);
      ring.fillCircle(0, 0, strong ? 31 : 24);
      ring.lineStyle(strong ? 5 : 3, strong ? 0xd9f7ff : contract.color, strong ? 0.96 : 0.76);
      ring.strokeCircle(0, 0, strong ? 31 : 25);
      for (let ray = 0; ray < 6; ray += 1) {
        const angle = Phaser.Math.DegToRad(ray * 60 - 30);
        ring.lineBetween(
          Math.cos(angle) * 10,
          Math.sin(angle) * 10,
          Math.cos(angle) * (strong ? 39 : 32),
          Math.sin(angle) * (strong ? 39 : 32),
        );
      }
      impact.add(ring);
      impact.setScale(0.42).setAlpha(0);
      this.scene.tweens.add({
        targets: impact,
        alpha: 1,
        scaleX: 1.35,
        scaleY: 1.35,
        duration: strong ? 340 : 300,
        delay: strong ? 55 : 105,
        ease: 'Cubic.easeOut',
        onComplete: () => impact.destroy(),
      });
      this.scene.tweens.add({ targets: impact, alpha: 0, duration: 150, delay: strong ? 245 : 255 });
    }

    this.scene.cameras.main.shake(135, 0.0022);
    await this.wait(contract.durationMs);
  }

  private async invokeBeast(
    source: Coord,
    destination: Coord,
    view: AnimatedUnitView,
    owner: PlayerId,
  ): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.invokeBeast;
    const portal = this.at(destination);
    const runes = this.scene.add.graphics();
    runes.fillStyle(0x102a52, 0.55);
    runes.fillEllipse(0, 18, 70, 34);
    runes.lineStyle(5, 0xffd86a, 0.85);
    runes.strokeEllipse(0, 18, 69, 33);
    runes.lineStyle(3, contract.color, 1);
    runes.strokeEllipse(0, 18, 52, 24);
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 60);
      const x = Math.cos(angle) * 28;
      const y = 18 + Math.sin(angle) * 14;
      runes.fillStyle(index % 2 === 0 ? 0xffdf75 : contract.color, 0.95);
      runes.fillTriangle(x, y - 5, x - 4, y + 4, x + 4, y + 4);
    }
    portal.add(runes);
    portal.setScale(0.45).setAlpha(0);
    this.scene.tweens.add({ targets: portal, alpha: 1, scaleX: 1.18, scaleY: 1.18, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: portal, alpha: 0, scaleX: 1.55, scaleY: 1.55, duration: 220, delay: 280, onComplete: () => portal.destroy() });

    const caster = this.at(source);
    const casterPulse = this.scene.add.graphics();
    casterPulse.lineStyle(4, PLAYER_COLORS[owner], 0.92);
    casterPulse.strokeCircle(0, 0, 18);
    casterPulse.lineStyle(2, 0xffe59a, 0.9);
    casterPulse.strokeCircle(0, 0, 27);
    caster.add(casterPulse);
    this.scene.tweens.add({ targets: caster, alpha: 0, scaleX: 2, scaleY: 2, duration: 330, onComplete: () => caster.destroy() });

    const destinationPoint = this.center(destination);
    view.container.setPosition(destinationPoint.x, destinationPoint.y + 18).setAlpha(0).setScale(0.34);
    this.board()?.bringToTop(view.container);
    await this.tween(view.container, { y: destinationPoint.y - 7, alpha: 1, scaleX: 1.08, scaleY: 1.08 }, 330, 'Back.easeOut');
    await this.tween(view.container, { y: destinationPoint.y, scaleX: 1, scaleY: 1 }, 120, 'Quad.easeInOut');
    await this.wait(Math.max(0, contract.durationMs - 450));
  }

  private async healingAura(sources: Coord[], targets: Coord[]): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.healingAura;
    for (const coord of sources) {
      const pulse = this.at(coord);
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0xffdf72, 0.16);
      graphics.fillCircle(0, 0, 34);
      graphics.lineStyle(5, 0xffdf72, 0.9);
      graphics.strokeCircle(0, 0, 24);
      graphics.lineStyle(3, contract.color, 0.92);
      graphics.strokeCircle(0, 0, 34);
      this.drawPlus(graphics, 0, -2, 8, 0xf4fff4);
      pulse.add(graphics);
      pulse.setScale(0.55);
      this.scene.tweens.add({ targets: pulse, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 420, ease: 'Cubic.easeOut', onComplete: () => pulse.destroy() });
    }

    for (const coord of targets) {
      const heal = this.at(coord);
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(contract.color, 0.2);
      graphics.fillCircle(0, 0, 25);
      graphics.lineStyle(3, 0xc8ffd3, 0.94);
      graphics.strokeCircle(0, 0, 24);
      this.drawPlus(graphics, 0, -22, 7, 0xffffff);
      this.drawPlus(graphics, -16, -6, 4, 0xaaffc0);
      this.drawPlus(graphics, 17, -10, 4, 0xffe589);
      heal.add(graphics);
      heal.setAlpha(0).setScale(0.72);
      this.scene.tweens.add({ targets: heal, alpha: 1, y: heal.y - 12, scaleX: 1.15, scaleY: 1.15, duration: 210, ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: heal, alpha: 0, y: heal.y - 24, duration: 210, delay: 220, onComplete: () => heal.destroy() });
    }
    await this.wait(contract.durationMs);
  }

  private async curse(source: Coord, target: Coord): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.curse;
    const start = this.center(source);
    const end = this.center(target);
    for (let index = 0; index < 3; index += 1) {
      const wisp = this.scene.add.graphics();
      wisp.fillStyle(index === 1 ? 0xa7ffb1 : contract.color, 0.92);
      wisp.fillCircle(start.x, start.y - 8 - index * 4, 5 - index);
      this.board()?.add(wisp);
      this.scene.tweens.add({
        targets: wisp,
        x: end.x - start.x,
        y: end.y - start.y - 10,
        alpha: 0.15,
        duration: 190 + index * 45,
        delay: index * 35,
        ease: 'Sine.easeIn',
        onComplete: () => wisp.destroy(),
      });
    }

    const sigil = this.at(target);
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0x180d22, 0.56);
    graphics.fillCircle(0, 0, 34);
    graphics.lineStyle(4, contract.color, 0.95);
    graphics.strokeCircle(0, 0, 31);
    graphics.lineStyle(3, 0xbaffbd, 0.86);
    graphics.strokeTriangle(0, -25, -22, 17, 22, 17);
    graphics.lineBetween(-22, -11, 22, -11);
    for (let index = 0; index < 4; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 90 + 45);
      graphics.fillStyle(index % 2 === 0 ? contract.color : 0x8cff9a, 0.92);
      graphics.fillCircle(Math.cos(angle) * 29, Math.sin(angle) * 22, 4);
    }
    sigil.add(graphics);
    sigil.setScale(1.35).setAlpha(0);
    this.scene.tweens.add({ targets: sigil, alpha: 1, scaleX: 0.92, scaleY: 0.92, duration: 230, delay: 125, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: sigil, alpha: 0, y: sigil.y - 14, duration: 170, delay: 290, onComplete: () => sigil.destroy() });
    await this.wait(contract.durationMs);
  }

  private async soulLink(source: Coord, target: Coord): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.soulLink;
    const start = this.center(source);
    const end = this.center(target);
    const link = this.scene.add.graphics();
    link.lineStyle(12, 0x38165f, 0.5);
    link.lineBetween(start.x, start.y - 9, end.x, end.y - 9);
    link.lineStyle(5, contract.color, 0.92);
    link.lineBetween(start.x, start.y - 9, end.x, end.y - 9);
    link.lineStyle(2, 0xf1dcff, 1);
    link.lineBetween(start.x, start.y - 9, end.x, end.y - 9);
    this.board()?.add(link);
    this.scene.tweens.add({ targets: link, alpha: 0.18, duration: 120, yoyo: true, repeat: 2, onComplete: () => link.destroy() });

    for (const coord of [source, target]) {
      const endpoint = this.at(coord);
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0x35104d, 0.42);
      graphics.fillCircle(0, -9, 24);
      graphics.lineStyle(4, contract.color, 0.92);
      graphics.strokeCircle(0, -9, 23);
      graphics.lineStyle(2, 0xf4e3ff, 0.92);
      graphics.strokeCircle(0, -9, 13);
      endpoint.add(graphics);
      endpoint.setScale(0.6);
      this.scene.tweens.add({ targets: endpoint, alpha: 0, scaleX: 1.55, scaleY: 1.55, duration: 440, ease: 'Cubic.easeOut', onComplete: () => endpoint.destroy() });
    }

    for (let index = 1; index <= 4; index += 1) {
      const orb = this.scene.add.graphics();
      const fraction = index / 5;
      orb.fillStyle(index % 2 === 0 ? 0xf3dcff : contract.color, 0.95);
      orb.fillCircle(Phaser.Math.Linear(start.x, end.x, fraction), Phaser.Math.Linear(start.y - 9, end.y - 9, fraction), 4);
      this.board()?.add(orb);
      this.scene.tweens.add({ targets: orb, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 260, delay: index * 35, onComplete: () => orb.destroy() });
    }
    await this.wait(contract.durationMs);
  }

  private async rally(source: Coord, targets: Coord[], owner: PlayerId): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.rally;
    const actor = this.at(source);
    const banner = this.scene.add.graphics();
    banner.fillStyle(0x2d70c9, 0.82);
    banner.fillTriangle(-4, -40, 23, -31, -4, -20);
    banner.lineStyle(4, 0xffe29a, 0.95);
    banner.lineBetween(-5, -43, -5, 14);
    banner.strokeTriangle(-4, -40, 23, -31, -4, -20);
    banner.lineStyle(5, contract.color, 0.9);
    banner.strokeCircle(0, 0, 18);
    banner.lineStyle(2, PLAYER_COLORS[owner], 0.9);
    banner.strokeCircle(0, 0, 29);
    actor.add(banner);
    actor.setScale(0.65).setAlpha(0);
    this.scene.tweens.add({ targets: actor, alpha: 1, scaleX: 1.15, scaleY: 1.15, duration: 200, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: actor, alpha: 0, y: actor.y - 12, duration: 210, delay: 210, onComplete: () => actor.destroy() });

    for (const [index, coord] of targets.entries()) {
      const target = this.at(coord);
      const chevron = this.scene.add.graphics();
      chevron.lineStyle(5, contract.color, 0.92);
      chevron.lineBetween(-13, 8, 0, -6);
      chevron.lineBetween(0, -6, 13, 8);
      chevron.lineStyle(3, 0xffffff, 0.92);
      chevron.lineBetween(-9, 18, 0, 8);
      chevron.lineBetween(0, 8, 9, 18);
      target.add(chevron);
      target.setAlpha(0).setScale(0.7);
      this.scene.tweens.add({ targets: target, alpha: 1, y: target.y - 18, scaleX: 1.12, scaleY: 1.12, duration: 210, delay: 60 + index * 18, ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: target, alpha: 0, y: target.y - 30, duration: 160, delay: 250, onComplete: () => target.destroy() });
    }
    await this.wait(contract.durationMs);
  }

  private async displace(source: Coord, destination: Coord, view: AnimatedUnitView): Promise<void> {
    const contract = ABILITY_VFX_CONTRACT.displace;
    const sourcePulse = this.at(source);
    const sourceGraphics = this.scene.add.graphics();
    sourceGraphics.lineStyle(4, contract.color, 0.9);
    sourceGraphics.strokeCircle(0, 0, 22);
    sourceGraphics.lineStyle(2, 0xe8fcff, 0.9);
    sourceGraphics.strokeCircle(0, 0, 31);
    sourcePulse.add(sourceGraphics);
    this.scene.tweens.add({ targets: sourcePulse, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 280, onComplete: () => sourcePulse.destroy() });

    const portal = this.at(destination);
    const portalGraphics = this.scene.add.graphics();
    portalGraphics.fillStyle(0x15374f, 0.35);
    portalGraphics.fillEllipse(0, 15, 61, 29);
    portalGraphics.lineStyle(4, contract.color, 0.92);
    portalGraphics.strokeEllipse(0, 15, 60, 28);
    portalGraphics.lineStyle(2, 0xffffff, 0.86);
    portalGraphics.strokeEllipse(0, 15, 43, 19);
    portal.add(portalGraphics);
    portal.setScale(0.5).setAlpha(0);
    this.scene.tweens.add({ targets: portal, alpha: 1, scaleX: 1.2, scaleY: 1.2, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: portal, alpha: 0, scaleX: 1.6, scaleY: 1.6, duration: 170, delay: 210, onComplete: () => portal.destroy() });

    const target = this.center(destination);
    this.board()?.bringToTop(view.container);
    await this.tween(view.container, { alpha: 0.28, scaleX: 0.72, scaleY: 1.2 }, 85, 'Quad.easeIn');
    await this.tween(view.container, { x: target.x, y: target.y, alpha: 0.76, scaleX: 1.22, scaleY: 0.82 }, 165, 'Expo.easeOut');
    await this.tween(view.container, { alpha: 1, scaleX: 1, scaleY: 1 }, 105, 'Back.easeOut');
    await this.wait(Math.max(0, contract.durationMs - 355));
  }

  private at(coord: Coord): Phaser.GameObjects.Container {
    const point = this.center(coord);
    const container = this.scene.add.container(point.x, point.y);
    this.board()?.add(container);
    return container;
  }

  private drawBolt(graphics: Phaser.GameObjects.Graphics, width: number, color: number, alpha: number): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(-9, -170);
    graphics.lineTo(8, -136);
    graphics.lineTo(-7, -104);
    graphics.lineTo(11, -72);
    graphics.lineTo(-5, -39);
    graphics.lineTo(0, 0);
    graphics.strokePath();
    graphics.beginPath();
    graphics.moveTo(-7, -104);
    graphics.lineTo(-30, -82);
    graphics.lineTo(-35, -56);
    graphics.moveTo(11, -72);
    graphics.lineTo(34, -52);
    graphics.lineTo(29, -25);
    graphics.strokePath();
  }

  private drawPlus(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    size: number,
    color: number,
  ): void {
    graphics.fillStyle(color, 0.96);
    graphics.fillRect(x - Math.round(size * 0.28), y - size, Math.round(size * 0.56), size * 2);
    graphics.fillRect(x - size, y - Math.round(size * 0.28), size * 2, Math.round(size * 0.56));
  }

  private tween(
    target: Phaser.GameObjects.GameObject,
    values: Record<string, number>,
    duration: number,
    ease: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: target, ...values, duration, ease, onComplete: () => resolve() });
    });
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }
}
