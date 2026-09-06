import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { Coord, GameState, UnitState } from '../data/types';
import {
  coordKey,
  effectiveRange,
  findUnit,
  getAttackTargets,
  getReachableCoords,
  hexDistance,
  moveUnit,
  unitDefinition,
} from './engine';
import { TacticalHexFxLayer } from './TacticalHexFx';

export interface EnemyUnitThreatPreviewSceneInternals {
  state: GameState;
  selectedUnitId: string | null;
  animationInProgress: boolean;
  mode: string | null;
  message: string;
  boardLayer?: Phaser.GameObjects.Container;
  renderAll: () => void;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

const UNIT_HIT_RADIUS = 44;
const THREAT_FX_DEPTH = 998;

/** Read-only next-turn movement and normal-attack threat preview for a selected enemy unit. */
export class EnemyUnitThreatPreview {
  private layer?: TacticalHexFxLayer;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: EnemyUnitThreatPreviewSceneInternals,
  ) {}

  install(): void {
    this.scene.input.on('pointerup', this.handlePointerUp);
    this.sync();
  }

  sync(): void {
    this.clear();
    if (this.game.animationInProgress || this.game.state.winner || !this.game.boardLayer) return;

    const selected = this.game.selectedUnitId
      ? findUnit(this.game.state, this.game.selectedUnitId)
      : undefined;
    if (!selected || selected.owner === this.game.state.currentPlayer) return;

    const preview = this.freshTurnPreview(selected.id);
    const previewUnit = findUnit(preview, selected.id);
    if (!previewUnit) return;

    const moveReach = getReachableCoords(preview, previewUnit.id);
    const moveKeys = new Set(moveReach.keys());
    const attackKeys = this.attackThreatKeys(previewUnit, moveKeys);
    const layer = new TacticalHexFxLayer(this.scene, THREAT_FX_DEPTH);
    this.layer = layer;
    this.game.boardLayer.add(layer.container);

    for (const key of moveKeys) {
      const coord = this.coordFromKey(key);
      const center = this.game.center(coord);
      layer.add(
        `enemy-move:${key}`,
        center,
        this.game.hexPoints(center),
        'move',
        this.phase(coord),
        this.movementPath(preview, previewUnit.id, coord),
      );
    }

    // Keep legal movement destinations blue so the movement footprint remains readable;
    // red fills the additional tiles the unit could threaten after taking that movement.
    for (const key of attackKeys) {
      if (moveKeys.has(key)) continue;
      const coord = this.coordFromKey(key);
      const center = this.game.center(coord);
      layer.add(
        `enemy-attack:${key}`,
        center,
        this.game.hexPoints(center),
        'attack',
        this.phase(coord),
      );
    }
    this.game.boardLayer.sort('depth');
  }

  destroy(): void {
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.clear();
  }

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.game.animationInProgress || this.game.state.winner) return;
    if (this.game.mode !== null && this.game.mode !== 'unit') return;

    const clicked = this.unitAtPointer(pointer);
    if (!clicked || clicked.owner === this.game.state.currentPlayer) return;

    const selected = this.game.selectedUnitId
      ? findUnit(this.game.state, this.game.selectedUnitId)
      : undefined;
    if (selected?.owner === this.game.state.currentPlayer
      && getAttackTargets(this.game.state, selected.id).some((target) => target.id === clicked.id)) {
      // A legal enemy click belongs to the normal attack flow, not inspection.
      return;
    }
    if (this.game.selectedUnitId === clicked.id && this.game.mode === null) return;

    this.game.selectedUnitId = clicked.id;
    this.game.mode = null;
    this.game.message = `${unitDefinition(clicked).name} selected — showing next-turn threat.`;
    this.game.renderAll();
  };

  private unitAtPointer(pointer: Phaser.Input.Pointer): UnitState | undefined {
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let nearest: { unit: UnitState; distance: number } | undefined;
    for (const unit of this.game.state.units) {
      const center = this.game.center(unit.coord);
      const distance = Phaser.Math.Distance.Between(world.x, world.y, center.x, center.y - 6);
      if (distance > UNIT_HIT_RADIUS || (nearest && distance >= nearest.distance)) continue;
      nearest = { unit, distance };
    }
    return nearest?.unit;
  }

  private freshTurnPreview(unitId: string): GameState {
    const preview = structuredClone(this.game.state);
    const unit = findUnit(preview, unitId);
    if (!unit) return preview;

    preview.currentPlayer = unit.owner;
    preview.winner = null;
    unit.exhausted = false;
    unit.moved = false;
    unit.attacked = false;
    unit.movementSpent = 0;
    unit.postAttackMoved = false;
    unit.moveBonus = 0;
    delete unit.pendingAdvance;
    return preview;
  }

  private attackThreatKeys(
    unit: UnitState,
    moveKeys: Set<string>,
  ): Set<string> {
    const definition = unitDefinition(unit);
    const threatened = new Set<string>();
    if (definition.normalAttack === false) return threatened;

    const origins: Coord[] = [{ ...unit.coord }];
    if (!definition.traits.includes('SetShot')) {
      for (const key of moveKeys) origins.push(this.coordFromKey(key));
    }

    for (const origin of origins) {
      const projectedUnit = { ...unit, coord: origin, movementSpent: 0 };
      const range = effectiveRange(projectedUnit);
      for (let r = 0; r < MAP_HEIGHT; r += 1) {
        for (let q = 0; q < MAP_WIDTH; q += 1) {
          const coord = { q, r };
          const distance = hexDistance(origin, coord);
          if (distance > 0 && distance <= range) threatened.add(coordKey(coord));
        }
      }
    }
    threatened.delete(coordKey(unit.coord));
    return threatened;
  }

  private movementPath(preview: GameState, unitId: string, destination: Coord): Phaser.Math.Vector2[] | undefined {
    const pathState = structuredClone(preview);
    const result = moveUnit(pathState, unitId, destination);
    if (!result.ok || !result.path) return undefined;
    return result.path.map((coord) => this.game.center(coord));
  }

  private coordFromKey(key: string): Coord {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
  }

  private phase(coord: Coord): number {
    return (coord.q * 1.77 + coord.r * 2.31) % (Math.PI * 2);
  }

  private clear(): void {
    this.layer?.destroy();
    this.layer = undefined;
  }
}
