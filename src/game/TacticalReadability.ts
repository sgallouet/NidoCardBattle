import Phaser from 'phaser';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { Coord, GameState, UnitState } from '../data/types';
import {
  attackUnit,
  coordKey,
  findUnit,
  getAttackTargets,
  getDisplaceDestinations,
  getReachableCoords,
  getRestoreTargets,
  getTacticTargetCoords,
  getTacticTargets,
  isStoppedByBlocking,
  moveUnit,
  sameCoord,
  unitAt,
  unitDefinition,
} from './engine';

export interface TacticalSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  displaceTargetId: string | null;
  restoreSourceId: string | null;
  mode: string | null;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

interface DamagePreview {
  targetDamage: number;
  assists: Array<{ unitId: string; bonus: number }>;
  enemySplash: Array<{ unitId: string; damage: number }>;
  friendlyCounterDamage: Array<{ unitId: string; damage: number }>;
  spawnsSkeleton: boolean;
}

const PLAYER_COLORS = { 1: 0x55b9f3, 2: 0xf05b67 } as const;
const SPLASH_COLOR = 0xf0a45d;
const ASSIST_COLOR = 0xe9e4d6;
const FLANK_COLOR = 0xf3c969;
const CURSE_COLOR = 0xb76cff;
const PATH_COLOR = 0x85d3ff;
const AGILE_PATH_COLOR = 0xf0ce72;
const CAPTURE_COLOR = 0xf0c56b;

const cloneState = (state: GameState): GameState => structuredClone(state);

const damageTaken = (before: UnitState, after: GameState): number =>
  Math.max(0, before.hp - (findUnit(after, before.id)?.hp ?? 0));

export class TacticalReadabilityLayer {
  private layer?: Phaser.GameObjects.Container;
  private hoveredCoord: Coord | null = null;
  private captureMarkers: Phaser.GameObjects.Graphics[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: TacticalSceneInternals,
  ) {}

  install(): void {
    this.scene.input.on('pointermove', this.handlePointerMove);
    this.scene.input.on('gameout', this.handleGameOut);
    this.scene.events.on('update', this.handleUpdate);
    this.scene.events.once('shutdown', () => {
      this.scene.input.off('pointermove', this.handlePointerMove);
      this.scene.input.off('gameout', this.handleGameOut);
      this.scene.events.off('update', this.handleUpdate);
      this.captureMarkers = [];
      this.layer = undefined;
    });
  }

  render(): void {
    if (this.layer?.active) this.layer.destroy(true);
    this.captureMarkers = [];
    const board = this.game.boardLayer;
    if (!board) return;

    this.layer = this.scene.add.container(0, 0);
    board.add(this.layer);

    this.renderSoulLinks();
    this.renderCurseBadges();
    this.renderMoveBonusBadges();
    this.renderPendingCaptures();
    this.renderVictoryCountdown();
    this.renderMovementContext();
    this.renderAbilityContext();
    this.renderAttackContext();
    this.renderTacticContext();
  }

  private hoverAffectsPresentation(): boolean {
    return this.game.mode === 'unit' || this.game.mode === 'card';
  }

