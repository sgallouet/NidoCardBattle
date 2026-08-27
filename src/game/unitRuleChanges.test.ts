import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  createGameState,
  getInvokeDestinations,
  getThunderTargetCoords,
  invokeBeast,
  thunderAtCoord,
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

  it('makes UNB6 Thunder damage its target hex and every adjacent unit, including allies and the caster', () => {
    const state = freshState();
    const mage = makeUnit('mage', 'lightMage', 1, { q: 5, r: 6 });
    const enemyCenter = makeUnit('enemy-center', 'necromancer', 2, { q: 6, r: 6 });
    const enemyAdjacent = makeUnit('enemy-adjacent', 'vampire', 2, { q: 6, r: 5 });
    const allyAdjacent = makeUnit('ally-adjacent', 'royalGuard', 1, { q: 7, r: 6 });
    const outside = makeUnit('outside', 'graveKnight', 2, { q: 9, r: 6 });
    state.units = [mage, enemyCenter, enemyAdjacent, allyAdjacent, outside];

    const target = { q: 6, r: 6 };
    expect(getThunderTargetCoords(state, mage.id)).toContainEqual(target);
    expect(thunderAtCoord(state, mage.id, target).ok).toBe(true);

    expect(mage.hp).toBe(2);
    expect(enemyCenter.hp).toBe(3);
    expect(enemyAdjacent.hp).toBe(3);
    expect(allyAdjacent.hp).toBe(2);
    expect(outside.hp).toBe(5);
    expect(mage.attacked).toBe(true);
  });
});
