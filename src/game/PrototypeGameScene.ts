import Phaser from 'phaser';
import { MAP_RENDER_MODE } from '../data/mapRenderMode';
import { BRIDGE_TERRAIN_ART } from '../data/terrainArt';
import type { Coord, GameState, PlayerId } from '../data/types';
import {
  ActionReadabilityLayer,
  type ActionReadabilitySceneInternals,
} from './ActionReadability';
import { AuthoredMapPresentation } from './AuthoredMapPresentation';
import {
  CapturePresentation,
  type CapturePresentationSceneInternals,
} from './CapturePresentation';
import { FactionCursor, type FactionCursorSceneInternals } from './FactionCursor';
import { PersistentAiGameScene } from './PersistentAiGameScene';
import { SpellHud, type SpellHudSceneInternals } from './SpellHud';
import {
  TacticalReadabilityLayer,
  type TacticalSceneInternals,
} from './TacticalReadability';
import {
  UnitInteractionPolish,
  type UnitInteractionSceneInternals,
} from './UnitInteractionPolish';

interface PrototypeSceneInternals
  extends TacticalSceneInternals,
  ActionReadabilitySceneInternals,
  SpellHudSceneInternals,
  FactionCursorSceneInternals,
  UnitInteractionSceneInternals,
  CapturePresentationSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  renderedUnits: Map<string, { container: Phaser.GameObjects.Container }>;
  renderAll: () => void;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

const LOCK_COLOR = 0x8d55d8;
const RITUAL_COLOR = 0xb76cff;
const HUMAN_ACCENT = 0x55b9f3;
const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x55b9f3, 2: 0xf05b67 };

export class PrototypeGameScene extends PersistentAiGameScene {
  private readability?: TacticalReadabilityLayer;
  private actionReadability?: ActionReadabilityLayer;
  private unitInteraction?: UnitInteractionPolish;
  private capturePresentation?: CapturePresentation;
  private spellHud?: SpellHud;
  private factionCursor?: FactionCursor;
  private authoredMap?: AuthoredMapPresentation;
  private tacticPlaceholders: Phaser.GameObjects.GameObject[] = [];

  create(): void {
    super.create();
    const scene = this as unknown as PrototypeSceneInternals;

    this.spellHud = new SpellHud(this, scene);
    this.spellHud.install();
    this.factionCursor = new FactionCursor(this, scene);
    this.factionCursor.install();
    this.authoredMap = new AuthoredMapPresentation(this, MAP_RENDER_MODE);

    const originalRenderAll = scene.renderAll.bind(this);
    this.readability = new TacticalReadabilityLayer(this, scene);
    this.actionReadability = new ActionReadabilityLayer(this, scene);
    this.unitInteraction = new UnitInteractionPolish(this, scene);
    this.capturePresentation = new CapturePresentation(this, scene);

    scene.renderAll = () => {
      originalRenderAll();
      this.authoredMap?.render(scene);
      this.renderTacticPlaceholders(scene);
      this.readability?.render();
      this.actionReadability?.render();
      this.capturePresentation?.render();
      this.unitInteraction?.render();
    };

    this.readability.install();
    this.actionReadability.install();
    this.unitInteraction.install();
    this.capturePresentation.install();
    this.events.once('shutdown', () => {
      this.readability = undefined;
      this.actionReadability = undefined;
      this.unitInteraction = undefined;
      this.capturePresentation = undefined;
      this.spellHud = undefined;
      this.factionCursor = undefined;
      this.authoredMap = undefined;
      this.clearTacticPlaceholders();
    });

    // The base scene has already rendered once during create(). Redraw once so
    // resumed matches immediately show board state and tactical readability.
    scene.renderAll();
  }