  private readonly handleUpdate = (): void => {
    if (this.captureMarkers.length === 0) return;
    const alpha = 0.74 + Math.sin(this.scene.time.now / 360) * 0.18;
    for (const marker of this.captureMarkers) {
      if (marker.active) marker.setAlpha(alpha);
    }
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.isDown) return;
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const next = this.coordAtWorldPoint(world.x, world.y);
    if ((next === null && this.hoveredCoord === null)
      || (next !== null && this.hoveredCoord !== null && sameCoord(next, this.hoveredCoord))) return;
    this.hoveredCoord = next;
    if (this.hoverAffectsPresentation()) this.render();
  };

  private readonly handleGameOut = (): void => {
    if (this.hoveredCoord === null) return;
    this.hoveredCoord = null;
    if (this.hoverAffectsPresentation()) this.render();
  };

  private coordAtWorldPoint(x: number, y: number): Coord | null {
    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        const polygon = new Phaser.Geom.Polygon(this.game.hexPoints(this.game.center(coord)));
        if (Phaser.Geom.Polygon.Contains(polygon, x, y)) return coord;
      }
    }
    return null;
  }

  private add(object: Phaser.GameObjects.GameObject): void {
    this.layer?.add(object);
  }

  private addBadge(
    coord: Coord,
    text: string,
    color: number,
    offsetX: number,
    offsetY: number,
    fontSize = 12,
  ): void {
    const center = this.game.center(coord);
    const badge = this.scene.add.text(center.x + offsetX, center.y + offsetY, text, {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${fontSize}px`,
      color: '#fffaf0',
      fontStyle: 'bold',
      backgroundColor: `#${color.toString(16).padStart(6, '0')}dd`,
      padding: { x: 5, y: 3 },
      stroke: '#111711',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(badge);
  }

  private renderSoulLinks(): void {
    for (const commander of this.game.state.units) {
      if (!commander.soulLinkTargetId) continue;
      const linked = findUnit(this.game.state, commander.soulLinkTargetId);
      if (!linked) continue;
      const from = this.game.center(commander.coord);
      const to = this.game.center(linked.coord);
      const graphics = this.scene.add.graphics();
      graphics.lineStyle(3, CURSE_COLOR, 0.62);
      graphics.lineBetween(from.x, from.y - 7, to.x, to.y - 7);
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 7;
      graphics.fillStyle(0xe5c8ff, 0.85);
      graphics.fillPoints([
        new Phaser.Geom.Point(midX, midY - 6),
        new Phaser.Geom.Point(midX + 6, midY),
        new Phaser.Geom.Point(midX, midY + 6),
        new Phaser.Geom.Point(midX - 6, midY),
      ], true);
      this.add(graphics);
    }
  }

  private renderCurseBadges(): void {
    for (const unit of this.game.state.units) {
      const curses = unit.curses ?? [];
      if (curses.length === 0) continue;
      const remaining = Math.max(...curses.map((curse) => curse.remainingTurns));
      const suffix = curses.length > 1 ? `×${curses.length}` : '';
      this.addBadge(unit.coord, `${remaining}${suffix}`, CURSE_COLOR, -31, -31, 11);
    }
  }

  private renderMoveBonusBadges(): void {
    for (const unit of this.game.state.units) {
      if ((unit.moveBonus ?? 0) <= 0) continue;
      this.addBadge(unit.coord, `+${unit.moveBonus}`, PLAYER_COLORS[unit.owner], 30, -31, 10);
    }
  }

  private renderPendingCaptures(): void {
    for (const site of this.game.state.sites) {
      const occupant = unitAt(this.game.state, site.coord);
      if (!occupant || occupant.owner !== this.game.state.currentPlayer || site.owner === occupant.owner) continue;
      const center = this.game.center(site.coord);
      const graphics = this.scene.add.graphics();
      const outer = this.game.hexPoints(center, -8);
      const edge = this.game.hexPoints(center, -3);
      graphics.fillStyle(0xffb52f, 0.07);
      graphics.fillPoints(edge, true);
      graphics.lineStyle(14, 0xff9f1c, 0.11);
      graphics.strokePoints(edge, true);
      graphics.lineStyle(7, CAPTURE_COLOR, 0.3);
      graphics.strokePoints(edge, true);
      graphics.lineStyle(3.2, 0xffd464, 0.92);
      graphics.strokePoints(edge, true);
      graphics.lineStyle(1.1, 0xffffcf, 0.98);
      graphics.strokePoints(edge, true);
      for (const point of edge) {
        graphics.fillStyle(0xffffcf, 0.9);
        graphics.fillCircle(point.x, point.y, 2.6);
      }
      graphics.lineStyle(2, 0xffe79a, 0.74);
      for (let index = 0; index < outer.length; index += 2) {
        const point = outer[index];
        const direction = new Phaser.Math.Vector2(point.x - center.x, point.y - center.y).normalize();
        graphics.lineBetween(
          point.x + direction.x * 2,
          point.y + direction.y * 2,
          point.x + direction.x * 10,
          point.y + direction.y * 10,
        );
      }
      this.add(graphics);
      this.captureMarkers.push(graphics);
    }
  }

  private renderVictoryCountdown(): void {
    const countdown = this.game.state.countdown;
    if (!countdown || this.game.state.winner) return;
    const commander = this.game.state.units.find((unit) => unit.owner === countdown.player && unit.definitionId === 'commander');
    if (!commander) return;
    const remaining = Math.max(1, 3 - countdown.checkpoints);
    const center = this.game.center(commander.coord);
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(5, PLAYER_COLORS[countdown.player], 0.85);
    graphics.strokeCircle(center.x, center.y, 52);
    this.add(graphics);
    this.addBadge(commander.coord, `${remaining}`, PLAYER_COLORS[countdown.player], 39, -42, 15);
  }

  private renderMovementContext(): void {
    if (this.game.mode !== 'unit' || !this.game.selectedUnitId) return;
    const selected = findUnit(this.game.state, this.game.selectedUnitId);
    if (!selected || selected.owner !== this.game.state.currentPlayer) return;

    const reachable = getReachableCoords(this.game.state, selected.id);
    for (const key of reachable.keys()) {
      const [q, r] = key.split(',').map(Number);
      const coord = { q, r };
      if (!isStoppedByBlocking(this.game.state, selected, coord)) continue;
      this.drawTerminalBlock(coord);
    }

    if (!this.hoveredCoord || !reachable.has(coordKey(this.hoveredCoord))) return;
    const preview = cloneState(this.game.state);
    const result = moveUnit(preview, selected.id, this.hoveredCoord);
    if (!result.ok || !result.path || result.path.length < 2) return;

    const agileAfterAttack = unitDefinition(selected).traits.includes('AgileAssault') && selected.attacked;
    const color = agileAfterAttack ? AGILE_PATH_COLOR : PATH_COLOR;
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(3, color, 0.72);
    for (let index = 1; index < result.path.length; index += 1) {
      const previous = this.game.center(result.path[index - 1]);
      const current = this.game.center(result.path[index]);
      graphics.lineBetween(previous.x, previous.y, current.x, current.y);
      graphics.fillStyle(color, index === result.path.length - 1 ? 0.95 : 0.7);
      graphics.fillCircle(current.x, current.y, index === result.path.length - 1 ? 6 : 4);
    }
    this.add(graphics);
  }

  private drawTerminalBlock(coord: Coord): void {
    const center = this.game.center(coord);
    const graphics = this.scene.add.graphics();
    const x = center.x + 27;
    const y = center.y + 22;
    graphics.lineStyle(2, 0xffd6d8, 0.85);
    graphics.strokeCircle(x, y - 5, 6);
    graphics.fillStyle(0x8c3944, 0.9);
    graphics.fillRect(x - 7, y - 5, 14, 11);
    this.add(graphics);
  }

  private renderAbilityContext(): void {
    if (this.game.mode === 'restore-target' && this.game.restoreSourceId) {
      for (const target of getRestoreTargets(this.game.state, this.game.restoreSourceId)) {
        this.addBadge(target.coord, '+2', 0x3f9f6b, 28, -28, 11);
      }
    }

    if (this.game.mode === 'displace-destination' && this.game.selectedUnitId && this.game.displaceTargetId) {
      const target = findUnit(this.game.state, this.game.displaceTargetId);
      if (!target) return;
      for (const destination of getDisplaceDestinations(
        this.game.state,
        this.game.selectedUnitId,
        this.game.displaceTargetId,
      )) {
        this.drawArrow(target.coord, destination, 0x8de4ff);
      }
    }
  }

  private drawArrow(fromCoord: Coord, toCoord: Coord, color: number): void {
    const from = this.game.center(fromCoord);
    const to = this.game.center(toCoord);
    const direction = new Phaser.Math.Vector2(to.x - from.x, to.y - from.y).normalize();
    const start = new Phaser.Math.Vector2(from.x, from.y).add(direction.clone().scale(24));
    const end = new Phaser.Math.Vector2(to.x, to.y).subtract(direction.clone().scale(16));
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(3, color, 0.78);
    graphics.lineBetween(start.x, start.y, end.x, end.y);
    const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x);
    const left = end.clone().subtract(direction.clone().scale(10)).add(perpendicular.clone().scale(6));
    const right = end.clone().subtract(direction.clone().scale(10)).subtract(perpendicular.clone().scale(6));
    graphics.fillStyle(color, 0.9);
    graphics.fillTriangle(end.x, end.y, left.x, left.y, right.x, right.y);
    this.add(graphics);
  }

  private renderAttackContext(): void {
    if (this.game.mode !== 'unit' || !this.game.selectedUnitId || !this.hoveredCoord) return;
    const attacker = findUnit(this.game.state, this.game.selectedUnitId);
    const defender = unitAt(this.game.state, this.hoveredCoord);
    if (!attacker || !defender || defender.owner === attacker.owner) return;
    if (!getAttackTargets(this.game.state, attacker.id).some((target) => target.id === defender.id)) return;

    const preview = this.previewAttack(attacker, defender);
    const targetCenter = this.game.center(defender.coord);

    if (preview.targetDamage > 0) this.addBadge(defender.coord, `−${preview.targetDamage}`, 0xa93d4a, 0, -45, 12);

    for (const assist of preview.assists) {
      const assister = findUnit(this.game.state, assist.unitId);
      if (!assister) continue;
      const from = this.game.center(assister.coord);
      const to = targetCenter;
      const color = assist.bonus >= 2 ? FLANK_COLOR : ASSIST_COLOR;
      const line = this.scene.add.graphics();
      line.lineStyle(assist.bonus >= 2 ? 4 : 2, color, assist.bonus >= 2 ? 0.9 : 0.7);
      line.lineBetween(from.x, from.y - 6, to.x, to.y - 6);
      this.add(line);
      const mid = new Phaser.Math.Vector2((from.x + to.x) / 2, (from.y + to.y) / 2 - 12);
      const label = this.scene.add.text(mid.x, mid.y, `+${assist.bonus}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: assist.bonus >= 2 ? '#ffe69b' : '#fffdf5',
        fontStyle: 'bold',
        stroke: '#171b16',
        strokeThickness: 4,
      }).setOrigin(0.5);
      this.add(label);
    }

    for (const splash of preview.enemySplash) {
      const target = findUnit(this.game.state, splash.unitId);
      if (!target) continue;
      const center = this.game.center(target.coord);
      const isSoulLinked = defender.soulLinkTargetId === target.id;
      const color = isSoulLinked ? CURSE_COLOR : SPLASH_COLOR;
      const splashRing = this.scene.add.graphics();
      splashRing.lineStyle(4, color, 0.82);
      splashRing.strokeCircle(center.x, center.y, 39);
      this.add(splashRing);
      this.addBadge(target.coord, `−${splash.damage}`, isSoulLinked ? 0x67367e : 0xa9652e, 0, -43, 11);
    }

    for (const counter of preview.friendlyCounterDamage) {
      const target = findUnit(this.game.state, counter.unitId);
      if (!target) continue;
      this.addBadge(target.coord, `↩${counter.damage}`, 0x783b83, 0, -45, 11);
    }

    if (preview.spawnsSkeleton) {
      const skull = this.scene.add.text(targetCenter.x, targetCenter.y + 34, '☠', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#e8eadb',
        stroke: '#20251f',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0.72);
      this.add(skull);
    }
  }

  private previewAttack(attacker: UnitState, defender: UnitState): DamagePreview {
    const baseline = cloneState(this.game.state);
    attackUnit(baseline, attacker.id, defender.id);
    const targetDamage = damageTaken(defender, baseline);

    const enemySplash = this.game.state.units
      .filter((unit) => unit.owner !== attacker.owner && unit.id !== defender.id)
      .map((unit) => ({ unitId: unit.id, damage: damageTaken(unit, baseline) }))
      .filter((entry) => entry.damage > 0);

    const friendlyCounterDamage = this.game.state.units
      .filter((unit) => unit.owner === attacker.owner)
      .map((unit) => ({ unitId: unit.id, damage: damageTaken(unit, baseline) }))
      .filter((entry) => entry.damage > 0);

    const assists = this.previewAssistContributors(attacker, defender);
    const originalIds = new Set(this.game.state.units.map((unit) => unit.id));
    const spawnsSkeleton = baseline.units.some((unit) => !originalIds.has(unit.id)
      && unit.definitionId === 'skeletalInfantry'
      && sameCoord(unit.coord, defender.coord));

    return { targetDamage, assists, enemySplash, friendlyCounterDamage, spawnsSkeleton };
  }

  private previewAssistContributors(attacker: UnitState, defender: UnitState): Array<{ unitId: string; bonus: number }> {
    const candidates = this.game.state.units.filter((unit) => unit.owner === attacker.owner && unit.id !== attacker.id);
    if (candidates.length === 0) return [];

    const directState = cloneState(this.game.state);
    const directDefender = findUnit(directState, defender.id);
    if (!directDefender) return [];
    directDefender.hp = 99;
    for (const candidate of directState.units) {
      if (candidate.owner === attacker.owner && candidate.id !== attacker.id) candidate.exhausted = true;
    }
    attackUnit(directState, attacker.id, defender.id);
    const directDamage = 99 - (findUnit(directState, defender.id)?.hp ?? 0);

    const contributions: Array<{ unitId: string; bonus: number }> = [];
    for (const candidate of candidates) {
      const candidateState = cloneState(this.game.state);
      const candidateDefender = findUnit(candidateState, defender.id);
      if (!candidateDefender) continue;
      candidateDefender.hp = 99;
      for (const ally of candidateState.units) {
        if (ally.owner === attacker.owner && ally.id !== attacker.id && ally.id !== candidate.id) ally.exhausted = true;
      }
      attackUnit(candidateState, attacker.id, defender.id);
      const damage = 99 - (findUnit(candidateState, defender.id)?.hp ?? 0);
      const bonus = damage - directDamage;
      if (bonus > 0) contributions.push({ unitId: candidate.id, bonus });
    }
    return contributions;
  }

  private renderTacticContext(): void {
    if (this.game.mode !== 'card' || this.game.selectedCardIndex === null || !this.hoveredCoord) return;
    const cardId = this.game.state.players[this.game.state.currentPlayer].hand[this.game.selectedCardIndex] as CardDefinitionId | undefined;
    const card = cardId ? CARD_DEFINITIONS[cardId] : undefined;
    if (!card || card.type !== 'tactic') return;

    const legalCoord = getTacticTargetCoords(this.game.state, card.id).some((coord) => sameCoord(coord, this.hoveredCoord!));
    const occupant = unitAt(this.game.state, this.hoveredCoord);
    const legalUnit = occupant
      ? getTacticTargets(this.game.state, card.id).some((unit) => unit.id === occupant.id)
      : false;
    if (!legalCoord && !legalUnit) return;

    let label: string;
    switch (card.effect.kind) {
      case 'graveLock': label = 'LOCK'; break;
      case 'buildBridge': label = 'BRIDGE'; break;
      case 'scorch': label = 'PLAIN'; break;
      case 'raiseFort': label = 'FORT'; break;
      case 'profaneWell': label = 'WELL · 3'; break;
    }
    this.addBadge(this.hoveredCoord, label, card.faction === 'undead' ? 0x6f3ca4 : card.faction === 'human' ? 0x326e93 : 0x806737, 0, -43, 11);
  }
}
