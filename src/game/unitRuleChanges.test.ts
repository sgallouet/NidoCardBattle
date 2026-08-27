import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  createGameState,
  getInvokeDestinations,
  invokeBeast,
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

describe('UnitRule regressions', () => {
  it('enforces UNT10 for a ranged primary attack', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'longbowRanger', 1, { q: 3, r: 6 });
    const assister = makeUnit('assister', 'royalGuard', 1, { q: 5, r: 5 });
    const defender = makeUnit('defender', 'necromancer', 2, { q: 5, r: 6 });
    state.units = [attacker, assister, defender];

    expect(attackUnit(state, attacker.id, defender.id).ok).toBe(true);
    expect(defender.hp).toBe(3);
  });

  it('enforces UNT3 per Invoker and reopens Invoke after its Beast is removed', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const invoker = makeUnit('invoker', 'necromancer', 2, { q: 4, r: 6 });
    state.units = [invoker];
    const firstDestination = getInvokeDestinations(state, invoker.id)[0];

    const first = invokeBeast(state, invoker.id, firstDestination);
    expect(first.ok).toBe(true);
    expect(invoker.invokedPetId).toBe(first.summonedUnitId);

    invoker.attacked = false;
    expect(getInvokeDestinations(state, invoker.id)).toEqual([]);
    expect(invokeBeast(state, invoker.id, { q: 4, r: 5 })).toMatchObject({
      ok: false,
      message: 'This Invoker already has a living Invoked Beast.',
    });

    state.units = state.units.filter((unit) => unit.id !== first.summonedUnitId);
    expect(getInvokeDestinations(state, invoker.id).length).toBeGreaterThan(0);
  });
});
