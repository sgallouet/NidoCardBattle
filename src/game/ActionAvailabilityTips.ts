import type Phaser from 'phaser';
import type { Coord, GameState } from '../data/types';
import {
  coordKey,
  effectiveRange,
  effectiveTerrainAt,
  findUnit,
  getAttackTargets,
  getReachableCoords,
  hexDistance,
  neighbors,
  unitAt,
  unitDefinition,
} from './engine';
import { showInvalidBoardFeedback } from './InvalidActionFeedback';

interface HighlightSets {
  move: Set<string>;
  attack: Set<string>;
  summon: Set<string>;
  selected: Set<string>;
}

export interface ActionAvailabilitySceneInternals {
  state: GameState;
  mode: string | null;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  hoveredTileKey: string | null;
  animationInProgress?: boolean;
  hexGeometry: Map<string, { coord: Coord }>;
  highlights: () => HighlightSets;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

interface Tip {
  eyebrow: string;
  title: string;
  badge: string;
  label: string;
  text: string;
  feedback?: string;
  sourceCoord?: Coord;
  blockingCoord?: Coord;
}

interface PendingInvalidAction {
  pointerId: number;
  startX: number;
  startY: number;
  coord: Coord;
  tip: Tip;
}

export class ActionAvailabilityTips {
  private timer: number | null = null;
  private pendingInvalid?: PendingInvalidAction;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: ActionAvailabilitySceneInternals,
    private readonly tileTipsEnabled: () => boolean,
  ) {}

  install(): void {
    this.scene.input.on('pointermove', this.handlePointerMove);
    this.scene.input.on('pointerdown', this.handlePointerDown);
    this.scene.input.on('pointerup', this.handlePointerUp);
    this.scene.game.canvas.addEventListener('pointerleave', this.clearTimer);
  }

  destroy(): void {
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.game.canvas.removeEventListener('pointerleave', this.clearTimer);
    this.clearTimer();
    this.pendingInvalid = undefined;
  }