  private renderTacticPlaceholders(scene: PrototypeSceneInternals): void {
    this.clearTacticPlaceholders();
    const board = scene.boardLayer;
    if (!board) return;

    const unitIndices = [...scene.renderedUnits.values()]
      .map((view) => board.getIndex(view.container))
      .filter((index) => index >= 0);
    const firstUnitIndex = unitIndices.length > 0 ? Math.min(...unitIndices) : board.list.length;

    // Each site currently contributes one Graphics + one Text child. Insert terrain
    // state after map decorations but before sites/units so units remain readable.
    const terrainLayerIndex = Math.max(1, firstUnitIndex - scene.state.sites.length * 2);
    let terrainOffset = 0;
    const addTerrainObject = (object: Phaser.GameObjects.GameObject): void => {
      board.addAt(object, Math.min(terrainLayerIndex + terrainOffset, board.list.length));
      this.tacticPlaceholders.push(object);
      terrainOffset += 1;
    };

    for (const coord of scene.state.builtBridges) {
      addTerrainObject(this.drawBuiltBridge(scene, coord));
    }

    for (const coord of scene.state.scorchedForests) {
      addTerrainObject(this.drawScorchedForest(scene, coord));
    }

    for (const pending of scene.state.pendingManaWells) {
      const { graphics, label } = this.drawPendingManaWell(
        scene,
        pending.coord,
        pending.remainingTurns,
        pending.owner,
      );
      addTerrainObject(graphics);
      addTerrainObject(label);
    }

    // Raised Fort already uses the normal fort renderer. A light construction halo
    // distinguishes player-created Forts without obscuring an occupying unit.
    for (const site of scene.state.sites.filter((candidate) => candidate.id.startsWith('built-fort-'))) {
      const marker = this.drawRaisedFortMarker(scene, site.coord);
      board.addAt(marker, Math.min(firstUnitIndex + terrainOffset, board.list.length));
      this.tacticPlaceholders.push(marker);
    }

    // Grave Lock may contain a unit, so render only an edge/rune overlay above units.
    for (const effect of scene.state.tileEffects) {
      if (effect.kind !== 'graveLock') continue;
      const { graphics, label } = this.drawGraveLock(scene, effect.coord);
      board.add(graphics);
      board.add(label);
      this.tacticPlaceholders.push(graphics, label);
    }
  }

  private clearTacticPlaceholders(): void {
    for (const object of this.tacticPlaceholders) {
      if (object.active) object.destroy();
    }
    this.tacticPlaceholders = [];
  }

  private drawBuiltBridge(scene: PrototypeSceneInternals, coord: Coord): Phaser.GameObjects.Image {
    const center = scene.center(coord);
    return this.add.image(center.x, center.y, BRIDGE_TERRAIN_ART.textureKey)
      .setDisplaySize(BRIDGE_TERRAIN_ART.displayWidth, BRIDGE_TERRAIN_ART.displayHeight);
  }

  private drawScorchedForest(scene: PrototypeSceneInternals, coord: Coord): Phaser.GameObjects.Graphics {
    const center = scene.center(coord);
    const graphics = this.add.graphics();
    const points = scene.hexPoints(center, 4);

    graphics.fillStyle(0x30251d, 0.96);
    graphics.fillPoints(points, true);
    graphics.fillStyle(0x4a3422, 0.78);
    graphics.fillEllipse(center.x, center.y + 8, 72, 39);

    graphics.lineStyle(3, 0x15120f, 0.92);
    graphics.lineBetween(center.x - 30, center.y + 17, center.x - 13, center.y - 6);
    graphics.lineBetween(center.x - 13, center.y - 6, center.x - 2, center.y + 10);
    graphics.lineBetween(center.x + 8, center.y + 17, center.x + 22, center.y - 8);
    graphics.lineBetween(center.x + 22, center.y - 8, center.x + 33, center.y + 7);

    for (const [dx, dy, height] of [[-24, 4, 20], [17, 9, 24], [2, -8, 16]] as const) {
      graphics.fillStyle(0x17130f, 1);
      graphics.fillRect(center.x + dx - 3, center.y + dy - height, 7, height);
      graphics.lineStyle(3, 0x17130f, 1);
      graphics.lineBetween(center.x + dx, center.y + dy - height + 4, center.x + dx - 8, center.y + dy - height - 5);
      graphics.lineBetween(center.x + dx, center.y + dy - height + 7, center.x + dx + 8, center.y + dy - height - 2);
    }

    graphics.fillStyle(0xc8642e, 0.75);
    graphics.fillCircle(center.x - 9, center.y + 11, 2);
    graphics.fillCircle(center.x + 29, center.y + 14, 2);
    return graphics;
  }

