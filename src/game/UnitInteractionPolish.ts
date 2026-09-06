import Phaser from 'phaser';
import type { Coord, GameState } from '../data/types';

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

const HOVER_RADIUS = 44;
const HOVER_SCALE = 1.025;
const SELECTED_SCALE = 1.05;

/** Presentation-only tactile response for battlefield units. */
export class UnitInteractionPolish {
  private hoveredUnitId: string | null = null;

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
    if (this.game.animationInProgress) return;

    for (const [unitId, view] of this.game.renderedUnits) {
      view.container.setScale(this.targetScale(unitId));
    }
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.isDown || this.game.animationInProgress) return;
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const next = this.unitAtWorldPoint(world.x, world.y);
    if (next === this.hoveredUnitId) return;
    this.hoveredUnitId = next;
    this.animateUnitScales();
  };

  private readonly handleGameOut = (): void => {
    if (this.hoveredUnitId === null) return;
    this.hoveredUnitId = null;
    this.animateUnitScales();
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

  private destroy(): void {
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.input.off('gameout', this.handleGameOut);
    this.hoveredUnitId = null;
  }
}
