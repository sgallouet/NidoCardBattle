import Phaser from 'phaser';
import generatedMapPreviewUrl from '../../assets/game/maps/generated-map-preview.png?url';
import { CARD_ART } from '../data/cardArt';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import { RUIN_ART, TOWN_ART } from '../data/mapDecorationArt';
import { MAP_DECORATIONS, MAP_HEIGHT, MAP_WIDTH, type MapDecoration } from '../data/map';
import { SITE_ART } from '../data/siteArt';
import {
  BRIDGE_TERRAIN_ART,
  FOREST_TERRAIN_ART,
  HILL_TERRAIN_ART,
  MOUNTAIN_TERRAIN_ART,
  PLAIN_TERRAIN_ART,
  RIVER_WATER_ART,
} from '../data/terrainArt';
import type { Coord, PlayerId, SiteType, UnitState } from '../data/types';
import { GALAXY_BACKGROUND_ART, GALAXY_BACKGROUND_CONTRACT } from '../data/vfxArt';
import {
  UNIT_ART,
  type UnitAnimationState,
  type UnitArtDefinition,
  type UnitFacing,
} from '../data/unitArt';
import type { UnitDefinitionId } from '../data/units';
import { setDebugStatus } from './DebugStatus';
import {
  attackUnit,
  coordKey,
  createGameState,
  displaceUnit,
  effectiveRange,
  endTurn,
  findUnit,
  getAttackTargets,
  getDisplaceDestinations,
  getDisplaceTargets,
  getReachableCoords,
  getRestoreTargets,
  getValidSummonCoords,
  hexDistance,
  MAX_MANA,
  moveUnit,
  playUnitCard,
  restoreAdjacentAlly,
  terrainAt,
  unitAt,
  unitDefinition,
} from './engine';

const HEX_SIZE = 46;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const ORIGIN_X = 200;
const ORIGIN_Y = 120;
const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 1100;
const GENERATED_MAP_TEXTURE_KEY = 'debug-generated-map-preview';
const GENERATED_MAP_HEIGHT = 600;
const GENERATED_MAP_VIEWPORT_HEIGHT_RATIO = 2;
const MIN_ZOOM = 0.52;
const TILE_MAP_MAX_ZOOM = 1.25;
const GENERATED_MAP_MAX_ZOOM = 6;
const TILE_ZOOM_STEP = 0.12;
const DEFAULT_TILE_ZOOM_STEPS = 3;
const TOKEN_MOVEMENT_MS_PER_HEX = 190;
const TOKEN_ATTACK_DURATION_MS = 500;
const TOKEN_ATTACK_IMPACT_MS = 320;
const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x55b9f3, 2: 0xf05b67 };
const TERRAIN_PALETTES: Record<'cliff', number[]> = {
  cliff: [0x52585a, 0x606465, 0x494f51],
};
const cardDefinition = (id: CardDefinitionId) => CARD_DEFINITIONS[id];

type InteractionMode = 'unit' | 'card' | 'displace-target' | 'displace-destination' | 'restore-target' | null;

interface DragState {
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
  moved: boolean;
}

