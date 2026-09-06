import Phaser from 'phaser';
import type { Coord, GameState, UnitState } from '../data/types';
import {
  attackUnit,
  findUnit,
  getAttackTargets,
  getCurseTargets,
  getDisplaceDestinations,
  getDisplaceTargets,
  getInvokeDestinations,
  getRallyTargets,
  getReachableCoords,
  getRestoreTargets,
  getSoulLinkTargets,
  getThunderTargetCoords,
  unitDefinition,
} from './engine';

interface RenderedUnitView {
  container: Phaser.GameObjects.Container;
  hpText?: Phaser.GameObjects.Text;
}

export interface ActionReadabilitySceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  mode: string | null;
  renderedUnits: Map<string, RenderedUnitView>;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

interface CombatPreview {
  targetDamage: number;
  retaliationDamage: number;
  lethal: boolean;
  attackerDies: boolean;
}

interface ActionAura {
  graphics: Phaser.GameObjects.Graphics;
  phase: number;
}

interface HealthBadge {
  graphics: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  critical: boolean;
  phase: number;
}

const MOVE_COLOR = 0x45baff;
const MOVE_HOT = 0xd1f4ff;
const ATTACK_COLOR = 0xff536a;
const ATTACK_HOT = 0xffd6dd;
const PREVIEW_BG = '#24171ae8';
const LETHAL_BG = '#4a1018ee';

/**
 * Replacement movement deliberately remains legal until a unit acts, but it is not a
 * fresh movement action. Keep that distinction visible in the battlefield readiness UI.
 */
export const hasFreshMovementAction = (state: GameState, unitId: string): boolean => {
  const unit = findUnit(state, unitId);
  if (!unit) return false;
  if (unit.movementOrigin && !unit.attacked) return false;
  return getReachableCoords(state, unit.id).size > 0;
};

export class ActionReadabilityLayer {
  private layer?: Phaser.GameObjects.Container;
  private lethalMarkers: Phaser.GameObjects.Graphics[] = [];
  private actionAuras: ActionAura[] = [];
  private healthBadges: HealthBadge[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: ActionReadabilitySceneInternals,
  ) {}

  install(): void {
    this.scene.events.on('update', this.handleUpdate);
    this.scene.events.once('shutdown', () => {
      this.scene.events.off('update', this.handleUpdate);
      this.lethalMarkers = [];
      this.actionAuras = [];
      this.healthBadges = [];
      this.layer = undefined;
    });
  }

  render(): void {
    if (this.layer?.active) this.layer.destroy(true);
    this.lethalMarkers = [];
    this.actionAuras = [];
    this.healthBadges = [];

    // Retire the old "dim the whole unit when done" treatment. Readiness is now shown
    // only by the light at the unit's feet, leaving the actual unit art crisp at all times.
    for (const view of this.game.renderedUnits.values()) view.container.setAlpha(1);

    const board = this.game.boardLayer;
    if (!board || this.game.state.winner) return;
    this.layer = this.scene.add.container(0, 0);
    board.add(this.layer);

    this.renderHealthBadges();
    if (this.game.animationInProgress) return;
    this.renderActionStates();
    this.renderCombatPreviews();
  }

  private readonly handleUpdate = (): void => {
    const seconds = this.scene.time.now / 1000;

    for (const aura of this.actionAuras) {
      if (!aura.graphics.active) continue;
      const breath = 0.5 + Math.sin(seconds * 3.1 + aura.phase) * 0.5;
      aura.graphics.setAlpha(0.72 + breath * 0.24);
      aura.graphics.setScale(0.985 + breath * 0.025, 0.96 + breath * 0.055);
    }

    for (const badge of this.healthBadges) {
      if (!badge.graphics.active || !badge.text.active) continue;
      if (!badge.critical) continue;
      const pulse = 0.5 + Math.sin(seconds * 4.4 + badge.phase) * 0.5;
      badge.graphics.setAlpha(0.86 + pulse * 0.14);
      badge.text.setScale(1 + pulse * 0.045);
    }

    if (this.lethalMarkers.length === 0) return;
    const alpha = 0.7 + Math.sin(this.scene.time.now / 145) * 0.24;
    for (const marker of this.lethalMarkers) {
      if (marker.active) marker.setAlpha(alpha);
    }
  };

  private renderActionStates(): void {
    for (const unit of this.game.state.units) {
      if (unit.owner !== this.game.state.currentPlayer) continue;
      const canMove = hasFreshMovementAction(this.game.state, unit.id);
      const canAct = getAttackTargets(this.game.state, unit.id).length > 0 || this.hasLegalSpell(unit);
      if (canMove || canAct) this.drawActionAura(unit, canMove, canAct);
    }
  }

