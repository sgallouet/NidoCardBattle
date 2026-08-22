import Phaser from 'phaser';
import type { Coord, GameState, UnitState } from '../data/types';
import {
  attackUnit,
  findUnit,
  getAttackTargets,
  getCurseTargets,
  getDisplaceTargets,
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
  selectedUnitId: string | null;
  mode: string | null;
  renderedUnits: Map<string, RenderedUnitView>;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

const MOVE_COLOR = 0x68e4cf;
const ATTACK_COLOR = 0xff7180;
const SPENT_COLOR = 0x26332d;
const LETHAL_COLOR = 0xff304c;

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
    if (!board || this.game.state.winner) return;
    this.layer = this.scene.add.container(0, 0);
    board.add(this.layer);

    this.renderActionStates();
    this.renderLethalTargets();
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
    switch (unitDefinition(unit).ability) {
      case 'Displace':
        return getDisplaceTargets(this.game.state, unit.id).length > 0;
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

  private renderLethalTargets(): void {
    if (this.game.mode !== 'unit' || !this.game.selectedUnitId) return;
    const attacker = findUnit(this.game.state, this.game.selectedUnitId);
    if (!attacker || attacker.owner !== this.game.state.currentPlayer) return;

    for (const target of getAttackTargets(this.game.state, attacker.id)) {
      const preview = structuredClone(this.game.state);
      const result = attackUnit(preview, attacker.id, target.id);
      if (!result.ok || findUnit(preview, target.id)) continue;
      this.drawLethalMarker(target.coord);
    }
  }

  private drawLethalMarker(coord: Coord): void {
    const center = this.game.center(coord);
    const graphics = this.scene.add.graphics();

    graphics.lineStyle(5, LETHAL_COLOR, 0.95);
    graphics.strokeCircle(center.x, center.y, 44);
    graphics.lineStyle(2, 0xfff1e8, 0.86);
    for (const angleDegrees of [45, 135, 225, 315]) {
      const angle = Phaser.Math.DegToRad(angleDegrees);
      graphics.lineBetween(
        center.x + Math.cos(angle) * 47,
        center.y + Math.sin(angle) * 47,
        center.x + Math.cos(angle) * 55,
        center.y + Math.sin(angle) * 55,
      );
    }

    const skullX = center.x + 31;
    const skullY = center.y - 35;
    graphics.fillStyle(0x330a11, 0.96);
    graphics.fillCircle(skullX, skullY, 11);
    graphics.fillRect(skullX - 7, skullY + 5, 14, 8);
    graphics.lineStyle(2, 0xffe9e4, 1);
    graphics.strokeCircle(skullX, skullY, 9);
    graphics.lineBetween(skullX - 6, skullY + 7, skullX + 6, skullY + 7);
    graphics.fillStyle(0xffe9e4, 1);
    graphics.fillCircle(skullX - 4, skullY - 1, 2);
    graphics.fillCircle(skullX + 4, skullY - 1, 2);
    graphics.fillTriangle(skullX, skullY + 2, skullX - 2, skullY + 5, skullX + 2, skullY + 5);

    this.layer?.add(graphics);
    this.lethalMarkers.push(graphics);
  }
}
