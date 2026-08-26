import Phaser from 'phaser';
import { MAP_GARRISONS } from '../data/map';
import type { Coord, GameState, PlayerId } from '../data/types';
import {
  coordKey,
  findUnit,
  getReachableCoords,
  unitAt,
} from './engine';

export interface CapturePresentationSceneInternals {
  state: GameState;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  mode: string | null;
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

const CAPTURE_COLOR = 0xf0c56b;
const CAPTURE_LIGHT = 0xfff0b0;
const HUMAN_COLOR = 0x55b9f3;
const UNDEAD_COLOR = 0xb76cff;

/**
 * Presentation-only capture readability:
 * - shows reachable neutral/enemy sites as capture opportunities
 * - celebrates ownership changes after end-turn capture resolution
 * Site ownership and faction art remain driven exclusively by engine state.
 */
export class CapturePresentation {
  private opportunityLayer?: Phaser.GameObjects.Container;
  private opportunityMarkers: Phaser.GameObjects.Graphics[] = [];
  private previousOwners = new Map<string, PlayerId | null>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: CapturePresentationSceneInternals,
  ) {
    for (const site of game.state.sites) this.previousOwners.set(site.id, site.owner);
  }

  install(): void {
    this.scene.events.on('update', this.handleUpdate);
    this.scene.events.once('shutdown', () => this.destroy());
  }

  render(): void {
    this.detectOwnershipChanges();
    this.renderCaptureOpportunities();
  }

  private readonly handleUpdate = (): void => {
    if (this.opportunityMarkers.length === 0) return;
    const pulse = 0.88 + Math.sin(this.scene.time.now / 260) * 0.1;
    for (const marker of this.opportunityMarkers) {
      if (marker.active) marker.setAlpha(pulse);
    }
  };

  private renderCaptureOpportunities(): void {
    if (this.opportunityLayer?.active) this.opportunityLayer.destroy(true);
    this.opportunityLayer = undefined;
    this.opportunityMarkers = [];

    const board = this.game.boardLayer;
    if (!board
      || this.game.animationInProgress
      || this.game.mode !== 'unit'
      || !this.game.selectedUnitId) return;

    const selected = findUnit(this.game.state, this.game.selectedUnitId);
    if (!selected || selected.owner !== this.game.state.currentPlayer) return;

    const reachable = getReachableCoords(this.game.state, selected.id);
    if (reachable.size === 0) return;

    const layer = this.scene.add.container(0, 0);
    this.opportunityLayer = layer;
    board.add(layer);

    for (const site of this.game.state.sites) {
      if (site.owner === selected.owner) continue;
      if (!reachable.has(coordKey(site.coord))) continue;
      if (unitAt(this.game.state, site.coord)) continue;
      this.drawCaptureOpportunity(site.coord);
    }
  }

  private drawCaptureOpportunity(coord: Coord): void {
    const center = this.game.center(coord);
    const edge = this.game.hexPoints(center, -2);
    const graphics = this.scene.add.graphics();

    // Gold replaces the normal blue movement language on sites that would be captured.
    graphics.fillStyle(CAPTURE_COLOR, 0.13);
    graphics.fillPoints(edge, true);
    graphics.lineStyle(9, CAPTURE_COLOR, 0.12);
    graphics.strokePoints(edge, true);
    graphics.lineStyle(3.5, CAPTURE_COLOR, 0.94);
    graphics.strokePoints(edge, true);
    graphics.lineStyle(1.2, CAPTURE_LIGHT, 0.95);
    graphics.strokePoints(edge, true);

    // Compact flag badge remains readable over both neutral and faction site art.
    const flagX = center.x + 27;
    const flagY = center.y - 27;
    graphics.fillStyle(0x17150f, 0.88);
    graphics.fillCircle(flagX, flagY, 13);
    graphics.lineStyle(2, CAPTURE_LIGHT, 0.9);
    graphics.strokeCircle(flagX, flagY, 12);
    graphics.lineStyle(2.3, CAPTURE_LIGHT, 1);
    graphics.lineBetween(flagX - 4, flagY + 7, flagX - 4, flagY - 8);
    graphics.fillStyle(CAPTURE_COLOR, 1);
    graphics.fillTriangle(
      flagX - 3,
      flagY - 8,
      flagX + 8,
      flagY - 4,
      flagX - 3,
      flagY + 1,
    );

    this.opportunityLayer?.add(graphics);
    this.opportunityMarkers.push(graphics);
  }

