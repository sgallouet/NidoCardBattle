import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { Coord } from '../data/types';
import { terrainAt } from './engine';

export interface CelShadedRiverSceneInternals {
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

interface RiverCell {
  coord: Coord;
  center: Phaser.Math.Vector2;
  points: Phaser.Geom.Point[];
  flowAngle: number;
}

interface Ripple {
  graphics: Phaser.GameObjects.Graphics;
  phase: number;
}

const BASE_DEEP = 0x0a2c38;
const BASE_MID = 0x124753;
const BASE_LIGHT = 0x1c6270;
const BAND_LIGHT = 0x2b7880;
const STREAK_SOFT = 0x69c2c7;
const STREAK_BRIGHT = 0xc4f1e9;
const BANK_DARK = 0x061b23;
const BANK_LIGHT = 0x70b7a9;
const FLOW_LAYER_ALPHA = 0.72;

const coordSeed = (coord: Coord): number => ((coord.q * 92821) ^ (coord.r * 68917)) >>> 0;

/**
 * Presentation-only river renderer. It deliberately uses simple geometry and a
 * tiny amount of animation instead of texture displacement so the water reads
 * as authored cel-shading at strategy-game distance and stays cheap on mobile.
 */
export class CelShadedRiverSurface {
  private root?: Phaser.GameObjects.Container;
  private maskGraphics?: Phaser.GameObjects.Graphics;
  private softStreaks?: Phaser.GameObjects.Graphics;
  private brightStreaks?: Phaser.GameObjects.Graphics;
  private ripples: Ripple[] = [];
  private reducedMotion = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: CelShadedRiverSceneInternals,
  ) {}

  render(): void {
    this.destroy();
    const cells = this.collectCells();
    const board = this.game.boardLayer;
    if (!board || cells.length === 0) return;

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.assignFlowAngles(cells);

    const bounds = this.boundsFor(cells);
    const root = this.scene.add.container(0, 0).setName('tiled-terrain');
    const surface = this.scene.add.container(0, 0);

    const base = this.scene.add.graphics();
    base.fillStyle(BASE_DEEP, 1);
    base.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);

    const depth = this.scene.add.graphics();
    this.drawBroadWaterBands(depth, bounds);

    const facets = this.scene.add.graphics();
    this.drawFacets(facets, cells);

    const soft = this.scene.add.graphics();
    const bright = this.scene.add.graphics();
    this.drawFlowStreaks(soft, bright, cells);

    surface.add([base, depth, facets, soft, bright]);
    this.softStreaks = soft;
    this.brightStreaks = bright;

    const mask = new Phaser.GameObjects.Graphics(this.scene);
    mask.fillStyle(0xffffff, 1);
    for (const cell of cells) mask.fillPoints(cell.points, true);
    surface.setMask(mask.createGeometryMask());
    this.maskGraphics = mask;

    const shoreline = this.scene.add.graphics();
    this.drawShoreline(shoreline, cells);

    root.add([surface, shoreline]);
    board.add(root);
    this.root = root;

