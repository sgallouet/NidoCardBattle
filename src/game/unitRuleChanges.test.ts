import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  createGameState,
  endTurn,
  getAttackTargets,
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

  it('enforces UNT3 on Thunder Mage and reopens Invoke after its Beast is removed', () => {
    const state = freshState();
    state.currentPlayer = 1;
    const invoker = makeUnit('invoker', 'lightMage', 1, { q: 4, r: 6 });
    state.units = [invoker];
    const firstDestination = getInvokeDestinations(state, invoker.id)[0];

    const first = invokeBeast(state, invoker.id, firstDestination);
    expect(first.ok).toBe(true);
    expect(invoker.invokedPetId).toBe(first.summonedUnitId);
    expect(state.units.find((unit) => unit.id === first.summonedUnitId)?.owner).toBe(1);

    invoker.attacked = false;
    expect(getInvokeDestinations(state, invoker.id)).toEqual([]);
    expect(invokeBeast(state, invoker.id, { q: 4, r: 5 })).toMatchObject({
      ok: false,
      message: 'This Invoker already has a living Invoked Beast.',
    });

    state.units = state.units.filter((unit) => unit.id !== first.summonedUnitId);
    expect(getInvokeDestinations(state, invoker.id).length).toBeGreaterThan(0);
  });

  it('does not let Necromancer invoke a Beast anymore', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const necromancer = makeUnit('necromancer', 'necromancer', 2, { q: 4, r: 6 });
    state.units = [necromancer];

    expect(getInvokeDestinations(state, necromancer.id)).toEqual([]);
  });

  it('enforces HUR5', () => {
    const state = freshState();
    const mage = makeUnit('mage', 'lightMage', 1, { q: 4, r: 6 });
    const enemy = makeUnit('enemy', 'skeletalInfantry', 2, { q: 5, r: 6 });
    state.units = [mage, enemy];

    expect(getAttackTargets(state, mage.id)).toEqual([]);
    expect(getThunderTargetCoords(state, mage.id).length).toBeGreaterThan(0);
    expect(getInvokeDestinations(state, mage.id).length).toBeGreaterThan(0);
  });

  it('enforces UNC4', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'royalGuard', 1, { q: 4, r: 6 });
    const defender = makeUnit('defender', 'skeletalInfantry', 2, { q: 5, r: 6 }, { hp: 1 });
    state.units = [attacker, defender];

    const result = attackUnit(state, attacker.id, defender.id);

    expect(result.path).toEqual([{ q: 4, r: 6 }, { q: 5, r: 6 }]);
    expect(attacker.coord).toEqual({ q: 5, r: 6 });
  });

  it('enforces UNC4 with CRC4', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'royalGuard', 1, { q: 4, r: 6 });
    const defender = makeUnit('defender', 'skeletalInfantry', 2, { q: 5, r: 6 }, { hp: 1 });
    state.units = [attacker, defender];
    state.tileEffects.push({
      kind: 'graveLock',
      coord: { ...defender.coord },
      sourcePlayer: 2,
      expiresAtTurn: state.turnNumber + 1,
    });

    const result = attackUnit(state, attacker.id, defender.id);

    expect(result.path).toBeUndefined();
    expect(attacker.coord).toEqual({ q: 4, r: 6 });
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

  it('heals every adjacent ally by 1 at the start of the Banner Captain owner turn', () => {
    const state = freshState();
    state.currentPlayer = 2;
    state.turnNumber = 2;
    const banner = makeUnit('banner', 'bannerCaptain', 1, { q: 5, r: 6 }, { hp: 2 });
    const adjacentA = makeUnit('adjacent-a', 'royalGuard', 1, { q: 6, r: 6 }, { hp: 1 });
    const adjacentB = makeUnit('adjacent-b', 'lightMage', 1, { q: 5, r: 5 }, { hp: 2 });
    const enemy = makeUnit('enemy', 'skeletalInfantry', 2, { q: 4, r: 6 }, { hp: 1 });
    const distant = makeUnit('distant', 'silverwingCavalry', 1, { q: 9, r: 6 }, { hp: 3 });
    state.units = [banner, adjacentA, adjacentB, enemy, distant];

    expect(endTurn(state, fixedRandom).ok).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(banner.hp).toBe(2);
    expect(adjacentA.hp).toBe(2);
    expect(adjacentB.hp).toBe(3);
    expect(enemy.hp).toBe(1);
    expect(distant.hp).toBe(3);
  });
});
