import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  createGameState,
  getReachableCoords,
  moveUnit,
} from './engine';

const fixedRandom = () => 0.25;

const makeUnit = (
  id: string,
  definitionId: UnitDefinitionId,
  owner: PlayerId,
  coord: Coord,
  overrides: Partial<UnitState> = {},
): UnitState => ({
  id,
  definitionId,
  owner,
  coord,
  hp: UNIT_DEFINITIONS[definitionId].maxHp,
  exhausted: false,
  moved: false,
  attacked: false,
  movementSpent: 0,
  postAttackMoved: false,
  moveBonus: 0,
  curses: [],
  ...overrides,
});

const freshState = (): GameState => createGameState(fixedRandom);

describe('pre-action movement reconsideration', () => {
  it('keeps the original movement footprint available after the first move', () => {
    const state = freshState();
    const guard = makeUnit('guard', 'royalGuard', 1, { q: 0, r: 6 });
    state.units = [guard];

    const first = moveUnit(state, guard.id, { q: 2, r: 6 });
    expect(first.ok).toBe(true);
    expect(guard.movementOrigin).toEqual({ q: 0, r: 6 });
    expect(guard.movementSpent).toBe(2);

    const alternatives = getReachableCoords(state, guard.id);
    expect(alternatives.has('0,6')).toBe(true);
    expect(alternatives.has('0,4')).toBe(true);

    const reconsidered = moveUnit(state, guard.id, { q: 0, r: 4 });
    expect(reconsidered.ok).toBe(true);
    expect(reconsidered.path?.[0]).toEqual({ q: 2, r: 6 });
    expect(reconsidered.path).toContainEqual({ q: 0, r: 6 });
    expect(reconsidered.path?.at(-1)).toEqual({ q: 0, r: 4 });
    expect(guard.coord).toEqual({ q: 0, r: 4 });
    expect(guard.movementSpent).toBe(2);
    expect(guard.movementOrigin).toEqual({ q: 0, r: 6 });
  });

  it('lets the unit fully undo its movement before acting', () => {
    const state = freshState();
    const guard = makeUnit('guard', 'royalGuard', 1, { q: 0, r: 6 });
    state.units = [guard];

    expect(moveUnit(state, guard.id, { q: 2, r: 6 }).ok).toBe(true);
    expect(moveUnit(state, guard.id, { q: 0, r: 6 }).ok).toBe(true);

    expect(guard.coord).toEqual({ q: 0, r: 6 });
    expect(guard.moved).toBe(false);
    expect(guard.movementSpent).toBe(0);
    expect(guard.movementOrigin).toBeUndefined();
  });

  it('locks reconsideration once the unit attacks', () => {
    const state = freshState();
    const guard = makeUnit('guard', 'royalGuard', 1, { q: 0, r: 6 });
    const enemy = makeUnit('enemy', 'vampire', 2, { q: 1, r: 4 });
    const enemyCommander = makeUnit('enemy-commander', 'commander', 2, { q: 15, r: 4 });
    state.units = [guard, enemy, enemyCommander];

    expect(moveUnit(state, guard.id, { q: 0, r: 4 }).ok).toBe(true);
    expect(attackUnit(state, guard.id, enemy.id).ok).toBe(true);
    expect(guard.attacked).toBe(true);
    expect(getReachableCoords(state, guard.id).size).toBe(0);
  });
});