interface RenderedUnitView {
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  art?: UnitArtDefinition;
  hpText: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private state = createGameState();
  private galaxyLayer?: Phaser.GameObjects.Container;
  private boardLayer?: Phaser.GameObjects.Container;
  private riverMaskGraphics?: Phaser.GameObjects.Graphics;
  private riverAnimationTargets: object[] = [];
  private useGeneratedMapPreview = false;
  private selectedUnitId: string | null = null;
  private selectedCardIndex: number | null = null;
  private displaceTargetId: string | null = null;
  private restoreSourceId: string | null = null;
  private mode: InteractionMode = null;
  private dragState: DragState | null = null;
  private suppressBoardClickUntil = 0;
  private lastHandSignature = '';
  private animationInProgress = false;
  private renderedUnits = new Map<string, RenderedUnitView>();
  private unitFacings = new Map<string, UnitFacing>();
  private message = 'Player 1 begins. Move a unit or play a card.';
  private readonly handleGeneratedMapToggle = (): void => {
    const toggle = document.querySelector<HTMLButtonElement>('#generated-map-toggle');
    this.useGeneratedMapPreview = !this.useGeneratedMapPreview;
    toggle?.setAttribute('aria-pressed', `${this.useGeneratedMapPreview}`);
    toggle?.setAttribute(
      'aria-label',
      this.useGeneratedMapPreview ? 'Use tile map' : 'Use generated map preview',
    );
    if (toggle) toggle.textContent = this.useGeneratedMapPreview ? 'Map: generated' : 'Map: tiles';
    this.renderAll();
    this.resetCamera();
  };

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image(GENERATED_MAP_TEXTURE_KEY, generatedMapPreviewUrl);
    this.load.image(GALAXY_BACKGROUND_ART.map.textureKey, GALAXY_BACKGROUND_ART.map.url);
    this.load.image(GALAXY_BACKGROUND_ART.stars.textureKey, GALAXY_BACKGROUND_ART.stars.url);
    this.load.image(BRIDGE_TERRAIN_ART.textureKey, BRIDGE_TERRAIN_ART.url);
    this.load.image(PLAIN_TERRAIN_ART.textureKey, PLAIN_TERRAIN_ART.url);
    this.load.image(FOREST_TERRAIN_ART.ground.textureKey, FOREST_TERRAIN_ART.ground.url);
    this.load.image(FOREST_TERRAIN_ART.overlay.textureKey, FOREST_TERRAIN_ART.overlay.url);
    this.load.image(HILL_TERRAIN_ART.textureKey, HILL_TERRAIN_ART.url);
    this.load.image(MOUNTAIN_TERRAIN_ART.textureKey, MOUNTAIN_TERRAIN_ART.url);
    this.load.image(RIVER_WATER_ART.base.textureKey, RIVER_WATER_ART.base.url);
    this.load.image(RIVER_WATER_ART.displacement.textureKey, RIVER_WATER_ART.displacement.url);
    this.load.image(RUIN_ART.textureKey, RUIN_ART.url);
    this.load.image(TOWN_ART.textureKey, TOWN_ART.url);
    for (const art of Object.values(SITE_ART)) this.load.image(art.textureKey, art.url);
    for (const art of Object.values(UNIT_ART)) {
      if (!art) continue;
      for (const animation of Object.values(art.animations)) {
        this.load.spritesheet(animation.textureKey, animation.url, {
          frameWidth: art.frameSize,
          frameHeight: art.frameSize,
        });
      }
    }
  }

  create(): void {
    document.querySelector<HTMLButtonElement>('#end-turn-button')?.addEventListener('click', () => this.handleEndTurn());
    document.querySelector<HTMLButtonElement>('#cancel-button')?.addEventListener('click', () => this.cancelInteraction('Selection cleared.'));
    document.querySelector<HTMLButtonElement>('#ability-button')?.addEventListener('click', () => this.beginDisplace());
    document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click', () => this.zoomBy(TILE_ZOOM_STEP));
    document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click', () => this.zoomBy(-TILE_ZOOM_STEP));
    document.querySelector<HTMLButtonElement>('#zoom-reset')?.addEventListener('click', () => this.resetCamera());
    const generatedMapToggle = document.querySelector<HTMLButtonElement>('#generated-map-toggle');
    generatedMapToggle?.addEventListener('click', this.handleGeneratedMapToggle);
    this.events.once('shutdown', () => {
      generatedMapToggle?.removeEventListener('click', this.handleGeneratedMapToggle);
      this.clearRiverSurface();
    });
    this.createUnitAnimations();
    this.setupCameraControls();
    this.createGalaxyBackdrop();
    this.renderAll();
    this.resetCamera();
  }

  private createUnitAnimations(): void {
    for (const art of Object.values(UNIT_ART)) {
      if (!art) continue;
      for (const animation of Object.values(art.animations)) {
        if (this.anims.exists(animation.animationKey)) continue;
        this.anims.create({
          key: animation.animationKey,
          frames: this.anims.generateFrameNumbers(animation.textureKey, {
            start: 0,
            end: animation.frameCount - 1,
          }),
          frameRate: animation.frameRate,
          repeat: animation.repeat,
        });
      }
    }
  }

  private setupCameraControls(): void {
    const camera = this.cameras.main;

    this.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _objects: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number,
    ) => {
      const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
      const zoom = Phaser.Math.Clamp(camera.zoom - deltaY * 0.0012, MIN_ZOOM, this.maxZoom());
      camera.setZoom(zoom);
      camera.setScroll(worldPoint.x - pointer.x / zoom, worldPoint.y - pointer.y / zoom);
      this.constrainCamera();
      this.updateZoomLabel();
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      this.dragState = {
        startX: pointer.x,
        startY: pointer.y,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        moved: false,
      };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.dragState) return;
      const dx = pointer.x - this.dragState.startX;
      const dy = pointer.y - this.dragState.startY;
      if (!this.dragState.moved && Math.hypot(dx, dy) < 7) return;
      this.dragState.moved = true;
      this.game.canvas.classList.add('dragging');
      camera.setScroll(
        this.dragState.scrollX - dx / camera.zoom,
        this.dragState.scrollY - dy / camera.zoom,
      );
      this.constrainCamera();
    });

    this.input.on('pointerup', () => {
      if (this.dragState?.moved) {
        this.suppressBoardClickUntil = performance.now() + 150;
      }
      this.dragState = null;
      this.game.canvas.classList.remove('dragging');
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.resetCamera());
  }

  private resetCamera(): void {
    const fit = Math.min(this.scale.width / (WORLD_WIDTH - 120), this.scale.height / (WORLD_HEIGHT - 100));
    const generatedMapZoom = this.scale.height * GENERATED_MAP_VIEWPORT_HEIGHT_RATIO / GENERATED_MAP_HEIGHT;
    const zoom = this.useGeneratedMapPreview
      ? Phaser.Math.Clamp(generatedMapZoom, MIN_ZOOM, GENERATED_MAP_MAX_ZOOM)
      : Phaser.Math.Clamp(
        fit * 1.02 + TILE_ZOOM_STEP * DEFAULT_TILE_ZOOM_STEPS,
        MIN_ZOOM,
        TILE_MAP_MAX_ZOOM,
      );
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.constrainCamera();
    this.updateZoomLabel();
  }

  private maxZoom(): number {
    return this.useGeneratedMapPreview ? GENERATED_MAP_MAX_ZOOM : TILE_MAP_MAX_ZOOM;
  }

  private zoomBy(change: number): void {
    const camera = this.cameras.main;
    const pointer = new Phaser.Math.Vector2(this.scale.width / 2, this.scale.height / 2);
    const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
    const zoom = Phaser.Math.Clamp(camera.zoom + change, MIN_ZOOM, this.maxZoom());
    camera.setZoom(zoom);
    camera.setScroll(worldPoint.x - pointer.x / zoom, worldPoint.y - pointer.y / zoom);
    this.constrainCamera();
    this.updateZoomLabel();
  }

  private constrainCamera(): void {
    const camera = this.cameras.main;
    const halfVisibleWidth = this.scale.width / camera.zoom / 2;
    const halfVisibleHeight = this.scale.height / camera.zoom / 2;
    const currentCenterX = camera.scrollX + camera.width / 2;
    const currentCenterY = camera.scrollY + camera.height / 2;
    const centerX = halfVisibleWidth >= WORLD_WIDTH / 2
      ? WORLD_WIDTH / 2
      : Phaser.Math.Clamp(currentCenterX, halfVisibleWidth, WORLD_WIDTH - halfVisibleWidth);
    let centerY: number;
    if (this.useGeneratedMapPreview) {
      const mapTop = (WORLD_HEIGHT - GENERATED_MAP_HEIGHT) / 2;
      const mapBottom = mapTop + GENERATED_MAP_HEIGHT;
      centerY = halfVisibleHeight >= GENERATED_MAP_HEIGHT / 2
        ? WORLD_HEIGHT / 2
        : Phaser.Math.Clamp(currentCenterY, mapTop + halfVisibleHeight, mapBottom - halfVisibleHeight);
    } else {
      centerY = halfVisibleHeight >= WORLD_HEIGHT / 2
        ? halfVisibleHeight
        : Phaser.Math.Clamp(currentCenterY, halfVisibleHeight, WORLD_HEIGHT - halfVisibleHeight);
    }

    camera.centerOn(centerX, centerY);
  }

  private updateZoomLabel(): void {
    const label = document.querySelector<HTMLElement>('#zoom-value');
    if (label) label.textContent = `${Math.round(this.cameras.main.zoom * 100)}%`;
  }

  private center(coord: Coord): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      ORIGIN_X + coord.q * HEX_WIDTH + (coord.r % 2) * HEX_WIDTH / 2,
      ORIGIN_Y + coord.r * HEX_SIZE * 1.5,
    );
  }

  private hexPoints(center: Phaser.Math.Vector2, inset = 1): Phaser.Geom.Point[] {
    return Array.from({ length: 6 }, (_, index) => {
      const angle = Phaser.Math.DegToRad(60 * index - 30);
      return new Phaser.Geom.Point(
        center.x + (HEX_SIZE - inset) * Math.cos(angle),
        center.y + (HEX_SIZE - inset) * Math.sin(angle),
      );
    });
  }

  private highlights(): { move: Set<string>; attack: Set<string>; summon: Set<string>; selected: Set<string> } {
    const move = new Set<string>();
    const attack = new Set<string>();
    const summon = new Set<string>();
    const selected = new Set<string>();
    const selectedUnit = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (selectedUnit) selected.add(coordKey(selectedUnit.coord));
    const restoreSource = this.restoreSourceId ? findUnit(this.state, this.restoreSourceId) : undefined;
    if (restoreSource) selected.add(coordKey(restoreSource.coord));

    if (this.mode === 'unit' && selectedUnit) {
      for (const key of getReachableCoords(this.state, selectedUnit.id).keys()) move.add(key);
      for (const target of getAttackTargets(this.state, selectedUnit.id)) attack.add(coordKey(target.coord));
    }

    if (this.mode === 'card' && this.selectedCardIndex !== null) {
      const cardId = this.state.players[this.state.currentPlayer].hand[this.selectedCardIndex];
      const card = cardId ? cardDefinition(cardId as CardDefinitionId) : undefined;
      if (card) for (const coord of getValidSummonCoords(this.state)) summon.add(coordKey(coord));
    }

    if (this.mode === 'displace-target' && selectedUnit) {
      for (const target of getDisplaceTargets(this.state, selectedUnit.id)) attack.add(coordKey(target.coord));
    }

    if (this.mode === 'displace-destination' && selectedUnit && this.displaceTargetId) {
      for (const coord of getDisplaceDestinations(this.state, selectedUnit.id, this.displaceTargetId)) summon.add(coordKey(coord));
    }

    if (this.mode === 'restore-target' && restoreSource) {
      for (const target of getRestoreTargets(this.state, restoreSource.id)) summon.add(coordKey(target.coord));
    }
    return { move, attack, summon, selected };
  }

  private renderAll(): void {
    this.renderBoard();
    this.renderHud();
  }

  private renderBoard(): void {
    this.renderedUnits.clear();
    this.clearRiverSurface();
    this.boardLayer?.destroy(true);
    this.boardLayer = this.add.container(0, 0);
    const highlight = this.highlights();
    const sitesByCoord = new Map(this.state.sites.map((site) => [coordKey(site.coord), site]));
    if (this.useGeneratedMapPreview) {
      const generatedMap = this.add.image(
        WORLD_WIDTH / 2,
        WORLD_HEIGHT / 2,
        GENERATED_MAP_TEXTURE_KEY,
      ).setDisplaySize(WORLD_WIDTH, GENERATED_MAP_HEIGHT);
      this.boardLayer.add(generatedMap);
    } else {
      this.addRiverSurface();
    }

    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        const key = coordKey(coord);
        const center = this.center(coord);
        const points = this.hexPoints(center);
        const terrain = terrainAt(coord);
        if (!this.useGeneratedMapPreview) {
          const base = this.add.graphics();
          base.fillStyle(0x101a13, 0.42);
          base.fillPoints(this.hexPoints(new Phaser.Math.Vector2(center.x + 4, center.y + 6), 0), true);
          if (terrain === 'plain') {
            this.boardLayer.add(base);
            const tile = this.add.image(center.x, center.y, PLAIN_TERRAIN_ART.textureKey)
              .setDisplaySize(HEX_WIDTH, HEX_SIZE * 2);
            this.boardLayer.add(tile);
          } else if (terrain === 'forest') {
            this.boardLayer.add(base);
            const ground = this.add.image(center.x, center.y, FOREST_TERRAIN_ART.ground.textureKey)
              .setDisplaySize(HEX_WIDTH, HEX_SIZE * 2);
            const canopy = this.add.image(center.x, center.y, FOREST_TERRAIN_ART.overlay.textureKey)
              .setDisplaySize(HEX_WIDTH, HEX_SIZE * 2)
              .setAlpha(FOREST_TERRAIN_ART.overlay.alpha);
            this.boardLayer.add([ground, canopy]);
          } else if (terrain === 'hill') {
            this.boardLayer.add(base);
            const ground = this.add.image(center.x, center.y, PLAIN_TERRAIN_ART.textureKey)
              .setDisplaySize(HEX_WIDTH, HEX_SIZE * 2);
            const overlay = this.add.image(center.x, center.y, HILL_TERRAIN_ART.textureKey)
              .setDisplaySize(HILL_TERRAIN_ART.displayWidth, HILL_TERRAIN_ART.displayHeight);
            this.boardLayer.add([ground, overlay]);
          } else if (terrain === 'mountain') {
            this.boardLayer.add(base);
            const tile = this.add.image(center.x, center.y, MOUNTAIN_TERRAIN_ART.textureKey)
              .setDisplaySize(HEX_WIDTH * 1.035, HEX_SIZE * 2.07);
            this.boardLayer.add(tile);
          } else if (terrain === 'water' || terrain === 'bridge') {
            this.boardLayer.add(base);
          } else {
            const palette = TERRAIN_PALETTES[terrain];
            const fill = palette[(q * 17 + r * 31) % palette.length];
            base.fillStyle(fill, 1);
            base.fillPoints(points, true);
            base.fillStyle(0xffffff, 0.035);
            base.fillPoints(this.hexPoints(new Phaser.Math.Vector2(center.x - 3, center.y - 4), 9), true);
            this.boardLayer.add(base);
          }
        }

        if (!this.useGeneratedMapPreview && terrain !== 'plain' && terrain !== 'forest' && terrain !== 'water') {
          this.addTerrainDetail(coord, center);
        }

        const hex = this.add.graphics();
        let stroke = 0x263828;
        let strokeWidth = this.useGeneratedMapPreview ? 0 : 2;
        const siteOwner = sitesByCoord.get(key)?.owner;
        if (!this.useGeneratedMapPreview && siteOwner) {
          stroke = PLAYER_COLORS[siteOwner];
          strokeWidth = 5;
        }
        if (highlight.move.has(key)) {
          hex.fillStyle(0x50d6c2, 0.34);
          hex.fillPoints(points, true);
          stroke = 0x7ff8e3;
          strokeWidth = 4;
        }
        if (highlight.summon.has(key)) {
          hex.fillStyle(0xe6b758, 0.4);
          hex.fillPoints(points, true);
          stroke = 0xffdf87;
          strokeWidth = 4;
        }
        if (highlight.attack.has(key)) {
          hex.fillStyle(0xd54555, 0.42);
          hex.fillPoints(points, true);
          stroke = 0xff7785;
          strokeWidth = 4;
        }
        if (highlight.selected.has(key)) {
          stroke = 0xffffff;
          strokeWidth = 5;
        }
        const joinsTerrainSurface = (terrain === 'mountain' || terrain === 'water') && strokeWidth === 2;
        hex.lineStyle(joinsTerrainSurface ? 0 : strokeWidth, stroke, joinsTerrainSurface ? 0 : 0.95);
        hex.strokePoints(points, true);
        hex.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains);
        hex.on('pointerup', () => {
          if (!this.dragState?.moved && performance.now() >= this.suppressBoardClickUntil) this.handleHexClick(coord);
        });
        this.boardLayer.add(hex);
      }
    }

    if (!this.useGeneratedMapPreview) {
      for (const decoration of MAP_DECORATIONS) this.addMapDecoration(decoration);
      for (const site of this.state.sites) this.addSite(site.coord, site.type);
    }
    for (const unit of this.state.units) this.addUnit(unit);

    if (this.state.winner) {
      const shade = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 780, 250, 0x090d0a, 0.92)
        .setStrokeStyle(3, 0xd8b967);
      const title = this.add.text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - 25, `PLAYER ${this.state.winner} WINS`, {
        fontFamily: 'Georgia, serif', fontSize: '50px', color: '#f5d58e', fontStyle: 'bold',
      }).setOrigin(0.5);
      const copy = this.add.text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 42, 'The Commander survived all three checkpoints.', {
        fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#f4eee4',
      }).setOrigin(0.5);
      this.boardLayer.add([shade, title, copy]);
    }
  }

  private createGalaxyBackdrop(): void {
    this.galaxyLayer?.destroy(true);
    const layer = this.add.container(0, 0).setDepth(-100);
    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    const displaySize = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) + 100;
    const backdrop = this.add.rectangle(centerX, centerY, WORLD_WIDTH, WORLD_HEIGHT, 0x02091a);
    const galaxy = this.add.tileSprite(
      centerX,
      centerY,
      displaySize,
      displaySize,
      GALAXY_BACKGROUND_ART.map.textureKey,
    )
      .setTileScale(GALAXY_BACKGROUND_CONTRACT.mapTileScale)
      .setTint(GALAXY_BACKGROUND_CONTRACT.mapTint);
    const stars = this.add.tileSprite(
      centerX,
      centerY,
      displaySize,
      displaySize,
      GALAXY_BACKGROUND_ART.stars.textureKey,
    )
      .setTileScale(GALAXY_BACKGROUND_CONTRACT.starsTileScale)
      .setAlpha(GALAXY_BACKGROUND_CONTRACT.starsAlpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    layer.add([backdrop, galaxy, stars]);
    this.galaxyLayer = layer;

    this.tweens.add({
      targets: galaxy,
      angle: 360,
      duration: GALAXY_BACKGROUND_CONTRACT.mapRotationMs,
      ease: 'Linear',
      repeat: -1,
    });
    this.tweens.add({
      targets: stars,
      angle: 360,
      duration: GALAXY_BACKGROUND_CONTRACT.starsRotationMs,
      ease: 'Linear',
      repeat: -1,
    });
  }

  private clearRiverSurface(): void {
    for (const target of this.riverAnimationTargets) this.tweens.killTweensOf(target);
    this.riverAnimationTargets = [];
    this.riverMaskGraphics?.destroy();
    this.riverMaskGraphics = undefined;
  }

  private addRiverSurface(): void {
    const centers: Phaser.Math.Vector2[] = [];
    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const terrain = terrainAt({ q, r });
        if (terrain === 'water' || terrain === 'bridge') centers.push(this.center({ q, r }));
      }
    }
    if (centers.length === 0) return;

    const left = Math.min(...centers.map((point) => point.x)) - HEX_WIDTH / 2 - 3;
    const right = Math.max(...centers.map((point) => point.x)) + HEX_WIDTH / 2 + 3;
    const top = Math.min(...centers.map((point) => point.y)) - HEX_SIZE - 3;
    const bottom = Math.max(...centers.map((point) => point.y)) + HEX_SIZE + 3;
    const width = right - left;
    const height = bottom - top;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    const surface = this.add.container(0, 0);
    const base = this.add.tileSprite(
      centerX,
      centerY,
      width,
      height,
      RIVER_WATER_ART.base.textureKey,
    ).setTileScale(RIVER_WATER_ART.base.tileScale);
    const highlight = this.add.tileSprite(
      centerX,
      centerY,
      width,
      height,
      RIVER_WATER_ART.base.textureKey,
    )
      .setTileScale(RIVER_WATER_ART.base.tileScale)
      .setTilePosition(256, 192)
      .setTint(RIVER_WATER_ART.highlight.tint)
      .setAlpha(RIVER_WATER_ART.highlight.alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    surface.add([base, highlight]);

    const maskGraphics = new Phaser.GameObjects.Graphics(this);
    maskGraphics.fillStyle(0xffffff, 1);
    for (const center of centers) maskGraphics.fillPoints(this.hexPoints(center, 0), true);
    surface.setMask(maskGraphics.createGeometryMask());
    this.riverMaskGraphics = maskGraphics;
    this.boardLayer?.add(surface);

    if (this.game.renderer.type !== Phaser.WEBGL || !base.preFX) return;

    const wave = base.preFX.addDisplacement(
      RIVER_WATER_ART.displacement.textureKey,
      RIVER_WATER_ART.displacement.strengthX,
      RIVER_WATER_ART.displacement.strengthY,
    );
    this.tweens.add({
      targets: wave,
      x: RIVER_WATER_ART.displacement.pulseStrengthX,
      y: RIVER_WATER_ART.displacement.pulseStrengthY,
      duration: RIVER_WATER_ART.displacement.pulseHalfPeriodMs,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: base,
      tilePositionX: RIVER_WATER_ART.scroll.x,
      tilePositionY: RIVER_WATER_ART.scroll.y,
      duration: RIVER_WATER_ART.scroll.durationMs,
      ease: 'Linear',
      repeat: -1,
    });
    this.tweens.add({
      targets: highlight,
      tilePositionX: 256 + RIVER_WATER_ART.highlight.x,
      tilePositionY: 192 + RIVER_WATER_ART.highlight.y,
      duration: RIVER_WATER_ART.highlight.durationMs,
      ease: 'Linear',
      repeat: -1,
    });
    this.riverAnimationTargets = [wave, base, highlight];
  }

  private addTerrainDetail(coord: Coord, center: Phaser.Math.Vector2): void {
    const terrain = terrainAt(coord);
    const graphics = this.add.graphics();

    if (terrain === 'bridge') {
      const image = this.add.image(center.x, center.y, BRIDGE_TERRAIN_ART.textureKey)
        .setDisplaySize(BRIDGE_TERRAIN_ART.displayWidth, BRIDGE_TERRAIN_ART.displayHeight);
      this.boardLayer?.add(image);
      return;
    }

    if (terrain === 'cliff') {
      graphics.fillStyle(0x303638, 0.9);
      graphics.fillTriangle(center.x - 39, center.y + 24, center.x - 13, center.y - 28, center.x + 6, center.y + 24);
      graphics.fillStyle(0x717778, 0.9);
      graphics.fillTriangle(center.x - 5, center.y + 25, center.x + 17, center.y - 21, center.x + 40, center.y + 25);
      graphics.lineStyle(2, 0xaeb1aa, 0.38);
      graphics.lineBetween(center.x - 13, center.y - 28, center.x - 3, center.y + 3);
      graphics.lineBetween(center.x + 17, center.y - 21, center.x + 13, center.y + 8);
    }
    this.boardLayer?.add(graphics);
  }

  private addMapDecoration(decoration: MapDecoration): void {
    const center = this.center(decoration.coord);
    const graphics = this.add.graphics();

    if (decoration.type === 'village') {
      graphics.fillStyle(0x07100a, 0.3);
      graphics.fillEllipse(center.x + 3, center.y + 26, 54, 18);
      this.boardLayer?.add(graphics);
      const image = this.add.image(center.x, center.y + TOWN_ART.bottomOffset, TOWN_ART.textureKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(TOWN_ART.displayWidth, TOWN_ART.displayHeight);
      this.boardLayer?.add(image);
      return;
    }

    if (decoration.type === 'ruin') {
      graphics.fillStyle(0x07100a, 0.3);
      graphics.fillEllipse(center.x + 3, center.y + 26, 52, 18);
      this.boardLayer?.add(graphics);
      const image = this.add.image(center.x, center.y + RUIN_ART.bottomOffset, RUIN_ART.textureKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(RUIN_ART.displayWidth, RUIN_ART.displayHeight);
      this.boardLayer?.add(image);
      return;
    }
  }

  private addSite(coord: Coord, type: SiteType): void {
    const center = this.center(coord);
    const art = SITE_ART[type];
    const graphics = this.add.graphics();
    graphics.fillStyle(0x07100a, 0.34);
    graphics.fillEllipse(center.x + 3, center.y + 30, art.displayWidth * 0.72, 20);
    this.boardLayer?.add(graphics);

    const image = this.add.image(center.x, center.y + art.bottomOffset, art.textureKey)
      .setOrigin(0.5, 1)
      .setDisplaySize(art.displayWidth, art.displayHeight);
    this.boardLayer?.add(image);

    const label = this.add.text(center.x, center.y + art.labelOffset, type === 'keep' ? 'KEEP' : type === 'fort' ? 'FORT' : 'WELL', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#fff5d4', fontStyle: 'bold',
      stroke: '#101510', strokeThickness: 4,
    }).setOrigin(0.5);
    this.boardLayer?.add(label);
  }

  private addUnit(unit: UnitState): void {
    const center = this.center(unit.coord);
    const definition = unitDefinition(unit);
    const selected = unit.id === this.selectedUnitId;
    const scale = definition.id === 'commander' ? 1.12 : 1;
    const artId: UnitDefinitionId = unit.definitionId === 'commander'
      ? unit.owner === 1 ? 'humanCommander' : 'undeadCommander'
      : unit.definitionId as UnitDefinitionId;
    const art = UNIT_ART[artId];
    const container = this.add.container(center.x, center.y);
    const graphics = this.add.graphics();
    if (art) {
      const shadow = art.shadow;
      graphics.fillStyle(0x07100a, shadow.alpha);
      graphics.fillEllipse(
        shadow.offsetX,
        shadow.offsetY,
        shadow.width,
        shadow.height,
      );
      if (selected) {
        graphics.lineStyle(2, 0xffefb0, 0.9);
        graphics.strokeEllipse(
          shadow.offsetX,
          shadow.offsetY,
          shadow.width + 8,
          shadow.height + 6,
        );
      }
    } else {
      graphics.fillStyle(0x07100a, 0.56);
      graphics.fillEllipse(4, 25, 58 * scale, 19 * scale);
      const tokenPoints = [
        new Phaser.Geom.Point(0, -31 * scale),
        new Phaser.Geom.Point(27 * scale, -14 * scale),
        new Phaser.Geom.Point(22 * scale, 18 * scale),
        new Phaser.Geom.Point(0, 32 * scale),
        new Phaser.Geom.Point(-22 * scale, 18 * scale),
        new Phaser.Geom.Point(-27 * scale, -14 * scale),
      ];
      graphics.fillStyle(PLAYER_COLORS[unit.owner], unit.exhausted ? 0.58 : 1);
      graphics.fillPoints(tokenPoints, true);
      graphics.fillStyle(0xffffff, 0.14);
      graphics.fillTriangle(
        -18 * scale, -12 * scale,
        0, -25 * scale,
        0, 20 * scale,
      );
      graphics.lineStyle(selected ? 6 : 3, selected ? 0xffefb0 : 0x132019, 1);
      graphics.strokePoints(tokenPoints, true);
    }
    container.add(graphics);

    let unitVisual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Text;
    let sprite: Phaser.GameObjects.Sprite | undefined;
    if (art) {
      sprite = this.add.sprite(
        art.offsetX,
        art.offsetY,
        art.animations.idle.textureKey,
      ).setOrigin(art.anchorX, art.anchorY);
      sprite.setScale(art.scale * scale);
      const previousFacing = this.unitFacings.get(unit.id)
        ?? (unit.owner === 1 ? art.defaultFacing : 'north-west');
      const facing = this.closestEnemyFacing(unit, previousFacing);
      this.unitFacings.set(unit.id, facing);
      sprite.setFlipX(art.mirroredFacings.includes(facing));
      sprite.play(art.animations.idle.animationKey);
      const idleFrames = art.animations.idle.frameCount;
      if (idleFrames > 1) {
        const phase = [...unit.id].reduce((total, character) => total + character.charCodeAt(0), 0) % idleFrames;
        sprite.anims.setProgress(phase / idleFrames);
      }
      unitVisual = sprite;
    } else {
      unitVisual = this.add.text(0, -2, definition.mark, {
        fontFamily: 'Georgia, serif', fontSize: definition.id === 'commander' ? '28px' : '24px',
        color: '#0b171d', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 1,
      }).setOrigin(0.5);
    }
    const hpBadge = this.add.circle(27, 25, 13, 0x1a241c)
      .setStrokeStyle(2, art ? PLAYER_COLORS[unit.owner] : 0xe8dab5);
    const hp = this.add.text(27, 25, `${unit.hp}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff8e6', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([unitVisual, hpBadge, hp]);

    if (unit.exhausted) {
      const exhausted = this.add.text(-27, -26, 'Z', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#f5e7bd', fontStyle: 'bold',
        backgroundColor: '#43364c', padding: { x: 4, y: 2 },
      }).setOrigin(0.5);
      container.add(exhausted);
    }
    this.boardLayer?.add(container);
    this.renderedUnits.set(unit.id, { container, sprite, art, hpText: hp });
  }

  private setAnimationLock(locked: boolean): void {
    this.animationInProgress = locked;
    this.renderHud();
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(duration, resolve));
  }

  private tweenPosition(
    target: Phaser.GameObjects.Container,
    x: number,
    y: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        targets: target,
        x,
        y,
        duration,
        ease: 'Sine.easeInOut',
        onComplete: () => resolve(),
      });
    });
  }

  private faceUnit(unitId: string, from: Phaser.Math.Vector2, to: Phaser.Math.Vector2): void {
    const previous = this.unitFacings.get(unitId) ?? 'south-east';
    const facing = this.facingToward(from, to, previous);
    this.unitFacings.set(unitId, facing);
    const view = this.renderedUnits.get(unitId);
    if (view?.sprite && view.art) view.sprite.setFlipX(view.art.mirroredFacings.includes(facing));
  }

  private facingToward(
    from: Phaser.Math.Vector2,
    to: Phaser.Math.Vector2,
    previous: UnitFacing,
  ): UnitFacing {
    const vertical = to.y < from.y ? 'north' : 'south';
    const horizontal = to.x < from.x
      ? 'west'
      : to.x > from.x
        ? 'east'
        : previous.endsWith('west') ? 'west' : 'east';
    return `${vertical}-${horizontal}` as UnitFacing;
  }

  private closestEnemyFacing(unit: UnitState, previous: UnitFacing): UnitFacing {
    let closestEnemy: UnitState | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.state.units) {
      if (candidate.owner === unit.owner) continue;
      const distance = hexDistance(unit.coord, candidate.coord);
      if (distance >= closestDistance) continue;
      closestEnemy = candidate;
      closestDistance = distance;
    }
    return closestEnemy
      ? this.facingToward(this.center(unit.coord), this.center(closestEnemy.coord), previous)
      : previous;
  }

  private playUnitAnimation(unitId: string, state: UnitAnimationState): void {
    const view = this.renderedUnits.get(unitId);
    if (!view?.sprite || !view.art) return;
    view.sprite.play(view.art.animations[state].animationKey, true);
  }

  private async animateMovement(unitId: string, path: Coord[]): Promise<void> {
    const view = this.renderedUnits.get(unitId);
    if (!view) throw new Error(`Moving unit ${unitId} has no rendered view.`);
    this.boardLayer?.bringToTop(view.container);
    this.playUnitAnimation(unitId, 'walk');
    for (let index = 1; index < path.length; index += 1) {
      const from = this.center(path[index - 1]);
      const to = this.center(path[index]);
      this.faceUnit(unitId, from, to);
      const duration = view.art ? view.art.movementMsPerHex : TOKEN_MOVEMENT_MS_PER_HEX;
      await this.tweenPosition(view.container, to.x, to.y, duration);
    }
    this.playUnitAnimation(unitId, 'idle');
  }

  private showHitFeedback(unitId: string, damage: number): void {
    const view = this.renderedUnits.get(unitId);
    if (!view) return;
    if (view.sprite) {
      view.sprite.setTintFill(0xffffff);
      this.time.delayedCall(90, () => view.sprite?.clearTint());
    }
    this.tweens.add({
      targets: view.container,
      alpha: 0.48,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    const number = this.add.text(view.container.x, view.container.y - 55, `-${damage}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '19px',
      color: '#fff4e5',
      fontStyle: 'bold',
      stroke: '#8c1727',
      strokeThickness: 5,
    }).setOrigin(0.5);
    this.boardLayer?.add(number);
    this.tweens.add({
      targets: number,
      y: number.y - 24,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => number.destroy(),
    });
  }

  private async animateAttackMotion(
    attackerId: string,
    targetCoord: Coord,
    onImpact: () => void,
  ): Promise<void> {
    const view = this.renderedUnits.get(attackerId);
    if (!view) throw new Error(`Attacking unit ${attackerId} has no rendered view.`);
    const source = new Phaser.Math.Vector2(view.container.x, view.container.y);
    const target = this.center(targetCoord);
    this.faceUnit(attackerId, source, target);
    this.playUnitAnimation(attackerId, 'attack');
    this.boardLayer?.bringToTop(view.container);

    const direction = target.clone().subtract(source).normalize().scale(10);
    const duration = view.art ? view.art.attackDurationMs : TOKEN_ATTACK_DURATION_MS;
    const impact = view.art ? view.art.attackImpactMs : TOKEN_ATTACK_IMPACT_MS;
    const advanceDuration = Math.round(impact * 0.55);
    await this.tweenPosition(
      view.container,
      source.x + direction.x,
      source.y + direction.y,
      advanceDuration,
    );
    await this.wait(impact - advanceDuration);
    onImpact();
    await this.tweenPosition(view.container, source.x, source.y, duration - impact);
    this.playUnitAnimation(attackerId, 'idle');
  }

  private async resolveAnimatedAttack(attackerId: string, defenderId: string): Promise<void> {
    const attacker = findUnit(this.state, attackerId);
    const defender = findUnit(this.state, defenderId);
    if (!attacker || !defender) return;
    const defenderCoord = { ...defender.coord };
    const attackerCoord = { ...attacker.coord };
    const attackerHpBefore = attacker.hp;
    const defenderHpBefore = defender.hp;
    let result = { ok: false, message: 'That attack is no longer available.' };

    await this.animateAttackMotion(attackerId, defenderCoord, () => {
      result = attackUnit(this.state, attackerId, defenderId);
      if (result.ok) this.showHitFeedback(defenderId, Math.max(0, defenderHpBefore - defender.hp));
    });

    const retaliationDamage = Math.max(0, attackerHpBefore - attacker.hp);
    if (result.ok && retaliationDamage > 0 && findUnit(this.state, defenderId)) {
      await this.animateAttackMotion(defenderId, attackerCoord, () => {
        this.showHitFeedback(attackerId, retaliationDamage);
      });
    }
    this.message = result.message;
  }

  private async handleHexClick(coord: Coord): Promise<void> {
    if (this.state.winner || this.animationInProgress) return;
    const occupant = unitAt(this.state, coord);

    if (this.mode === 'card' && this.selectedCardIndex !== null) {
      const cardId = this.state.players[this.state.currentPlayer].hand[this.selectedCardIndex];
      const card = cardId ? cardDefinition(cardId as CardDefinitionId) : undefined;
      if (!card) return this.cancelInteraction('That card is no longer in hand.');
      const result = playUnitCard(this.state, this.selectedCardIndex, coord);
      this.message = result.message;
      if (result.ok) {
        this.animatePlayedCard(this.selectedCardIndex);
        const restoreTargets = result.summonedUnitId
          ? getRestoreTargets(this.state, result.summonedUnitId)
          : [];
        if (result.summonedUnitId && restoreTargets.length > 0) {
          this.selectedCardIndex = null;
          this.selectedUnitId = null;
          this.displaceTargetId = null;
          this.restoreSourceId = result.summonedUnitId;
          this.mode = 'restore-target';
          this.message = 'Choose a highlighted adjacent ally to restore 2 HP.';
        } else {
          this.clearInteraction();
        }
      }
      return this.renderAll();
    }

    if (this.mode === 'restore-target' && this.restoreSourceId) {
      const result = occupant
        ? restoreAdjacentAlly(this.state, this.restoreSourceId, occupant.id)
        : { ok: false, message: 'Choose a highlighted adjacent ally.' };
      this.message = result.message;
      if (result.ok) this.clearInteraction();
      return this.renderAll();
    }

    const selected = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (this.mode === 'displace-target' && selected) {
      if (!occupant || !getDisplaceTargets(this.state, selected.id).some((unit) => unit.id === occupant.id)) {
        this.message = 'Choose a highlighted adjacent unit.';
      } else {
        this.displaceTargetId = occupant.id;
        this.mode = 'displace-destination';
        this.message = 'Choose a highlighted destination.';
      }
      return this.renderAll();
    }

    if (this.mode === 'displace-destination' && selected && this.displaceTargetId) {
      const result = displaceUnit(this.state, selected.id, this.displaceTargetId, coord);
      this.message = result.message;
      if (result.ok) {
        this.displaceTargetId = null;
        this.mode = 'unit';
      }
      return this.renderAll();
    }

    if (selected && selected.owner === this.state.currentPlayer && occupant?.owner !== this.state.currentPlayer && occupant) {
      if (!getAttackTargets(this.state, selected.id).some((target) => target.id === occupant.id)) {
        const result = attackUnit(this.state, selected.id, occupant.id);
        this.message = result.message;
        this.renderAll();
        return;
      }
      this.setAnimationLock(true);
      try {
        await this.resolveAnimatedAttack(selected.id, occupant.id);
      } finally {
        this.setAnimationLock(false);
        this.renderAll();
      }
      return;
    }

    if (selected && selected.owner === this.state.currentPlayer && !occupant) {
      const result = moveUnit(this.state, selected.id, coord);
      this.message = result.message;
      if (!result.ok) {
        this.renderAll();
        return;
      }
      if (!result.path) throw new Error('Successful movement did not return its resolved path.');
      this.setAnimationLock(true);
      try {
        await this.animateMovement(selected.id, result.path);
      } finally {
        this.setAnimationLock(false);
        this.renderAll();
      }
      return;
    }

    if (occupant) {
      this.selectedUnitId = occupant.id;
      this.selectedCardIndex = null;
      this.displaceTargetId = null;
      this.restoreSourceId = null;
      this.mode = occupant.owner === this.state.currentPlayer ? 'unit' : null;
      this.message = occupant.owner === this.state.currentPlayer
        ? `${unitDefinition(occupant).name} selected.`
        : `${unitDefinition(occupant).name} belongs to Player ${occupant.owner}.`;
      return this.renderAll();
    }

    this.message = 'Select a unit or card first.';
    this.renderHud();
  }

  private selectCard(index: number): void {
    if (this.state.winner || this.animationInProgress) return;
    if (this.mode === 'restore-target') {
      this.message = 'Resolve the Light Mage restore first.';
      return this.renderHud();
    }
    if (this.selectedCardIndex === index) return this.cancelInteraction('Card selection cleared.');
    const cardId = this.state.players[this.state.currentPlayer].hand[index];
    const card = cardDefinition(cardId as CardDefinitionId);
    this.selectedCardIndex = index;
    this.selectedUnitId = null;
    this.displaceTargetId = null;
    this.mode = 'card';
    this.message = `Choose a highlighted empty Keep or Fort for ${card.name}.`;
    this.renderAll();
  }

  private beginDisplace(): void {
    if (this.animationInProgress) return;
    const selected = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (!selected || getDisplaceTargets(this.state, selected.id).length === 0) {
      this.message = 'No adjacent unit can be displaced.';
      return this.renderAll();
    }
    this.mode = 'displace-target';
    this.displaceTargetId = null;
    this.message = 'Choose a highlighted adjacent unit to displace.';
    this.renderAll();
  }

  private handleEndTurn(): void {
    setDebugStatus(`Turn: End Turn clicked during Player ${this.state.currentPlayer}'s turn.`, 'active');
    if (this.animationInProgress) {
      setDebugStatus('Turn blocked: an animation is still in progress.', 'warning');
      return;
    }
    if (this.mode === 'restore-target') {
      this.message = 'Resolve the Light Mage restore first.';
      setDebugStatus('Turn blocked: the Light Mage restore target is unresolved.', 'warning');
      return this.renderHud();
    }
    const result = endTurn(this.state);
    this.clearInteraction();
    this.message = result.message;
    this.renderAll();
    setDebugStatus(
      result.ok
        ? `Turn advanced to Player ${this.state.currentPlayer}; waiting for the AI loop.`
        : `Turn failed: ${result.message}`,
      result.ok ? 'active' : 'error',
    );
  }

  private clearInteraction(): void {
    this.selectedUnitId = null;
    this.selectedCardIndex = null;
    this.displaceTargetId = null;
    this.restoreSourceId = null;
    this.mode = null;
  }

  private cancelInteraction(message: string): void {
    if (this.animationInProgress) return;
    this.clearInteraction();
    this.message = message;
    this.renderAll();
  }

  private renderHud(): void {
    const current = this.state.players[this.state.currentPlayer];
    const manaCount = document.querySelector<HTMLElement>('#mana-count');
    if (manaCount) manaCount.textContent = `${current.mana}/${MAX_MANA}`;
    const turnIndicator = document.querySelector<HTMLElement>('#turn-indicator');
    if (turnIndicator) turnIndicator.textContent = `Player ${this.state.currentPlayer} turn`;

    const selectedPanel = document.querySelector<HTMLElement>('#selected-unit');
    const selected = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    const inspector = document.querySelector<HTMLElement>('#unit-inspector');
    if (inspector) inspector.hidden = !selected;
    if (selectedPanel) {
      if (!selected) selectedPanel.innerHTML = '<span class="muted">Select a unit on the battlefield.</span>';
      else {
        const definition = unitDefinition(selected);
        const traits = [...definition.traits, ...(definition.ability ? [definition.ability] : [])];
        const states = [
          selected.exhausted ? 'Exhausted' : '',
          selected.moved ? 'Moved' : '',
          selected.attacked ? 'Attacked' : '',
        ].filter(Boolean);
        const detailTags = [...traits, ...states];
        selectedPanel.innerHTML = `
          <div class="unit-name unit-owner-${selected.owner}">${definition.name}</div>
          <div class="unit-stats">
            <span>HP <strong>${selected.hp}/${definition.maxHp}</strong></span>
            <span>Attack <strong>${definition.attack}</strong></span>
            <span>Move <strong>${definition.move}</strong></span>
            <span>Range <strong>${effectiveRange(selected)}</strong></span>
          </div>
          ${detailTags.length ? `<div class="traits">${detailTags.join(' · ')}</div>` : ''}`;
      }
    }

    const abilityButton = document.querySelector<HTMLButtonElement>('#ability-button');
    if (abilityButton) {
      const isDisplacer = selected
        && selected.owner === this.state.currentPlayer
        && unitDefinition(selected).ability === 'Displace';
      abilityButton.hidden = !isDisplacer;
      abilityButton.textContent = 'Use Displace';
      abilityButton.disabled = !isDisplacer
        || selected.exhausted
        || selected.attacked
        || this.state.winner !== null
        || this.animationInProgress;
    }

    const endButton = document.querySelector<HTMLButtonElement>('#end-turn-button');
    if (endButton) {
      endButton.disabled = this.state.winner !== null
        || this.mode === 'restore-target'
        || this.animationInProgress;
    }
    const status = document.querySelector<HTMLElement>('#status');
    if (status) status.textContent = this.message;
    const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-button');
    if (cancelButton) cancelButton.disabled = !selected || this.animationInProgress;
    this.renderHand();
  }

  private renderHand(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    const player = this.state.players[this.state.currentPlayer];
    const handSignature = `${this.state.currentPlayer}:${player.hand.join('|')}`;
    const shouldDeal = handSignature !== this.lastHandSignature;
    hand.replaceChildren();
    player.hand.forEach((cardId, index) => {
      const card = cardDefinition(cardId as CardDefinitionId);
      const cardArt = CARD_ART[cardId as CardDefinitionId];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = [
        'card',
        this.selectedCardIndex === index ? 'selected' : '',
        shouldDeal ? 'deal-in' : '',
      ].filter(Boolean).join(' ');
      const hasSummonSite = card.type !== 'unit' || getValidSummonCoords(this.state).length > 0;
      button.disabled = card.cost > player.mana
        || !hasSummonSite
        || this.state.winner !== null
        || this.animationInProgress;
      button.dataset.handIndex = `${index}`;
      button.setAttribute('aria-label', `${card.name}, ${card.cost} mana`);
      const fanOffset = index - (player.hand.length - 1) / 2;
      button.style.setProperty('--fan-angle', `${fanOffset * 1.6}deg`);
      button.style.setProperty('--fan-y', `${Math.abs(fanOffset) * 2.5}px`);
      button.style.setProperty('--deal-delay', `${index * 70}ms`);
      if (index === 0) {
        button.dataset.holoStyle = 'masked';
        button.style.setProperty('--card-mask', `url("${cardArt}")`);
      } else if (index === 1) {
        button.dataset.holoStyle = 'cosmos';
      } else if (index === 3) {
        button.dataset.holoStyle = 'radiant';
      } else if (index === 4) {
        button.dataset.holoStyle = 'reverse';
      }
      button.innerHTML = `
        <span class="card-surface">
          <img class="card-art" src="${cardArt}" alt="" draggable="false" decoding="async">
          <span class="card-holo" aria-hidden="true"></span>
          <span class="card-glare" aria-hidden="true"></span>
        </span>`;
      button.addEventListener('pointermove', (event) => this.tiltCard(button, event));
      button.addEventListener('pointerleave', () => this.resetCardTilt(button));
      button.addEventListener('click', () => this.selectCard(index));
      hand.append(button);
    });
    this.lastHandSignature = handSignature;
  }

  private tiltCard(card: HTMLButtonElement, event: PointerEvent): void {
    if (card.disabled) return;
    const rect = card.getBoundingClientRect();
    const x = Phaser.Math.Clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = Phaser.Math.Clamp((event.clientY - rect.top) / rect.height, 0, 1);
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 16}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 20}deg`);
    card.style.setProperty('--shine-x', `${x * 100}%`);
    card.style.setProperty('--shine-y', `${y * 100}%`);
    card.style.setProperty('--holo-x', `${(1 - x) * 100}%`);
    card.style.setProperty('--holo-y', `${(1 - y) * 100}%`);
  }

  private resetCardTilt(card: HTMLButtonElement): void {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--shine-x', '50%');
    card.style.setProperty('--shine-y', '50%');
    card.style.setProperty('--holo-x', '50%');
    card.style.setProperty('--holo-y', '50%');
  }

  private animatePlayedCard(index: number): void {
    const source = document.querySelector<HTMLButtonElement>(`.card[data-hand-index="${index}"]`);
    if (!source) return;
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLButtonElement;
    ghost.disabled = false;
    ghost.classList.remove('selected', 'deal-in');
    ghost.classList.add('card-play-ghost');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.append(ghost);

    const travelX = window.innerWidth / 2 - (rect.left + rect.width / 2);
    const travelY = window.innerHeight * 0.34 - (rect.top + rect.height / 2);
    const animation = ghost.animate([
      { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1)' },
      { offset: 0.34, transform: `translate3d(${travelX * 0.3}px, ${travelY * 0.34 - 70}px, 0) rotate(-4deg) scale(1.24)`, opacity: 1, filter: 'brightness(1.55)' },
      { transform: `translate3d(${travelX}px, ${travelY}px, 0) rotate(9deg) scale(.28)`, opacity: 0, filter: 'brightness(2.1) blur(1px)' },
    ], {
      duration: 720,
      easing: 'cubic-bezier(.18,.88,.22,1)',
      fill: 'forwards',
    });
    void animation.finished.finally(() => ghost.remove());
  }
}