  private detectOwnershipChanges(): void {
    const liveIds = new Set<string>();
    for (const site of this.game.state.sites) {
      liveIds.add(site.id);
      if (!this.previousOwners.has(site.id)) {
        // Newly raised/profaned sites are creation events, not captures.
        this.previousOwners.set(site.id, site.owner);
        continue;
      }

      const previousOwner = this.previousOwners.get(site.id) ?? null;
      if (previousOwner !== site.owner && site.owner !== null) {
        this.spawnCaptureBurst(site.coord, site.owner, true);
        if (site.type === 'fort') {
          for (const garrison of MAP_GARRISONS.filter((candidate) => candidate.fortId === site.id)) {
            this.spawnCaptureBurst(garrison.coord, site.owner, false);
          }
        }
      }
      this.previousOwners.set(site.id, site.owner);
    }

    for (const id of this.previousOwners.keys()) {
      if (!liveIds.has(id)) this.previousOwners.delete(id);
    }
  }

  private spawnCaptureBurst(coord: Coord, owner: PlayerId, primary: boolean): void {
    const center = this.game.center(coord);
    const faction = this.game.state.players[owner].faction;
    const color = faction === 'undead' ? UNDEAD_COLOR : HUMAN_COLOR;
    const light = faction === 'undead' ? 0xe9c8ff : 0xd8f7ff;

    const ring = this.scene.add.graphics()
      .setPosition(center.x, center.y)
      .setDepth(5000)
      .setScale(primary ? 0.48 : 0.62)
      .setAlpha(1);
    ring.fillStyle(color, primary ? 0.18 : 0.1);
    ring.fillCircle(0, 0, primary ? 40 : 28);
    ring.lineStyle(primary ? 5 : 3, color, 0.95);
    ring.strokeCircle(0, 0, primary ? 39 : 27);
    ring.lineStyle(primary ? 2 : 1, light, 0.9);
    ring.strokeCircle(0, 0, primary ? 31 : 21);

    if (primary) {
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        ring.lineStyle(2, light, 0.72);
        ring.lineBetween(
          Math.cos(angle) * 45,
          Math.sin(angle) * 45,
          Math.cos(angle) * 59,
          Math.sin(angle) * 59,
        );
      }
    }

    this.scene.tweens.add({
      targets: ring,
      scaleX: primary ? 1.55 : 1.32,
      scaleY: primary ? 1.55 : 1.32,
      alpha: 0,
      duration: primary ? 720 : 520,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    if (!primary) return;

    const flag = this.scene.add.graphics()
      .setPosition(center.x + 31, center.y + 8)
      .setDepth(5001)
      .setAlpha(0);
    flag.lineStyle(3, light, 1);
    flag.lineBetween(0, 12, 0, -23);
    flag.fillStyle(color, 1);
    flag.fillTriangle(1, -23, 25, -16, 1, -7);
    flag.lineStyle(1.5, light, 0.9);
    flag.lineBetween(1, -23, 25, -16);
    flag.lineBetween(25, -16, 1, -7);

    this.scene.tweens.add({
      targets: flag,
      y: center.y - 5,
      alpha: 1,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: flag,
          y: flag.y - 7,
          alpha: 0,
          delay: 430,
          duration: 310,
          ease: 'Quad.easeIn',
          onComplete: () => flag.destroy(),
        });
      },
    });
  }

  private destroy(): void {
    this.scene.events.off('update', this.handleUpdate);
    if (this.opportunityLayer?.active) this.opportunityLayer.destroy(true);
    this.opportunityLayer = undefined;
    this.opportunityMarkers = [];
    this.previousOwners.clear();
  }
}