  private hasLegalSpell(unit: UnitState): boolean {
    if (getInvokeDestinations(this.game.state, unit.id).length > 0) return true;
    switch (unitDefinition(unit).ability) {
      case 'Displace':
        return getDisplaceTargets(this.game.state, unit.id)
          .some((target) => getDisplaceDestinations(this.game.state, unit.id, target.id).length > 0);
      case 'Restore':
        return getRestoreTargets(this.game.state, unit.id).length > 0;
      case 'Thunder':
        return getThunderTargetCoords(this.game.state, unit.id).length > 0;
      case 'Rally':
        return getRallyTargets(this.game.state, unit.id).length > 0;
      case 'SoulLink':
        return getSoulLinkTargets(this.game.state, unit.id).length > 0;
      case 'Curse':
        return getCurseTargets(this.game.state, unit.id).length > 0;
      default:
        return false;
    }
  }

  /**
   * Two soft ground smears replace the old pair of HUD arcs. Blue means a real move is
   * still unused; red means an attack/active ability is available. With both available,
   * each foot carries one color. No light means the unit is genuinely finished.
   */
  private drawActionAura(unit: UnitState, canMove: boolean, canAct: boolean): void {
    const center = this.game.center(unit.coord);
    const graphics = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const y = center.y + 25;
    const leftColor = canMove ? MOVE_COLOR : ATTACK_COLOR;
    const leftHot = canMove ? MOVE_HOT : ATTACK_HOT;
    const rightColor = canAct ? ATTACK_COLOR : MOVE_COLOR;
    const rightHot = canAct ? ATTACK_HOT : MOVE_HOT;

    if (canMove) {
      graphics.fillStyle(MOVE_COLOR, canAct ? 0.055 : 0.075);
      graphics.fillEllipse(center.x - (canAct ? 8 : 0), y + 1, canAct ? 38 : 58, 13);
    }
    if (canAct) {
      graphics.fillStyle(ATTACK_COLOR, canMove ? 0.055 : 0.075);
      graphics.fillEllipse(center.x + (canMove ? 8 : 0), y + 1, canMove ? 38 : 58, 13);
    }

    this.drawFootSmear(graphics, center.x - 8, y, leftColor, leftHot, -1);
    this.drawFootSmear(graphics, center.x + 8, y, rightColor, rightHot, 1);

    this.layer?.add(graphics);
    this.actionAuras.push({
      graphics,
      phase: [...unit.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.17,
    });
  }

  private drawFootSmear(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
    hot: number,
    direction: -1 | 1,
  ): void {
    const tailX = x - direction * 14;
    const tailY = y + 5;
    const toeX = x + direction * 5;
    const toeY = y - 3;

    graphics.lineStyle(11, color, 0.08);
    graphics.lineBetween(tailX - direction * 7, tailY + 2, toeX, toeY);
    graphics.lineStyle(6, color, 0.19);
    graphics.lineBetween(tailX, tailY, toeX, toeY);
    graphics.lineStyle(2.2, hot, 0.84);
    graphics.lineBetween(x - direction * 5, y + 2, toeX, toeY);
    graphics.fillStyle(hot, 0.74);
    graphics.fillCircle(toeX, toeY, 1.9);
  }

  private renderHealthBadges(): void {
    for (const unit of this.game.state.units) {
      const view = this.game.renderedUnits.get(unit.id);
      if (!view) continue;
      this.hideLegacyHealthBadge(view);
      this.drawHealthBadge(unit);
    }
  }

  private hideLegacyHealthBadge(view: RenderedUnitView): void {
    view.hpText?.setVisible(false);
    for (const child of view.container.list) {
      if (!(child instanceof Phaser.GameObjects.Arc)) continue;
      // The base GameScene badge is the only Arc at this local anchor.
      if (Math.abs(child.x - 27) < 0.1 && Math.abs(child.y - 25) < 0.1) child.setVisible(false);
    }
  }

  private drawHealthBadge(unit: UnitState): void {
    const center = this.game.center(unit.coord);
    const definition = unitDefinition(unit);
    const ratio = Phaser.Math.Clamp(unit.hp / Math.max(1, definition.maxHp), 0, 1);
    const color = ratio > 0.6 ? 0x5de38d : ratio > 0.3 ? 0xffc857 : 0xff4d62;
    const hot = ratio > 0.6 ? 0xd9ffe6 : ratio > 0.3 ? 0xffefb8 : 0xffd9de;
    const x = center.x + 29;
    const y = center.y + 24;
    const radius = 15;
    const graphics = this.scene.add.graphics();

    // A small faceted RPG medallion: grounded shadow, metal rim, dark glass core,
    // health ring, and a restrained specular highlight. It reads cleanly at map zoom.
    graphics.fillStyle(0x020706, 0.48);
    graphics.fillEllipse(x + 2, y + 5, 34, 18);

    const outer = this.hexBadgePoints(x, y, radius + 2);
    const inner = this.hexBadgePoints(x, y, radius - 2);
    graphics.fillStyle(0x07100d, 0.98);
    graphics.fillPoints(outer, true);
    graphics.lineStyle(4.5, 0x020604, 0.88);
    graphics.strokePoints(outer, true);
    graphics.lineStyle(1.5, 0xcbd8cf, 0.62);
    graphics.strokePoints(outer, true);

    graphics.fillStyle(0x0d1713, 0.96);
    graphics.fillPoints(inner, true);
    graphics.fillStyle(color, 0.09);
    graphics.fillEllipse(x, y + 2, 21, 13);

    graphics.lineStyle(4.5, 0x16211c, 0.92);
    graphics.beginPath();
    graphics.arc(x, y, radius + 0.5, -Math.PI / 2, Math.PI * 1.5, false);
    graphics.strokePath();
    if (ratio > 0) {
      graphics.lineStyle(3.4, color, 0.96);
      graphics.beginPath();
      graphics.arc(x, y, radius + 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      graphics.strokePath();
      graphics.lineStyle(1.2, hot, 0.82);
      graphics.beginPath();
      graphics.arc(x, y, radius + 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      graphics.strokePath();
    }

    graphics.fillStyle(0xffffff, 0.13);
    graphics.fillTriangle(x - 7, y - 8, x + 6, y - 8, x - 4, y - 3);
    graphics.fillStyle(hot, 0.62);
    graphics.fillCircle(x - 10, y - 8, 1.5);

    const text = this.scene.add.text(x, y - 0.5, `${unit.hp}`, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '12px',
      color: '#fffdf2',
      fontStyle: 'bold',
      stroke: '#030706',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.layer?.add([graphics, text]);
    this.healthBadges.push({
      graphics,
      text,
      critical: ratio <= 0.3,
      phase: [...unit.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.11,
    });
  }

  private hexBadgePoints(x: number, y: number, radius: number): Phaser.Geom.Point[] {
    return Array.from({ length: 6 }, (_, index) => {
      const angle = Phaser.Math.DegToRad(-90 + index * 60);
      return new Phaser.Geom.Point(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius,
      );
    });
  }

  private renderCombatPreviews(): void {
    if (this.game.mode !== 'unit' || !this.game.selectedUnitId) return;
    const attacker = findUnit(this.game.state, this.game.selectedUnitId);
    if (!attacker || attacker.owner !== this.game.state.currentPlayer) return;

    for (const target of getAttackTargets(this.game.state, attacker.id)) {
      const preview = this.previewCombat(attacker, target);
      if (!preview) continue;
      this.drawCombatPreview(target.coord, preview);
    }
  }

  private previewCombat(attacker: UnitState, target: UnitState): CombatPreview | null {
    const previewState = structuredClone(this.game.state);
    const result = attackUnit(previewState, attacker.id, target.id);
    if (!result.ok) return null;

    const targetAfter = findUnit(previewState, target.id);
    const attackerAfter = findUnit(previewState, attacker.id);
    return {
      targetDamage: Math.max(0, target.hp - (targetAfter?.hp ?? 0)),
      retaliationDamage: Math.max(0, attacker.hp - (attackerAfter?.hp ?? 0)),
      lethal: !targetAfter,
      attackerDies: !attackerAfter,
    };
  }

  private drawCombatPreview(coord: Coord, preview: CombatPreview): void {
    const center = this.game.center(coord);
    const parts = [`${preview.targetDamage} DMG`];
    if (preview.lethal) parts.push('KILL');
    if (preview.retaliationDamage > 0) {
      parts.push(preview.attackerDies ? '↩ KILL' : `↩ ${preview.retaliationDamage}`);
    }

    const label = this.scene.add.text(center.x, center.y - 49, parts.join(' · '), {
      fontFamily: 'Arial, sans-serif',
      fontSize: preview.lethal ? '12px' : '11px',
      color: preview.lethal ? '#fff3e5' : '#f6ede8',
      fontStyle: 'bold',
      backgroundColor: preview.lethal ? LETHAL_BG : PREVIEW_BG,
      padding: { x: 7, y: 4 },
      stroke: preview.lethal ? '#6b1621' : '#181113',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.layer?.add(label);

    if (!preview.lethal) return;

    const marker = this.scene.add.graphics();
    const skullX = center.x + 31;
    const skullY = center.y - 35;
    marker.fillStyle(0x330a11, 0.96);
    marker.fillCircle(skullX, skullY, 11);
    marker.fillRect(skullX - 7, skullY + 5, 14, 8);
    marker.lineStyle(2, 0xffe9e4, 1);
    marker.strokeCircle(skullX, skullY, 9);
    marker.lineBetween(skullX - 6, skullY + 7, skullX + 6, skullY + 7);
    marker.fillStyle(0xffe9e4, 1);
    marker.fillCircle(skullX - 4, skullY - 1, 2);
    marker.fillCircle(skullX + 4, skullY - 1, 2);
    marker.fillTriangle(skullX, skullY + 2, skullX - 2, skullY + 5, skullX + 2, skullY + 5);

    this.layer?.add(marker);
    this.lethalMarkers.push(marker);
  }
}
