import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { MapRenderMode } from '../data/mapRenderMode';
import type { Coord, GameState } from '../data/types';
import { terrainAt } from './engine';

export interface AuthoredMapSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  renderedUnits: Map<string, { container: Phaser.GameObjects.Container }>;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

interface MapBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * First-pass authored-map renderer.
 *
 * The base GameScene still creates the tiled board so all existing hit targets and
 * gameplay presentation keep working. In authored mode this layer is inserted
 * above that terrain presentation and below sites/units. It intentionally renders
 * only the neutral grass base plus independent bridge overlays for now; large
 * mountain/forest/road/river patches will be added when those authored assets exist.
 */
export class AuthoredMapPresentation {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mode: MapRenderMode,
  ) {}

  render(game: AuthoredMapSceneInternals): void {
    if (this.mode !== 'authored') return;
    const board = game.boardLayer;
    if (!board) return;

    const layer = this.scene.add.container(0, 0);
    this.drawNeutralGrassBase(layer, game);
    this.drawBridgeOverlays(layer, game);

    const unitIndices = [...game.renderedUnits.values()]
      .map((view) => board.getIndex(view.container))
      .filter((index) => index >= 0);
    const firstUnitIndex = unitIndices.length > 0 ? Math.min(...unitIndices) : board.list.length;

    // GameScene currently renders each site as Graphics + Text immediately before
    // units. Insert here so authored terrain replaces tiled terrain/decorations while
    // Forts, Mana Wells, Keeps and units remain independent overlays above it.
    const insertIndex = Math.max(1, firstUnitIndex - game.state.sites.length * 2);
    board.addAt(layer, Math.min(insertIndex, board.list.length));
  }

  private drawNeutralGrassBase(
    layer: Phaser.GameObjects.Container,
    game: AuthoredMapSceneInternals,
  ): void {
    const bounds = this.mapBounds(game);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const graphics = this.scene.add.graphics();

    // Temporary authored-base placeholder. Replace this one object with the final
    // AI-authored neutral grass texture without changing gameplay or layer ordering.
    graphics.fillStyle(0x52743c, 1);
    graphics.fillRect(bounds.left, bounds.top, width, height);

    graphics.fillStyle(0x6f8b4a, 0.18);
    graphics.fillEllipse(bounds.left + width * 0.22, bounds.top + height * 0.27, width * 0.42, height * 0.38);
    graphics.fillEllipse(bounds.left + width * 0.74, bounds.top + height * 0.68, width * 0.5, height * 0.42);
    graphics.fillStyle(0x334f30, 0.12);
    graphics.fillEllipse(bounds.left + width * 0.72, bounds.top + height * 0.18, width * 0.35, height * 0.3);
    graphics.fillEllipse(bounds.left + width * 0.28, bounds.top + height * 0.78, width * 0.42, height * 0.3);

    graphics.lineStyle(2, 0xb1c77a, 0.08);
    for (let index = 0; index < 34; index += 1) {
      const x = bounds.left + 24 + ((index * 173) % Math.max(1, Math.floor(width - 48)));
      const y = bounds.top + 20 + ((index * 269) % Math.max(1, Math.floor(height - 40)));
      graphics.lineBetween(x - 5, y + 5, x, y - 6);
      graphics.lineBetween(x, y - 6, x + 5, y + 4);
    }

    layer.add(graphics);
  }

  private drawBridgeOverlays(
    layer: Phaser.GameObjects.Container,
    game: AuthoredMapSceneInternals,
  ): void {
    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        if (terrainAt(coord) !== 'bridge') continue;
        const center = game.center(coord);
        const bridge = this.scene.add.graphics();
        bridge.fillStyle(0x332218, 0.92);
        bridge.fillRect(center.x - 48, center.y - 20, 96, 40);
        bridge.fillStyle(0xa77a45, 1);
        bridge.fillRect(center.x - 46, center.y - 16, 92, 32);
        bridge.lineStyle(2, 0x51341d, 0.9);
        for (let x = -40; x <= 40; x += 12) {
          bridge.lineBetween(center.x + x, center.y - 16, center.x + x, center.y + 16);
        }
        bridge.lineStyle(3, 0xd1a568, 0.72);
        bridge.lineBetween(center.x - 46, center.y - 18, center.x + 46, center.y - 18);
        bridge.lineBetween(center.x - 46, center.y + 18, center.x + 46, center.y + 18);
        layer.add(bridge);
      }
    }
  }

  private mapBounds(game: AuthoredMapSceneInternals): MapBounds {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        for (const point of game.hexPoints(game.center({ q, r }), 0)) {
          left = Math.min(left, point.x);
          right = Math.max(right, point.x);
          top = Math.min(top, point.y);
          bottom = Math.max(bottom, point.y);
        }
      }
    }

    return {
      left: Math.floor(left - 2),
      right: Math.ceil(right + 2),
      top: Math.floor(top - 2),
      bottom: Math.ceil(bottom + 2),
    };
  }
}