    this.createRipples(surface, cells);
    if (!this.reducedMotion) this.scene.events.on('update', this.handleUpdate);
    else this.applyStaticMotionPose();
  }

  destroy(): void {
    this.scene.events.off('update', this.handleUpdate);
    this.ripples = [];
    this.softStreaks = undefined;
    this.brightStreaks = undefined;
    this.root?.destroy(true);
    this.root = undefined;
    this.maskGraphics?.destroy();
    this.maskGraphics = undefined;
  }

  private collectCells(): RiverCell[] {
    const cells: RiverCell[] = [];
    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        const terrain = terrainAt(coord);
        if (terrain !== 'water' && terrain !== 'bridge') continue;
        const center = this.game.center(coord);
        cells.push({
          coord,
          center,
          points: this.game.hexPoints(center, 0),
          flowAngle: 0,
        });
      }
    }
    return cells;
  }

  private assignFlowAngles(cells: RiverCell[]): void {
    for (const cell of cells) {
      const neighbours = cells
        .filter((candidate) => candidate !== cell)
        .map((candidate) => ({
          candidate,
          distance: Phaser.Math.Distance.Between(
            cell.center.x,
            cell.center.y,
            candidate.center.x,
            candidate.center.y,
          ),
        }))
        .filter(({ distance }) => distance > 60 && distance < 92)
        .sort((a, b) => a.distance - b.distance);

      if (neighbours.length >= 2) {
        let bestA = neighbours[0].candidate;
        let bestB = neighbours[1].candidate;
        let bestSeparation = -1;
        for (let a = 0; a < neighbours.length; a += 1) {
          for (let b = a + 1; b < neighbours.length; b += 1) {
            const separation = Phaser.Math.Distance.Between(
              neighbours[a].candidate.center.x,
              neighbours[a].candidate.center.y,
              neighbours[b].candidate.center.x,
              neighbours[b].candidate.center.y,
            );
            if (separation <= bestSeparation) continue;
            bestSeparation = separation;
            bestA = neighbours[a].candidate;
            bestB = neighbours[b].candidate;
          }
        }
        cell.flowAngle = Phaser.Math.Angle.Between(
          bestA.center.x,
          bestA.center.y,
          bestB.center.x,
          bestB.center.y,
        );
      } else if (neighbours.length === 1) {
        cell.flowAngle = Phaser.Math.Angle.Between(
          cell.center.x,
          cell.center.y,
          neighbours[0].candidate.center.x,
          neighbours[0].candidate.center.y,
        );
      }
    }
  }

  private boundsFor(cells: RiverCell[]): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const xs = cells.flatMap((cell) => cell.points.map((point) => point.x));
    const ys = cells.flatMap((cell) => cell.points.map((point) => point.y));
    const left = Math.min(...xs) - 8;
    const right = Math.max(...xs) + 8;
    const top = Math.min(...ys) - 8;
    const bottom = Math.max(...ys) + 8;
    return { left, top, width: right - left, height: bottom - top };
  }

  private drawBroadWaterBands(
    graphics: Phaser.GameObjects.Graphics,
    bounds: { left: number; top: number; width: number; height: number },
  ): void {
    graphics.fillStyle(BASE_MID, 0.88);
    graphics.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);

    const bandHeight = Math.max(54, bounds.height / 7);
    for (let index = -1; index < 8; index += 1) {
      const y = bounds.top + index * bandHeight;
      const tilt = index % 2 === 0 ? 42 : -34;
      graphics.fillStyle(index % 3 === 0 ? BASE_LIGHT : BAND_LIGHT, index % 3 === 0 ? 0.22 : 0.12);
      graphics.fillPoints([
        new Phaser.Geom.Point(bounds.left - 80, y),
        new Phaser.Geom.Point(bounds.left + bounds.width + 80, y + tilt),
        new Phaser.Geom.Point(bounds.left + bounds.width + 80, y + bandHeight * 0.72 + tilt),
        new Phaser.Geom.Point(bounds.left - 80, y + bandHeight * 0.72),
      ], true);
    }

    graphics.fillStyle(0x031c27, 0.16);
    graphics.fillRect(bounds.left, bounds.top + bounds.height * 0.48, bounds.width, bounds.height * 0.52);
  }

  private drawFacets(graphics: Phaser.GameObjects.Graphics, cells: RiverCell[]): void {
    for (const cell of cells) {
      const seed = coordSeed(cell.coord);
      if (seed % 4 === 0) {
        graphics.fillStyle(0x8ed6d2, 0.055);
        graphics.fillPoints(this.game.hexPoints(cell.center, 12), true);
      } else if (seed % 5 === 0) {
        graphics.fillStyle(0x001a26, 0.11);
        graphics.fillPoints(this.game.hexPoints(cell.center, 15), true);
      }
    }
  }

  private drawFlowStreaks(
    soft: Phaser.GameObjects.Graphics,
    bright: Phaser.GameObjects.Graphics,
    cells: RiverCell[],
  ): void {
    for (const cell of cells) {
      const seed = coordSeed(cell.coord);
      const angle = cell.flowAngle + ((seed % 7) - 3) * 0.035;
      const tangentX = Math.cos(angle);
      const tangentY = Math.sin(angle);
      const normalX = -tangentY;
      const normalY = tangentX;
      const offset = ((seed % 13) - 6) * 1.15;
      const length = 18 + seed % 17;
      const cx = cell.center.x + normalX * offset;
      const cy = cell.center.y + normalY * offset;

      soft.lineStyle(3.2, STREAK_SOFT, 0.33 + (seed % 5) * 0.035);
      soft.lineBetween(
        cx - tangentX * length * 0.5,
        cy - tangentY * length * 0.5,
        cx + tangentX * length * 0.5,
        cy + tangentY * length * 0.5,
      );

      if (seed % 3 !== 0) continue;
      const brightLength = 8 + seed % 9;
      const bx = cx + normalX * 7;
      const by = cy + normalY * 7;
      bright.lineStyle(1.7, STREAK_BRIGHT, 0.62);
      bright.lineBetween(
        bx - tangentX * brightLength * 0.5,
        by - tangentY * brightLength * 0.5,
        bx + tangentX * brightLength * 0.5,
        by + tangentY * brightLength * 0.5,
      );
    }
  }

  private drawShoreline(graphics: Phaser.GameObjects.Graphics, cells: RiverCell[]): void {
    const centerKeys = new Set(cells.map((cell) => this.centerKey(cell.center)));

    for (const cell of cells) {
      const radius = Phaser.Math.Distance.Between(
        cell.center.x,
        cell.center.y,
        cell.points[0].x,
        cell.points[0].y,
      );
      const neighbourDistance = radius * Math.sqrt(3);

      for (let index = 0; index < cell.points.length; index += 1) {
        const a = cell.points[index];
        const b = cell.points[(index + 1) % cell.points.length];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = midX - cell.center.x;
        const dy = midY - cell.center.y;
        const length = Math.hypot(dx, dy) || 1;
        const neighbour = new Phaser.Math.Vector2(
          cell.center.x + dx / length * neighbourDistance,
          cell.center.y + dy / length * neighbourDistance,
        );
        if (centerKeys.has(this.centerKey(neighbour))) continue;

        graphics.lineStyle(5.5, BANK_DARK, 0.82);
        graphics.lineBetween(a.x, a.y, b.x, b.y);
        graphics.lineStyle(2.1, BANK_LIGHT, 0.58);
        graphics.lineBetween(a.x, a.y, b.x, b.y);

        const seed = coordSeed(cell.coord) + index * 17;
        if (seed % 3 !== 0) continue;
        const insetA = Phaser.Math.Linear(0.2, 0.8, (seed % 11) / 10);
        const insetB = Math.min(0.92, insetA + 0.18);
        graphics.lineStyle(1.2, STREAK_BRIGHT, 0.36);
        graphics.lineBetween(
          Phaser.Math.Linear(a.x, b.x, insetA),
          Phaser.Math.Linear(a.y, b.y, insetA),
          Phaser.Math.Linear(a.x, b.x, insetB),
          Phaser.Math.Linear(a.y, b.y, insetB),
        );
      }
    }
  }

  private createRipples(surface: Phaser.GameObjects.Container, cells: RiverCell[]): void {
    const candidates = cells.filter((cell) => coordSeed(cell.coord) % 7 === 0).slice(0, 7);
    for (let index = 0; index < candidates.length; index += 1) {
      const cell = candidates[index];
      const graphics = this.scene.add.graphics().setPosition(cell.center.x, cell.center.y);
      graphics.lineStyle(1.5, STREAK_BRIGHT, 0.5);
      graphics.strokeEllipse(0, 0, 25, 9);
      graphics.lineStyle(1, STREAK_SOFT, 0.34);
      graphics.strokeEllipse(0, 0, 39, 14);
      surface.add(graphics);
      this.ripples.push({ graphics, phase: (index * 0.173 + (coordSeed(cell.coord) % 19) / 19) % 1 });
    }
  }

  private readonly handleUpdate = (): void => {
    const time = this.scene.time.now;
    if (this.softStreaks?.active) {
      this.softStreaks.setPosition(
        Math.sin(time / 1850) * 3.2,
        Math.cos(time / 2370) * 1.8,
      );
      this.softStreaks.setAlpha(FLOW_LAYER_ALPHA + Math.sin(time / 920) * 0.08);
    }
    if (this.brightStreaks?.active) {
      this.brightStreaks.setPosition(
        Math.sin(time / 1450 + 1.1) * 4.2,
        Math.cos(time / 1720 + 0.7) * 2.1,
      );
      this.brightStreaks.setAlpha(0.76 + Math.sin(time / 690 + 0.4) * 0.14);
    }

    for (const ripple of this.ripples) {
      if (!ripple.graphics.active) continue;
      const progress = (time / 3100 + ripple.phase) % 1;
      const eased = Phaser.Math.Easing.Sine.InOut(progress);
      ripple.graphics.setScale(0.72 + eased * 0.62, 0.72 + eased * 0.62);
      ripple.graphics.setAlpha(Math.sin(Math.PI * progress) * 0.34);
    }
  };

  private applyStaticMotionPose(): void {
    this.softStreaks?.setAlpha(0.74);
    this.brightStreaks?.setAlpha(0.78);
    for (const ripple of this.ripples) ripple.graphics.setAlpha(0.18).setScale(1.02, 1.02);
  }

  private centerKey(point: Phaser.Math.Vector2): string {
    return `${Math.round(point.x)},${Math.round(point.y)}`;
  }
}