  private drawPendingManaWell(
    scene: PrototypeSceneInternals,
    coord: Coord,
    remainingTurns: number,
    owner: PlayerId,
  ): { graphics: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } {
    const center = scene.center(coord);
    const graphics = this.add.graphics();
    const completion = Phaser.Math.Clamp((4 - remainingTurns) / 3, 0.34, 1);
    const ownerColor = PLAYER_COLORS[owner];

    graphics.fillStyle(0x160e20, 0.52 + completion * 0.16);
    graphics.fillCircle(center.x, center.y, 34);
    graphics.lineStyle(3, ownerColor, 0.55 + completion * 0.35);
    graphics.strokeCircle(center.x, center.y, 35);
    graphics.lineStyle(4, RITUAL_COLOR, 0.5 + completion * 0.45);
    graphics.strokeCircle(center.x, center.y, 31);
    graphics.lineStyle(2, 0xe1b7ff, 0.4 + completion * 0.5);
    graphics.strokeCircle(center.x, center.y, 18);

    const runeRadius = 26;
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 60 - 30);
      const x = center.x + Math.cos(angle) * runeRadius;
      const y = center.y + Math.sin(angle) * runeRadius;
      graphics.fillStyle(index % 2 === 0 ? RITUAL_COLOR : 0x6f3ca4, 0.5 + completion * 0.45);
      graphics.fillTriangle(x, y - 4, x - 4, y + 4, x + 4, y + 4);
    }

    graphics.lineStyle(2, RITUAL_COLOR, 0.3 + completion * 0.5);
    graphics.lineBetween(center.x - 22, center.y - 13, center.x + 22, center.y + 13);
    graphics.lineBetween(center.x + 22, center.y - 13, center.x - 22, center.y + 13);

    const label = this.add.text(center.x, center.y, `${remainingTurns}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#f4dcff',
      fontStyle: 'bold',
      stroke: '#1b0b28',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0.62 + completion * 0.38);
    return { graphics, label };
  }

  private drawRaisedFortMarker(scene: PrototypeSceneInternals, coord: Coord): Phaser.GameObjects.Graphics {
    const center = scene.center(coord);
    const graphics = this.add.graphics();
    graphics.lineStyle(3, HUMAN_ACCENT, 0.8);
    graphics.strokeCircle(center.x, center.y, 57);

    for (const angleDegrees of [30, 150, 210, 330]) {
      const angle = Phaser.Math.DegToRad(angleDegrees);
      const x = center.x + Math.cos(angle) * 54;
      const y = center.y + Math.sin(angle) * 54;
      graphics.fillStyle(HUMAN_ACCENT, 0.9);
      graphics.fillRect(x - 3, y - 6, 6, 12);
    }
    return graphics;
  }

  private drawGraveLock(
    scene: PrototypeSceneInternals,
    coord: Coord,
  ): { graphics: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } {
    const center = scene.center(coord);
    const points = scene.hexPoints(center, 3);
    const graphics = this.add.graphics();

    graphics.lineStyle(5, LOCK_COLOR, 0.9);
    graphics.strokePoints(points, true);
    graphics.lineStyle(2, 0xd7bbff, 0.7);
    graphics.strokeCircle(center.x, center.y, 35);

    for (const point of points) {
      graphics.fillStyle(0x1d1129, 0.95);
      graphics.fillCircle(point.x, point.y, 7);
      graphics.lineStyle(2, LOCK_COLOR, 1);
      graphics.strokeCircle(point.x, point.y, 5);
    }

    // Sparse chain links keep the unit in the middle readable.
    for (const [dx, dy] of [[-31, -8], [-19, 22], [24, 20], [32, -9]] as const) {
      graphics.lineStyle(3, 0xcaa6ff, 0.8);
      graphics.strokeEllipse(center.x + dx, center.y + dy, 13, 7);
    }

    const label = this.add.text(center.x, center.y + 39, 'LOCK', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '9px',
      color: '#eadcff',
      fontStyle: 'bold',
      stroke: '#1a0d24',
      strokeThickness: 4,
    }).setOrigin(0.5);
    return { graphics, label };
  }
}