  private readonly handlePointerMove = (): void => {
    if (!this.tileTipsEnabled() || window.matchMedia('(hover: none)').matches) return;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.refreshContextTip();
    }, 265);
  };

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    this.pendingInvalid = undefined;
    if (this.game.animationInProgress || document.querySelector('#app')?.classList.contains('match-intro-active')) return;
    const key = this.game.hoveredTileKey;
    const coord = key ? this.game.hexGeometry.get(key)?.coord : undefined;
    if (!key || !coord) return;
    const tip = this.tipFor(coord, key);
    if (!tip) return;
    this.pendingInvalid = {
      pointerId: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      coord: { ...coord },
      tip,
    };
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    const pending = this.pendingInvalid;
    this.pendingInvalid = undefined;
    if (!pending || pending.pointerId !== pointer.id) return;
    const threshold = pointer.wasTouch ? 14 : 7;
    if (Math.hypot(pointer.x - pending.startX, pointer.y - pending.startY) > threshold) return;

    showInvalidBoardFeedback(
      this.scene.game.canvas,
      pointer.x,
      pointer.y,
      { title: pending.tip.title, detail: pending.tip.feedback ?? pending.tip.badge },
    );
    this.flashInvalidAction(pending.coord, pending.tip);
  };

  private readonly clearTimer = (): void => {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  };

  private refreshContextTip(): void {
    if (document.querySelector('#app')?.classList.contains('match-intro-active')) return;
    const key = this.game.hoveredTileKey;
    const coord = key ? this.game.hexGeometry.get(key)?.coord : undefined;
    if (!key || !coord) return;
    const panel = document.querySelector<HTMLElement>('#tile-insight');
    if (!panel || panel.hidden) return;

    const tip = this.tipFor(coord, key);
    if (!tip) return;

    const eyebrow = document.querySelector<HTMLElement>('#tile-insight-eyebrow');
    const title = document.querySelector<HTMLElement>('#tile-insight-title');
    const badge = document.querySelector<HTMLElement>('#tile-insight-badge');
    const rows = document.querySelector<HTMLElement>('#tile-insight-rows');
    if (!eyebrow || !title || !badge || !rows) return;

    eyebrow.textContent = tip.eyebrow;
    title.textContent = tip.title;
    badge.textContent = tip.badge;
    panel.dataset.tone = 'hostile';

    const item = document.createElement('div');
    item.className = 'tile-insight-row';
    const label = document.createElement('span');
    label.className = 'tile-insight-label';
    label.textContent = tip.label;
    const copy = document.createElement('span');
    copy.className = 'tile-insight-copy';
    copy.textContent = tip.text;
    item.append(label, copy);
    rows.prepend(item);
  }

  private tipFor(coord: Coord, key: string): Tip | undefined {
    const state = this.game.state;
    const occupant = unitAt(state, coord);
    const selected = this.game.selectedUnitId ? findUnit(state, this.game.selectedUnitId) : undefined;

    if (occupant?.owner === 1 && occupant.exhausted) {
      return {
        eyebrow: 'Unit unavailable',
        title: 'Exhausted',
        badge: 'No actions',
        label: 'Why',
        text: `${unitDefinition(occupant).name} has already acted this turn. End the turn to ready it again.`,
        feedback: 'No actions this turn',
      };
    }

    if (this.game.mode === 'card' && this.game.selectedCardIndex !== null) {
      const legal = this.game.highlights().summon;
      if (!legal.has(key)) {
        return {
          eyebrow: 'Card target unavailable',
          title: 'Wrong target',
          badge: 'Not legal',
          label: 'Target',
          text: 'This card cannot be played here. Choose one of the highlighted hexes.',
          feedback: 'Choose a highlighted hex',
        };
      }
      return undefined;
    }

    if (!selected || selected.owner !== state.currentPlayer || this.game.mode !== 'unit') return undefined;
    const definition = unitDefinition(selected);

    if (selected.exhausted) {
      return {
        eyebrow: 'Action unavailable',
        title: 'Unit exhausted',
        badge: 'No actions',
        label: 'Why',
        text: `${definition.name} has already acted this turn.`,
        feedback: 'End turn to ready this unit',
      };
    }

    if (occupant?.owner !== undefined && occupant.owner !== selected.owner) {
      const legalTargets = getAttackTargets(state, selected.id);
      if (legalTargets.some((target) => target.id === occupant.id)) return undefined;
      const distance = hexDistance(selected.coord, occupant.coord);
      if (distance > effectiveRange(selected)) {
        return {
          eyebrow: 'Attack unavailable',
          title: 'Out of range',
          badge: `${distance} hexes`,
          label: 'Range',
          text: `${definition.name} can attack up to ${effectiveRange(selected)} hex${effectiveRange(selected) === 1 ? '' : 'es'} away.`,
          feedback: `Range ${effectiveRange(selected)} · Distance ${distance}`,
          sourceCoord: { ...selected.coord },
        };
      }
      return {
        eyebrow: 'Attack unavailable',
        title: selected.attacked ? 'Already attacked' : 'Cannot attack',
        badge: 'Not legal',
        label: 'Why',
        text: selected.attacked
          ? `${definition.name} has already attacked this turn.`
          : 'This target is not currently a legal attack. Look for red highlighted hexes.',
        feedback: selected.attacked ? 'Attack already used' : 'Not a legal attack target',
        sourceCoord: { ...selected.coord },
      };
    }

    if (!occupant && coordKey(coord) !== coordKey(selected.coord)) {
      const reachable = getReachableCoords(state, selected.id);
      if (reachable.has(key)) return undefined;
      if (selected.pendingAdvance) {
        return {
          eyebrow: 'Movement unavailable', title: 'Reposition choice', badge: 'After attack', label: 'Move',
          text: 'Choose a highlighted hex to reposition, or leave this unit in place.',
          feedback: 'Choose a highlighted reposition hex',
        };
      }
      if (selected.moved) {
        return {
          eyebrow: 'Movement unavailable',
          title: 'Already moved',
          badge: 'No Move',
          label: 'Why',
          text: `${definition.name} has already used its movement this turn.`,
          feedback: 'Movement already used',
        };
      }
      const terrain = effectiveTerrainAt(state, coord);
      if (terrain === 'mountain' || ((terrain === 'water' || terrain === 'cliff') && !definition.traits.includes('Flying'))) {
        return {
          eyebrow: 'Movement unavailable',
          title: 'Terrain blocked',
          badge: 'Impassable',
          label: 'Move',
          text: terrain === 'mountain'
            ? 'Mountains block every unit, including Flying units.'
            : `${definition.name} cannot enter this terrain.`,
          feedback: terrain === 'mountain' ? 'Mountains are impassable' : 'This unit cannot enter here',
        };
      }
      const blockingEnemy = neighbors(coord).map((neighbor) => unitAt(state, neighbor)).find((unit) =>
        unit && unit.owner !== selected.owner && unitDefinition(unit).traits.includes('Blocking'));
      return {
        eyebrow: 'Movement unavailable',
        title: blockingEnemy ? 'Path blocked' : 'Out of reach',
        badge: blockingEnemy ? 'Blocking' : 'Too far',
        label: 'Move',
        text: blockingEnemy
          ? `${unitDefinition(blockingEnemy).name} has Blocking. Movement cannot pass through its control zone.`
          : 'No legal path reaches this hex with the unit’s remaining Move.',
        feedback: blockingEnemy ? `Blocked by ${unitDefinition(blockingEnemy).name}` : 'No legal path with remaining Move',
        blockingCoord: blockingEnemy ? { ...blockingEnemy.coord } : undefined,
      };
    }

    return undefined;
  }

  private flashInvalidAction(coord: Coord, tip: Tip): void {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(5000);
    graphics.fillStyle(0xff526a, 0.1);
    graphics.lineStyle(3, 0xff6478, 0.95);
    const points = this.game.hexPoints(this.game.center(coord), 3);
    graphics.fillPoints(points, true);
    graphics.strokePoints(points, true);

    if (tip.sourceCoord) {
      const source = this.game.center(tip.sourceCoord);
      const target = this.game.center(coord);
      graphics.lineStyle(2, 0xff7182, 0.72);
      graphics.beginPath();
      graphics.moveTo(source.x, source.y);
      graphics.lineTo(target.x, target.y);
      graphics.strokePath();
      graphics.strokeCircle(source.x, source.y, 12);
    }

    if (tip.blockingCoord) {
      const blocker = this.game.center(tip.blockingCoord);
      graphics.lineStyle(4, 0xff405c, 0.98);
      graphics.strokeCircle(blocker.x, blocker.y, 31);
      graphics.strokeCircle(blocker.x, blocker.y, 38);
    }

    this.scene.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => graphics.destroy(),
    });
  }
}
