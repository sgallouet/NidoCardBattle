import { describe, expect, it } from 'vitest';
import type { Coord, UnitState } from '../data/types';
import { UNIT_DEFINITIONS } from '../data/units';
import { createGameState, moveUnit } from './engine';
import {
  reconsiderationPreviewCoordPaths,
  shortestReconsiderationPresentationPath,
} from './MovementReconsiderationPresentation';

const fixedRandom = () => 0.25;

const moverAt = (coord: Coord): UnitState => ({
  id: 'mover',
  definitionId: 'royalGuard',
  owner: 1,
  coord,
  hp: UNIT_DEFINITIONS.royalGuard.maxHp,
  exhausted: false,
  moved: false,
  attacked: false,
  movementSpent: 0,
  postAttackMoved: false,
  moveBonus: 0,
  curses: [],
});

describe('movement reconsideration presentation', () => {
  it('walks directly from the current visual tile to the replacement destination', () => {
    const state = createGameState(fixedRandom);
    const mover = moverAt({ q: 0, r: 6 });
    state.units = [mover];

    expect(moveUnit(state, mover.id, { q: 1, r: 6 }).ok).toBe(true);
    const replacement = moveUnit(state, mover.id, { q: 2, r: 6 });
    expect(replacement.ok).toBe(true);
    expect(replacement.path).toEqual([
      { q: 1, r: 6 },
      { q: 0, r: 6 },
      { q: 1, r: 6 },
      { q: 2, r: 6 },
    ]);

    expect(shortestReconsiderationPresentationPath(state, mover.id, replacement.path ?? [])).toEqual([
      { q: 1, r: 6 },
      { q: 2, r: 6 },
    ]);
  });

  it('keeps reconsideration preview arrows rooted at the original move origin', () => {
    const state = createGameState(fixedRandom);
    const mover = moverAt({ q: 0, r: 6 });
    state.units = [mover];

    expect(moveUnit(state, mover.id, { q: 1, r: 6 }).ok).toBe(true);
    expect(reconsiderationPreviewCoordPaths(state, mover.id).get('2,6')).toEqual([
      { q: 0, r: 6 },
      { q: 1, r: 6 },
      { q: 2, r: 6 },
    ]);
  });
});
