import Phaser from 'phaser';
import type { Coord, GameState, PlayerId } from '../data/types';

interface RenderedUnitView {
  container: Phaser.GameObjects.Container;
}

export interface UnitInteractionSceneInternals {
  state: GameState;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  boardLayer?: Phaser.GameObjects.Container;
  renderedUnits: Map<string, RenderedUnitView>;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x55b9f3, 2: 0xf05b67 };
const HOVER_RADIUS = 44;
const HOVER_SCALE = 1.025;
const SELECTED_SCALE = 1.05;

/** Presentation-only tactile response for battlefield units. */
export class UnitInteractionPolish {
  private hoveredUnitId: string | null = null;
  private haloObjects: Phaser.GameObjects.Graphics[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: UnitInteractionSceneInternals,
  ) {}

  install(): void {
    this.scene.input.on('pointermove', this.handlePointerMove);
    this.scene.input.on('gameout', this.handleGameOut);
    this.scene.events.once('shutdown', () => this.destroy());
  }

  render(): void {
    this.clearHalos();
    if (this.game.animationInProgress) return;

    for (const [unitId, view] of this.game.renderedUnits) {
      view.container.setScale(this.targetScale(unitId));
    }
    this.renderHalos();
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.isDown || this.game.animationInProgress) return;
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const next = this.unitAtWorldPoint(world.x, world.y);
    if (next === this.hoveredUnitId) return;
    this.hoveredUnitId = next;
    this.animateUnitScales();
    this.clearHalos();
    this.renderHalos();
  };

  private readonly handleGameOut = (): void => {
    if (this.hoveredUnitId === null) return;
    this.hoveredUnitId = null;
    this.animateUnitScales();
    this.clearHalos();
    this.renderHalos();
  };

  private unitAtWorldPoint(x: number, y: number): string | null {
    let nearest: { id: string; distance: number } | null = null;
    for (const unit of this.game.state.units) {
      const center = this.game.center(unit.coord);
      const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y - 6);
      if (distance > HOVER_RADIUS || (nearest && distance >= nearest.distance)) continue;
      nearest = { id: unit.id, distance };
    }
    return nearest?.id ?? null;
  }

  private targetScale(unitId: string): number {
    if (unitId === this.game.selectedUnitId) return SELECTED_SCALE;
    if (unitId === this.hoveredUnitId) return HOVER_SCALE;
    return 1;
  }

  private animateUnitScales(): void {
    if (this.game.animationInProgress) return;
    for (const [unitId, view] of this.game.renderedUnits) {
      const scale = this.targetScale(unitId);
      this.scene.tweens.killTweensOf(view.container);
      this.scene.tweens.add({
        targets: view.container,
        scaleX: scale,
        scaleY: scale,
        duration: unitId === this.game.selectedUnitId ? 125 : 95,
        ease: 'Cubic.easeOut',
      });
    }
  }

  private renderHalos(): void {
    const board = this.game.boardLayer;
    if (!board || this.game.animationInProgress) return;

    const ids = new Set<string>();
    if (this.hoveredUnitId) ids.add(this.hoveredUnitId);
    if (this.game.selectedUnitId) ids.add(this.game.selectedUnitId);

    for (const unitId of ids) {
      const unit = this.game.state.units.find((candidate) => candidate.id === unitId);
      const view = this.game.renderedUnits.get(unitId);
      if (!unit || !view) continue;
      const center = this.game.center(unit.coord);
      const selected = unitId === this.game.selectedUnitId;
      const color = PLAYER_COLORS[unit.owner];
      const halo = this.scene.add.graphics();

      halo.fillStyle(color, selected ? 0.11 : 0.06);
      halo.fillEllipse(center.x, center.y + 21, selected ? 70 : 62, selected ? 23 : 19);
      halo.lineStyle(selected ? 2.5 : 1.5, selected ? 0xffe5a3 : color, selected ? 0.82 : 0.48);
      halo.strokeEllipse(center.x, center.y + 21, selected ? 72 : 64, selected ? 25 : 21);
      if (selected) {
        halo.lineStyle(1, color, 0.5);
        halo.strokeEllipse(center.x, center.y + 21, 82, 29);
      }

      const unitIndex = board.getIndex(view.container);
      board.addAt(halo, unitIndex >= 0 ? unitIndex : board.list.length);
      this.haloObjects.push(halo);
    }
  }

  private clearHalos(): void {
    for (const halo of this.haloObjects) halo.destroy();
    this.haloObjects = [];
  }

  private destroy(): void {
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.input.off('gameout', this.handleGameOut);
    this.clearHalos();
    this.hoveredUnitId = null;
  }
}
