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
  hexGeometry: Map<string, { coord: Coord }>;
  highlights: () => HighlightSets;
}

interface Tip {
  eyebrow: string;
  title: string;
  badge: string;
  label: string;
  text: string;
}

export class ActionAvailabilityTips {
  private timer: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: ActionAvailabilitySceneInternals,
    private readonly tileTipsEnabled: () => boolean,
  ) {}

  install(): void {
    this.scene.input.on('pointermove', this.handlePointerMove);
    this.scene.game.canvas.addEventListener('pointerleave', this.clearTimer);
  }

  destroy(): void {
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.game.canvas.removeEventListener('pointerleave', this.clearTimer);
    this.clearTimer();
  }

  private readonly handlePointerMove = (): void => {
    if (!this.tileTipsEnabled() || window.matchMedia('(hover: none)').matches) return;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.refreshContextTip();
    }, 265);
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
      };
    }

    if (!occupant && coordKey(coord) !== coordKey(selected.coord)) {
      const reachable = getReachableCoords(state, selected.id);
      if (reachable.has(key)) return undefined;
      if (selected.moved) {
        return {
          eyebrow: 'Movement unavailable',
          title: 'Already moved',
          badge: 'No Move',
          label: 'Why',
          text: `${definition.name} has already used its movement this turn.`,
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
      };
    }

    return undefined;
  }
}
