import Phaser from 'phaser';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { CardDefinition, Coord, PlayerId, Terrain, UnitState } from '../data/types';
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
  getTacticTargets,
  getValidSummonCoords,
  moveUnit,
  playTacticCard,
  playUnitCard,
  terrainAt,
  unitAt,
  unitDefinition,
} from './engine';

const HEX_SIZE = 56;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const ORIGIN_X = 230;
const ORIGIN_Y = 170;
const WORLD_WIDTH = 1670;
const WORLD_HEIGHT = 1060;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.35;
const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x55b9f3, 2: 0xf05b67 };
const TERRAIN_PALETTES: Record<Terrain, number[]> = {
  plain: [0x66804b, 0x708852, 0x5d7946, 0x78905a],
  forest: [0x315638, 0x294a32, 0x3b6240],
  hill: [0x756648, 0x806f4e, 0x6c6046],
  water: [0x27779a, 0x2d84a7, 0x226d91],
  cliff: [0x52585a, 0x606465, 0x494f51],
};

type InteractionMode = 'unit' | 'card' | 'displace-target' | 'displace-destination' | null;

interface DragState {
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
  moved: boolean;
}

export class GameScene extends Phaser.Scene {
  private state = createGameState();
  private boardLayer?: Phaser.GameObjects.Container;
  private selectedUnitId: string | null = null;
  private selectedCardIndex: number | null = null;
  private displaceTargetId: string | null = null;
  private mode: InteractionMode = null;
  private dragState: DragState | null = null;
  private suppressBoardClickUntil = 0;
  private message = 'Player 1 begins. Move a unit or play a card.';

  constructor() {
    super('game');
  }

  create(): void {
    document.querySelector<HTMLButtonElement>('#end-turn-button')?.addEventListener('click', () => this.handleEndTurn());
    document.querySelector<HTMLButtonElement>('#cancel-button')?.addEventListener('click', () => this.cancelInteraction('Selection cleared.'));
    document.querySelector<HTMLButtonElement>('#ability-button')?.addEventListener('click', () => this.beginDisplace());
    document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click', () => this.zoomBy(0.12));
    document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click', () => this.zoomBy(-0.12));
    document.querySelector<HTMLButtonElement>('#zoom-reset')?.addEventListener('click', () => this.resetCamera());
    this.setupCameraControls();
    this.renderAll();
    this.resetCamera();
  }

