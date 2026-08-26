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
  getSoulLinkTargets,
  unitDefinition,
} from './engine';

interface RenderedUnitView {
  container: Phaser.GameObjects.Container;
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

const MOVE_COLOR = 0x4eb9ff;
const ATTACK_COLOR = 0xff7180;
const SPENT_COLOR = 0x26332d;
const PREVIEW_BG = '#24171ae8';
const LETHAL_BG = '#4a1018ee';

export class ActionReadabilityLayer {
  private layer?: Phaser.GameObjects.Container;
  private lethalMarkers: Phaser.GameObjects.Graphics[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: ActionReadabilitySceneInternals,
  ) {}

  install(): void {
    this.scene.events.on('update', this.handleUpdate);
    this.scene.events.once('shutdown', () => {
      this.scene.events.off('update', this.handleUpdate);
      this.lethalMarkers = [];
      this.layer = undefined;
    });
  }

  render(): void {
    if (this.layer?.active) this.layer.destroy(true);
    this.lethalMarkers = [];
    for (const view of this.game.renderedUnits.values()) view.container.setAlpha(1);

    const board = this.game.boardLayer;
    if (!board || this.game.state.winner || this.game.animationInProgress) return;
    this.layer = this.scene.add.container(0, 0);
    board.add(this.layer);

    this.renderActionStates();
    this.renderCombatPreviews();
  }

  private readonly handleUpdate = (): void => {
    if (this.lethalMarkers.length === 0) return;
    const alpha = 0.7 + Math.sin(this.scene.time.now / 145) * 0.24;
    for (const marker of this.lethalMarkers) {
      if (marker.active) marker.setAlpha(alpha);
    }
  };

  private renderActionStates(): void {
    for (const unit of this.game.state.units) {
      if (unit.owner !== this.game.state.currentPlayer) continue;
      const canMove = getReachableCoords(this.game.state, unit.id).size > 0;
      const canAttack = getAttackTargets(this.game.state, unit.id).length > 0 || this.hasLegalSpell(unit);
      const done = !canMove && !canAttack;

      const view = this.game.renderedUnits.get(unit.id);
      if (view) view.container.setAlpha(done ? 0.68 : 1);
      this.drawActionArcs(unit.coord, canMove, canAttack);
    }
  }

  private hasLegalSpell(unit: UnitState): boolean {
    if (getInvokeDestinations(this.game.state, unit.id).length > 0) return true;
    switch (unitDefinition(unit).ability) {
      case 'Displace':
        return getDisplaceTargets(this.game.state, unit.id)
          .some((target) => getDisplaceDestinations(this.game.state, unit.id, target.id).length > 0);
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

  private drawActionArcs(coord: Coord, canMove: boolean, canAttack: boolean): void {
    const center = this.game.center(coord);
    const graphics = this.scene.add.graphics();
    const y = center.y + 17;
    const radius = 31;

    this.strokeArc(graphics, center.x, y, radius, 18, 78, SPENT_COLOR, 3, 0.58);
    this.strokeArc(graphics, center.x, y, radius, 102, 162, SPENT_COLOR, 3, 0.58);
    if (canMove) this.strokeArc(graphics, center.x, y, radius, 18, 78, MOVE_COLOR, 4, 0.92);
    if (canAttack) this.strokeArc(graphics, center.x, y, radius, 102, 162, ATTACK_COLOR, 4, 0.92);
    this.layer?.add(graphics);
  }

  private strokeArc(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    startDegrees: number,
    endDegrees: number,
    color: number,
    width: number,
    alpha: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.arc(
      x,
      y,
      radius,
      Phaser.Math.DegToRad(startDegrees),
      Phaser.Math.DegToRad(endDegrees),
      false,
    );
    graphics.strokePath();
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
