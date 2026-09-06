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
  getReachableCoords,
  moveUnit,
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
  it('allows allied pass-through without allowing movement to end on the allied unit', () => {
    const state = freshState();
    const mover = makeUnit('mover', 'royalGuard', 1, { q: 0, r: 6 });
    const ally = makeUnit('ally', 'longbowRanger', 1, { q: 1, r: 6 });
    state.units = [mover, ally];

    const reachable = getReachableCoords(state, mover.id);
    expect(reachable.has('1,6')).toBe(false);
    expect(reachable.get('2,6')).toBe(2);
    expect(moveUnit(state, mover.id, ally.coord).ok).toBe(false);
    expect(moveUnit(state, mover.id, { q: 2, r: 6 })).toMatchObject({
      ok: true,
      path: [{ q: 0, r: 6 }, { q: 1, r: 6 }, { q: 2, r: 6 }],
    });
  });

  it('still prevents movement through enemy-occupied hexes', () => {
    const state = freshState();
    const mover = makeUnit('mover', 'royalGuard', 1, { q: 0, r: 6 });
    const enemy = makeUnit('enemy', 'vampire', 2, { q: 1, r: 6 });
    state.units = [mover, enemy];

    expect(getReachableCoords(state, mover.id).has('2,6')).toBe(false);
    expect(moveUnit(state, mover.id, { q: 2, r: 6 }).ok).toBe(false);
  });

  it('gives Silverwing Cavalry Move 3 before its attack and a fresh Move 3 after it', () => {
    const state = freshState();
    const griffin = makeUnit('griffin', 'silverwingCavalry', 1, { q: 0, r: 6 });
    const defender = makeUnit('defender', 'vampire', 2, { q: 4, r: 6 });
    const survivingEnemy = makeUnit('enemy-commander', 'commander', 2, { q: 15, r: 4 });
    state.units = [griffin, defender, survivingEnemy];

    expect(UNIT_DEFINITIONS.silverwingCavalry.move).toBe(3);
    expect(moveUnit(state, griffin.id, { q: 3, r: 6 })).toMatchObject({
      ok: true,
      path: [{ q: 0, r: 6 }, { q: 1, r: 6 }, { q: 2, r: 6 }, { q: 3, r: 6 }],
    });
    expect(griffin.movementSpent).toBe(3);
    expect(attackUnit(state, griffin.id, defender.id).ok).toBe(true);
    expect(findUnitForTest(state, defender.id)).toBeUndefined();

    const postAttackReach = getReachableCoords(state, griffin.id);
    expect(postAttackReach.get('0,6')).toBe(3);
    expect(moveUnit(state, griffin.id, { q: 0, r: 6 }).ok).toBe(true);
    expect(griffin.postAttackMoved).toBe(true);
    expect(griffin.movementSpent).toBe(6);
  });

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
    const attacker = makeUnit('attacker', 'royalGuard', 1, { q: 8, r: 4 }, { moved: true, movementSpent: 2 });
    const defender = makeUnit('defender', 'skeletalInfantry', 2, { q: 9, r: 4 }, { hp: 1 });
    state.units = [attacker, defender, makeUnit('remaining', 'commander', 2, { q: 15, r: 4 })];

    const result = attackUnit(state, attacker.id, defender.id);

    expect(result.path).toBeUndefined();
    expect(attacker.coord).toEqual({ q: 8, r: 4 });
    expect([...getReachableCoords(state, attacker.id)]).toEqual([['9,4', 0]]);
    expect(moveUnit(state, attacker.id, { q: 8, r: 3 }).ok).toBe(false);
    expect(moveUnit(state, attacker.id, defender.coord)).toMatchObject({ ok: true, path: [{ q: 8, r: 4 }, { q: 9, r: 4 }] });
    expect(attacker.coord).toEqual(defender.coord);
    expect(attacker.movementSpent).toBe(2);
    expect(attacker.pendingAdvance).toBeUndefined();
    expect(getReachableCoords(state, attacker.id).size).toBe(0);
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

const findUnitForTest = (state: GameState, id: string): UnitState | undefined =>
  state.units.find((unit) => unit.id === id);