  private setupCameraControls(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _objects: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number,
    ) => {
      const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
      const zoom = Phaser.Math.Clamp(camera.zoom - deltaY * 0.0012, MIN_ZOOM, MAX_ZOOM);
      camera.setZoom(zoom);
      camera.setScroll(worldPoint.x - pointer.x / zoom, worldPoint.y - pointer.y / zoom);
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
    });

    this.input.on('pointerup', () => {
      if (this.dragState?.moved) {
        this.suppressBoardClickUntil = performance.now() + 150;
      }
      this.dragState = null;
      this.game.canvas.classList.remove('dragging');
    });
  }

  private resetCamera(): void {
    const fit = Math.min(this.scale.width / 1500, this.scale.height / 950);
    this.cameras.main.setZoom(Phaser.Math.Clamp(fit, MIN_ZOOM, 1));
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.updateZoomLabel();
  }

  private zoomBy(change: number): void {
    const camera = this.cameras.main;
    const pointer = new Phaser.Math.Vector2(this.scale.width / 2, this.scale.height / 2);
    const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
    const zoom = Phaser.Math.Clamp(camera.zoom + change, MIN_ZOOM, MAX_ZOOM);
    camera.setZoom(zoom);
    camera.setScroll(worldPoint.x - pointer.x / zoom, worldPoint.y - pointer.y / zoom);
    this.updateZoomLabel();
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

    if (this.mode === 'unit' && selectedUnit) {
      for (const key of getReachableCoords(this.state, selectedUnit.id).keys()) move.add(key);
      for (const target of getAttackTargets(this.state, selectedUnit.id)) attack.add(coordKey(target.coord));
    }

    if (this.mode === 'card' && this.selectedCardIndex !== null) {
      const cardId = this.state.players[this.state.currentPlayer].hand[this.selectedCardIndex];
      const card = cardId ? CARD_DEFINITIONS[cardId as CardDefinitionId] : undefined;
      if (card?.type === 'unit') {
        for (const coord of getValidSummonCoords(this.state)) summon.add(coordKey(coord));
      } else if (card?.type === 'tactic') {
        for (const target of getTacticTargets(this.state, card.id)) attack.add(coordKey(target.coord));
      }
    }

    if (this.mode === 'displace-target' && selectedUnit) {
      for (const target of getDisplaceTargets(this.state, selectedUnit.id)) attack.add(coordKey(target.coord));
    }

    if (this.mode === 'displace-destination' && selectedUnit && this.displaceTargetId) {
      for (const coord of getDisplaceDestinations(this.state, selectedUnit.id, this.displaceTargetId)) summon.add(coordKey(coord));
    }
    return { move, attack, summon, selected };
  }

  private renderAll(): void {
    this.renderBoard();
    this.renderHud();
  }

  private renderBoard(): void {
    this.boardLayer?.destroy(true);
    this.boardLayer = this.add.container(0, 0);
    const highlight = this.highlights();
    const backdrop = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x1c3022);
    this.boardLayer.add(backdrop);
    this.addMapBackdropDetails();

    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        const key = coordKey(coord);
        const center = this.center(coord);
        const points = this.hexPoints(center);
        const hex = this.add.graphics();
        const palette = TERRAIN_PALETTES[terrainAt(coord)];
        const fill = palette[(q * 17 + r * 31) % palette.length];
        hex.fillStyle(0x101a13, 0.42);
        hex.fillPoints(this.hexPoints(new Phaser.Math.Vector2(center.x + 4, center.y + 6), 0), true);
        hex.fillStyle(fill, 1);
        hex.fillPoints(points, true);
        hex.fillStyle(0xffffff, 0.035);
        hex.fillPoints(this.hexPoints(new Phaser.Math.Vector2(center.x - 3, center.y - 4), 9), true);

        let stroke = 0x263828;
        let strokeWidth = 2;
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
        hex.lineStyle(strokeWidth, stroke, 0.95);
        hex.strokePoints(points, true);
        hex.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains);
        hex.on('pointerup', () => {
          if (!this.dragState?.moved && performance.now() >= this.suppressBoardClickUntil) this.handleHexClick(coord);
        });
        this.boardLayer.add(hex);
        this.addTerrainDetail(coord, center);
      }
    }

    for (const site of this.state.sites) this.addSite(site.coord, site.type, site.owner);
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

  private addMapBackdropDetails(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0f1e15, 0.46);
    graphics.fillCircle(100, 120, 230);
    graphics.fillCircle(WORLD_WIDTH - 80, 180, 270);
    graphics.fillCircle(170, WORLD_HEIGHT - 50, 270);
    graphics.fillCircle(WORLD_WIDTH - 130, WORLD_HEIGHT - 40, 250);
    graphics.lineStyle(2, 0x789160, 0.08);
    for (let index = 0; index < 26; index += 1) {
      const x = 40 + ((index * 193) % (WORLD_WIDTH - 80));
      const y = 30 + ((index * 317) % (WORLD_HEIGHT - 60));
      graphics.lineBetween(x - 10, y + 8, x, y - 9);
      graphics.lineBetween(x, y - 9, x + 8, y + 5);
    }
    this.boardLayer?.add(graphics);
  }

  private addTerrainDetail(coord: Coord, center: Phaser.Math.Vector2): void {
    const terrain = terrainAt(coord);
    const graphics = this.add.graphics();
    const seed = coord.q * 41 + coord.r * 73;

    if (terrain === 'plain') {
      graphics.lineStyle(2, 0xb1c37a, 0.28);
      for (let index = 0; index < 4; index += 1) {
        const x = center.x - 28 + ((seed + index * 19) % 54);
        const y = center.y - 19 + ((seed + index * 29) % 38);
        graphics.lineBetween(x, y + 5, x + 2, y - 4);
        graphics.lineBetween(x + 2, y - 4, x + 6, y + 2);
      }
    }

    if (terrain === 'forest') {
      graphics.fillStyle(0x142b20, 0.35);
      graphics.fillEllipse(center.x, center.y + 15, 74, 25);
      const trees = [[-22, 4, 18], [0, -8, 23], [23, 6, 17], [3, 13, 18]];
      for (const [dx, dy, size] of trees) {
        graphics.fillStyle(0x402f20, 0.9);
        graphics.fillRect(center.x + dx - 2, center.y + dy, 4, 18);
        graphics.fillStyle(0x183f29, 1);
        graphics.fillTriangle(
          center.x + dx, center.y + dy - size,
          center.x + dx - size * 0.58, center.y + dy + 5,
          center.x + dx + size * 0.58, center.y + dy + 5,
        );
        graphics.lineStyle(1, 0x6b8f55, 0.45);
        graphics.strokeTriangle(
          center.x + dx, center.y + dy - size,
          center.x + dx - size * 0.58, center.y + dy + 5,
          center.x + dx + size * 0.58, center.y + dy + 5,
        );
      }
    }

    if (terrain === 'hill') {
      graphics.fillStyle(0x4e4534, 0.48);
      graphics.fillEllipse(center.x, center.y + 13, 76, 29);
      graphics.fillStyle(0xa08a5d, 0.7);
      graphics.fillTriangle(center.x - 35, center.y + 16, center.x - 7, center.y - 20, center.x + 20, center.y + 16);
      graphics.fillStyle(0x82724f, 0.85);
      graphics.fillTriangle(center.x - 5, center.y + 17, center.x + 19, center.y - 11, center.x + 39, center.y + 17);
      graphics.lineStyle(2, 0xc1ae79, 0.32);
      graphics.lineBetween(center.x - 28, center.y + 20, center.x + 31, center.y + 20);
    }

    if (terrain === 'water') {
      graphics.lineStyle(2, 0x8bd7e4, 0.48);
      for (let index = -1; index <= 1; index += 1) {
        const offset = ((seed + index * 11) % 12) - 6;
        graphics.lineBetween(center.x - 31 + offset, center.y + index * 15, center.x - 7 + offset, center.y + index * 15);
        graphics.lineBetween(center.x + 4 + offset, center.y + index * 15, center.x + 30 + offset, center.y + index * 15);
      }
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

  private addSite(coord: Coord, type: 'keep' | 'fort' | 'well', owner: PlayerId | null): void {
    const center = this.center(coord);
    const ownerColor = owner ? PLAYER_COLORS[owner] : 0xd2c5a2;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0c120e, 0.5);
    graphics.fillEllipse(center.x + 4, center.y + 26, 78, 25);

    if (type === 'keep') {
      graphics.fillStyle(0x29322c, 1);
      graphics.fillRect(center.x - 29, center.y - 16, 58, 47);
      graphics.fillStyle(ownerColor, 0.95);
      graphics.fillRect(center.x - 35, center.y - 31, 18, 58);
      graphics.fillRect(center.x + 17, center.y - 31, 18, 58);
      graphics.fillRect(center.x - 23, center.y - 24, 46, 13);
      for (const x of [-34, -23, 18, 29]) graphics.fillRect(center.x + x, center.y - 38, 7, 11);
      graphics.fillStyle(0x101713, 1);
      graphics.fillRect(center.x - 7, center.y + 7, 14, 24);
    } else if (type === 'fort') {
      graphics.fillStyle(0x5b6257, 1);
      graphics.fillRect(center.x - 30, center.y - 14, 60, 39);
      graphics.fillStyle(0x909681, 1);
      for (const x of [-29, -9, 11]) graphics.fillRect(center.x + x, center.y - 24, 17, 16);
      graphics.fillStyle(0x252c27, 1);
      graphics.fillRect(center.x - 6, center.y + 4, 12, 21);
    } else {
      graphics.fillStyle(0x283c3b, 1);
      graphics.fillCircle(center.x, center.y, 29);
      graphics.lineStyle(7, ownerColor, 1);
      graphics.strokeCircle(center.x, center.y, 27);
      graphics.lineStyle(3, 0xb7f5ef, 0.9);
      graphics.strokeCircle(center.x, center.y, 14);
      graphics.fillStyle(0x75d5df, 0.85);
      graphics.fillCircle(center.x, center.y, 9);
    }
    graphics.lineStyle(3, ownerColor, 0.95);
    graphics.strokeCircle(center.x, center.y, type === 'well' ? 35 : 42);
    this.boardLayer?.add(graphics);

    const label = this.add.text(center.x, center.y + 42, type === 'keep' ? 'KEEP' : type === 'fort' ? 'FORT' : 'WELL', {
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
    const graphics = this.add.graphics();
    graphics.fillStyle(0x07100a, 0.56);
    graphics.fillEllipse(center.x + 4, center.y + 25, 58 * scale, 19 * scale);
    const tokenPoints = [
      new Phaser.Geom.Point(center.x, center.y - 31 * scale),
      new Phaser.Geom.Point(center.x + 27 * scale, center.y - 14 * scale),
      new Phaser.Geom.Point(center.x + 22 * scale, center.y + 18 * scale),
      new Phaser.Geom.Point(center.x, center.y + 32 * scale),
      new Phaser.Geom.Point(center.x - 22 * scale, center.y + 18 * scale),
      new Phaser.Geom.Point(center.x - 27 * scale, center.y - 14 * scale),
    ];
    graphics.fillStyle(PLAYER_COLORS[unit.owner], unit.exhausted ? 0.58 : 1);
    graphics.fillPoints(tokenPoints, true);
    graphics.fillStyle(0xffffff, 0.14);
    graphics.fillTriangle(
      center.x - 18 * scale, center.y - 12 * scale,
      center.x, center.y - 25 * scale,
      center.x, center.y + 20 * scale,
    );
    graphics.lineStyle(selected ? 6 : 3, selected ? 0xffefb0 : 0x132019, 1);
    graphics.strokePoints(tokenPoints, true);
    this.boardLayer?.add(graphics);

    const mark = this.add.text(center.x, center.y - 2, definition.mark, {
      fontFamily: 'Georgia, serif', fontSize: definition.id === 'commander' ? '28px' : '24px',
      color: '#0b171d', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 1,
    }).setOrigin(0.5);
    const hpBadge = this.add.circle(center.x + 27, center.y + 25, 13, 0x1a241c).setStrokeStyle(2, 0xe8dab5);
    const hp = this.add.text(center.x + 27, center.y + 25, `${unit.hp}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff8e6', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.boardLayer?.add([mark, hpBadge, hp]);

    if (unit.exhausted) {
      const exhausted = this.add.text(center.x - 27, center.y - 26, 'Z', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#f5e7bd', fontStyle: 'bold',
        backgroundColor: '#43364c', padding: { x: 4, y: 2 },
      }).setOrigin(0.5);
      this.boardLayer?.add(exhausted);
    }
  }

  private handleHexClick(coord: Coord): void {
    if (this.state.winner) return;
    const occupant = unitAt(this.state, coord);

    if (this.mode === 'card' && this.selectedCardIndex !== null) {
      const cardId = this.state.players[this.state.currentPlayer].hand[this.selectedCardIndex];
      const card = cardId ? CARD_DEFINITIONS[cardId as CardDefinitionId] : undefined;
      if (!card) return this.cancelInteraction('That card is no longer in hand.');
      const result = card.type === 'unit'
        ? playUnitCard(this.state, this.selectedCardIndex, coord)
        : occupant
          ? playTacticCard(this.state, this.selectedCardIndex, occupant.id)
          : { ok: false, message: 'Choose a highlighted unit.' };
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
      const result = attackUnit(this.state, selected.id, occupant.id);
      this.message = result.message;
      return this.renderAll();
    }

    if (selected && selected.owner === this.state.currentPlayer && !occupant) {
      const result = moveUnit(this.state, selected.id, coord);
      this.message = result.message;
      return this.renderAll();
    }

    if (occupant) {
      this.selectedUnitId = occupant.id;
      this.selectedCardIndex = null;
      this.displaceTargetId = null;
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
    if (this.state.winner) return;
    if (this.selectedCardIndex === index) return this.cancelInteraction('Card selection cleared.');
    const cardId = this.state.players[this.state.currentPlayer].hand[index];
    const card = CARD_DEFINITIONS[cardId as CardDefinitionId];
    this.selectedCardIndex = index;
    this.selectedUnitId = null;
    this.displaceTargetId = null;
    this.mode = 'card';
    this.message = card.type === 'unit'
      ? `Choose a highlighted spawn hex for ${card.name}.`
      : `Choose a highlighted target for ${card.name}.`;
    this.renderAll();
  }

  private beginDisplace(): void {
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
    const result = endTurn(this.state);
    this.clearInteraction();
    this.message = result.message;
    this.renderAll();
  }

  private clearInteraction(): void {
    this.selectedUnitId = null;
    this.selectedCardIndex = null;
    this.displaceTargetId = null;
    this.mode = null;
  }

  private cancelInteraction(message: string): void {
    this.clearInteraction();
    this.message = message;
    this.renderAll();
  }

  private renderHud(): void {
    const current = this.state.players[this.state.currentPlayer];
    const manaCount = document.querySelector<HTMLElement>('#mana-count');
    if (manaCount) manaCount.textContent = `${current.mana}`;
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
      abilityButton.disabled = !isDisplacer || selected.exhausted || selected.attacked || this.state.winner !== null;
    }

    const endButton = document.querySelector<HTMLButtonElement>('#end-turn-button');
    if (endButton) endButton.disabled = this.state.winner !== null;
    const status = document.querySelector<HTMLElement>('#status');
    if (status) status.textContent = this.message;
    const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-button');
    if (cancelButton) cancelButton.disabled = !selected;
    this.renderHand();
  }

  private renderHand(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    const player = this.state.players[this.state.currentPlayer];
    hand.replaceChildren();
    player.hand.forEach((cardId, index) => {
      const card = CARD_DEFINITIONS[cardId as CardDefinitionId];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `card${this.selectedCardIndex === index ? ' selected' : ''}`;
      button.disabled = card.cost > player.mana || this.state.winner !== null;
      button.innerHTML = `
        <span class="card-cost">${card.cost}</span>
        <span class="card-type">${card.type}</span>
        <span class="card-name">${card.name}</span>
        <span class="card-copy">${this.cardCopy(card)}</span>`;
      button.addEventListener('click', () => this.selectCard(index));
      hand.append(button);
    });
  }

  private cardCopy(card: CardDefinition): string {
    if (card.type === 'unit') {
      const definition = unitDefinition({ definitionId: card.unitId } as UnitState);
      const traits = [...definition.traits, ...(definition.ability ? [definition.ability] : [])].join(', ');
      return `${definition.maxHp} HP · ${definition.attack} ATK · ${definition.move} MOV · ${definition.range} RNG${traits ? `<br>${traits}` : ''}`;
    }
    const verb = card.effect.kind === 'damage' ? 'Deal' : 'Heal';
    return `${verb} ${card.effect.amount} to a ${card.effect.target} unit.`;
  }
}
