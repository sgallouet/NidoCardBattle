import { expect, it } from 'vitest';
import type { Coord, GameState, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { createGameState, getMovementPreviewPaths, getReachableCoords, moveUnit } from './engine';

const simulatedPaths = (state: GameState, id: string): Map<string, Coord[]> => {
  const paths = new Map<string, Coord[]>();
  for (const key of getReachableCoords(state, id).keys()) {
    const [q, r] = key.split(',').map(Number);
    const result = moveUnit(structuredClone(state), id, { q, r });
    if (result.ok && result.path) paths.set(key, result.path);
  }
  return paths;
};

it('matches simulated paths without mutation across the roster and UNA1/UNA3/UNT6/UNC4 states', () => {
  for (const definitionId of Object.keys(UNIT_DEFINITIONS) as UnitDefinitionId[]) {
    for (const coord of [{ q: 0, r: 6 }, { q: 8, r: 6 }, { q: 14, r: 8 }]) {
      for (const flags of [{}, { exhausted: true }, { attacked: true },
        { attacked: true, postAttackMoved: true, pendingAdvance: { q: coord.q + 1, r: coord.r } }]) {
        const state = createGameState(() => 0.25);
        const unit: UnitState = {
          id: 'preview', definitionId, owner: 1, coord: { ...coord },
          hp: UNIT_DEFINITIONS[definitionId].maxHp, exhausted: false,
          moved: false, attacked: false, ...flags,
        };
        state.units.push(unit);
        const check = (): void => {
          const before = structuredClone(state);
          expect(getMovementPreviewPaths(state, unit.id)).toEqual(simulatedPaths(state, unit.id));
          expect(state).toEqual(before);
        };
        check();
        const first = getMovementPreviewPaths(state, unit.id).values().next().value;
        if (first) {
          moveUnit(state, unit.id, first.at(-1)!);
          check();
        }
        state.winner = 1;
        check();
      }
    }
  }
  expect(getMovementPreviewPaths(createGameState(() => 0.25), 'missing').size).toBe(0);
});
