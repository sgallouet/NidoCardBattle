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
  shimmer: Phaser.GameObjects.Graphics;
  centerX: number;
  centerY: number;
  radius: number;
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
      this.clearActionAuras();
      this.lethalMarkers = [];
      this.healthBadges = [];
      this.layer = undefined;
    });
  }

  render(): void {
    // Action auras live directly in the board display list below their units, while the
    // regular readability layer stays above units for HP and combat information.
    this.clearActionAuras();
    if (this.layer?.active) this.layer.destroy(true);
    this.lethalMarkers = [];
    this.healthBadges = [];

    // Never dim the unit sprite itself. Action state is communicated by the low aurora
    // under its feet while the unit art stays crisp.
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

    // Keep the aura anchored to the lower slice of the hex. Only its light intensity and
    // one small travelling glint move, so readiness feels alive without the marker itself
    // sliding around under the unit.
    for (const aura of this.actionAuras) {
      if (!aura.graphics.active || !aura.shimmer.active) continue;
      const breath = 0.5 + Math.sin(seconds * 1.7 + aura.phase) * 0.5;
      aura.graphics.setAlpha(0.80 + breath * 0.18);

      const sweep = (seconds * 0.20 + aura.phase / (Math.PI * 2)) % 1;
      const angle = Phaser.Math.DegToRad(27 + sweep * 126);
      aura.shimmer.setPosition(
        aura.centerX + Math.cos(angle) * aura.radius,
        aura.centerY + Math.sin(angle) * aura.radius,
      );
      const sparkle = 0.5 + Math.sin(seconds * 4.2 + aura.phase) * 0.5;
      aura.shimmer.setAlpha(0.36 + sparkle * 0.54);
      aura.shimmer.setScale(0.82 + sparkle * 0.24);
    }

    for (const badge of this.healthBadges) {
      if (!badge.graphics.active || !badge.text.active || !badge.critical) continue;
      const pulse = 0.5 + Math.sin(seconds * 3.3 + badge.phase) * 0.5;
      badge.graphics.setAlpha(0.92 + pulse * 0.08);
      badge.text.setAlpha(0.92 + pulse * 0.08);
    }

    if (this.lethalMarkers.length === 0) return;
    const alpha = 0.7 + Math.sin(this.scene.time.now / 145) * 0.24;
    for (const marker of this.lethalMarkers) {
      if (marker.active) marker.setAlpha(alpha);
    }
  };

  private clearActionAuras(): void {
    for (const aura of this.actionAuras) {
      if (aura.graphics.active) aura.graphics.destroy();
      if (aura.shimmer.active) aura.shimmer.destroy();
    }
    this.actionAuras = [];
  }

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
   * A fixed aurora crescent hugs roughly the bottom fifth of the hex. Movement always owns
   * the full light-blue base so it remains immediately readable; when an action is also
   * available, a smaller red inner crescent layers on top instead of splitting the blue cue.
   */
  private drawActionAura(unit: UnitState, canMove: boolean, canAct: boolean): void {
    const center = this.game.center(unit.coord);
    const graphics = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    // Keep the bowl tucked directly under the unit's feet rather than hanging below the hex.
    const y = center.y + 24;

    if (canMove) {
      this.drawAuroraBand(graphics, center.x, y, 74, MOVE_COLOR, MOVE_HOT, 1);
    }
    if (canAct) {
      this.drawAuroraBand(
        graphics,
        center.x,
        canMove ? y + 2 : y,
        canMove ? 46 : 70,
        ATTACK_COLOR,
        ATTACK_HOT,
        canMove ? 0.62 : 1,
      );
    }

    // The moving glint follows the primary state cue: blue whenever movement remains,
    // otherwise red. The crescent itself never travels across the tile.
    const shimmerColor = canMove ? MOVE_HOT : ATTACK_HOT;
    const shimmerWidth = canMove ? 74 : 70;
    const shimmer = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    shimmer.fillStyle(shimmerColor, 0.12);
    shimmer.fillCircle(0, 0, 6.5);
    shimmer.fillStyle(shimmerColor, 0.34);
    shimmer.fillCircle(0, 0, 3.4);
    shimmer.fillStyle(0xffffff, 0.96);
    shimmer.fillCircle(0, 0, 1.15);
    shimmer.lineStyle(0.9, shimmerColor, 0.55);
    shimmer.lineBetween(-4.8, 0, 4.8, 0);
    shimmer.lineBetween(0, -3.8, 0, 3.8);

    // Exact z-order: terrain -> readiness aura -> unit sprite -> HP/readability overlay.
    const board = this.game.boardLayer;
    const view = this.game.renderedUnits.get(unit.id);
    if (board && view) {
      const unitIndex = board.getIndex(view.container);
      board.addAt(graphics, unitIndex >= 0 ? unitIndex : board.list.length);
      const shiftedUnitIndex = board.getIndex(view.container);
      board.addAt(shimmer, shiftedUnitIndex >= 0 ? shiftedUnitIndex : board.list.length);
    } else {
      this.layer?.add([graphics, shimmer]);
    }

    this.actionAuras.push({
      graphics,
      shimmer,
      centerX: center.x,
      centerY: y + 3,
      radius: shimmerWidth * 0.40,
      phase: [...unit.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.13,
    });
  }

  private drawAuroraBand(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    color: number,
    hot: number,
    intensity = 1,
  ): void {
    // A luminous bowl-shaped crescent rather than a progress bar: broad atmospheric hue,
    // a crisp hot edge and a few short aurora tongues in the lower portion of the hex.
    graphics.fillStyle(color, 0.085 * intensity);
    graphics.fillEllipse(x, y + 1, width, 17);
    graphics.fillStyle(color, 0.145 * intensity);
    graphics.fillEllipse(x, y + 3, width * 0.82, 10);
    graphics.fillStyle(hot, 0.045 * intensity);
    graphics.fillEllipse(x, y + 2, width * 0.58, 6);

    graphics.lineStyle(7, color, 0.14 * intensity);
    graphics.beginPath();
    graphics.arc(
      x,
      y + 4,
      width * 0.43,
      Phaser.Math.DegToRad(23),
      Phaser.Math.DegToRad(157),
      false,
    );
    graphics.strokePath();

    graphics.lineStyle(2.15, hot, 0.82 * intensity);
    graphics.beginPath();
    graphics.arc(
      x,
      y + 3,
      width * 0.40,
      Phaser.Math.DegToRad(27),
      Phaser.Math.DegToRad(153),
      false,
    );
    graphics.strokePath();

    graphics.lineStyle(0.8, 0xffffff, 0.38 * intensity);
    graphics.beginPath();
    graphics.arc(
      x,
      y + 2.5,
      width * 0.385,
      Phaser.Math.DegToRad(43),
      Phaser.Math.DegToRad(105),
      false,
    );
    graphics.strokePath();

    const wispScale = width / 70;
    for (const [dx, height, alpha] of [
      [-23, 5, 0.22],
      [-11, 8, 0.27],
      [2, 6, 0.20],
      [15, 9, 0.25],
      [25, 5, 0.18],
    ] as const) {
      const wx = x + dx * wispScale;
      graphics.lineStyle(2.1, color, alpha * intensity);
      graphics.lineBetween(wx, y + 5, wx + 1.3 * wispScale, y + 5 - height);
      graphics.lineStyle(0.85, hot, alpha * 1.45 * intensity);
      graphics.lineBetween(wx + 0.4, y + 4, wx + 1.2 * wispScale, y + 6 - height);
    }
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
    const accent = ratio > 0.6 ? 0x5ee58a : ratio > 0.3 ? 0xe9b34e : 0xed4c61;
    const accentHot = ratio > 0.6 ? 0xc8ffd7 : ratio > 0.3 ? 0xffe5a6 : 0xffc0ca;

    // Concept 2: a deliberately minimal RPG bar. Keep it very light visually: heart,
    // slim gauge, current/max value. No large medallion or chunky ornamental frame.
    const x = center.x + 27;
    const y = center.y + 29;
    const width = 62;
    const height = 17;
    const left = x - width / 2;
    const top = y - height / 2;
    const graphics = this.scene.add.graphics();

    // Soft shadow and restrained dark capsule.
    graphics.fillStyle(0x000000, 0.34);
    graphics.fillRoundedRect(left + 1.5, top + 2.5, width, height, height / 2);
    graphics.fillStyle(0x11140f, 0.93);
    graphics.fillRoundedRect(left, top, width, height, height / 2);
    graphics.lineStyle(1, 0x8f7545, 0.72);
    graphics.strokeRoundedRect(left + 0.5, top + 0.5, width - 1, height - 1, (height - 1) / 2);

    // Small clean heart, separated from the gauge so it reads instantly at battlefield scale.
    const heartX = left + 9.5;
    const heartY = y - 0.7;
    graphics.fillStyle(0x8b1322, 0.52);
    graphics.fillCircle(heartX, heartY + 1, 7.2);
    graphics.fillStyle(0xe63950, 1);
    graphics.fillCircle(heartX - 2.6, heartY - 2.2, 3.25);
    graphics.fillCircle(heartX + 2.6, heartY - 2.2, 3.25);
    graphics.fillTriangle(heartX - 5.4, heartY - 0.3, heartX + 5.4, heartY - 0.3, heartX, heartY + 6.2);
    graphics.fillStyle(0xffd6dc, 0.9);
    graphics.fillCircle(heartX - 2.7, heartY - 3.1, 0.95);

    // The gauge is intentionally the dominant information at a glance.
    const meterLeft = left + 19;
    const meterTop = y - 3.25;
    const meterWidth = 25;
    const meterHeight = 6.5;
    graphics.fillStyle(0x030504, 0.95);
    graphics.fillRoundedRect(meterLeft, meterTop, meterWidth, meterHeight, meterHeight / 2);
    graphics.lineStyle(0.8, 0x443e31, 0.78);
    graphics.strokeRoundedRect(meterLeft + 0.4, meterTop + 0.4, meterWidth - 0.8, meterHeight - 0.8, 2.7);
    if (ratio > 0) {
      const fillWidth = Math.max(meterHeight, meterWidth * ratio);
      graphics.fillStyle(accent, 0.98);
      graphics.fillRoundedRect(meterLeft + 1, meterTop + 1, Math.max(1, fillWidth - 2), meterHeight - 2, (meterHeight - 2) / 2);
      graphics.fillStyle(accentHot, 0.52);
      graphics.fillRoundedRect(meterLeft + 2, meterTop + 1.2, Math.max(1, fillWidth - 4), 1.3, 0.65);
    }

    const text = this.scene.add.text(left + 52.5, y - 0.3, `${unit.hp}/${definition.maxHp}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '10px',
      color: '#fff8e8',
      fontStyle: 'bold',
      stroke: '#070806',
      strokeThickness: 2.4,
    }).setOrigin(0.5);

    this.layer?.add([graphics, text]);
    this.healthBadges.push({
      graphics,
      text,
      critical: ratio <= 0.3,
      phase: [...unit.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.11,
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
