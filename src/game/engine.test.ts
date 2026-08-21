import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  coordKey,
  createGameState,
  endTurn,
  getReachableCoords,
  getValidSummonCoords,
  playUnitCard,
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
  ...overrides,
});

const freshState = (): GameState => createGameState(fixedRandom);

describe('UNT1, UNM4', () => {
  it('UNT1', () => {
    const state = freshState();
    const mover = makeUnit('mover', 'vampire', 1, { q: 0, r: 0 });
    state.units = [mover, makeUnit('blocker', 'skeletonGuard', 2, { q: 2, r: 0 })];
    const blocked = getReachableCoords(state, mover.id);
    expect(blocked.has(coordKey({ q: 1, r: 0 }))).toBe(true);
    expect(blocked.has(coordKey({ q: 2, r: 1 }))).toBe(false);

    state.units[1] = makeUnit('non-blocker', 'boneArcher', 2, { q: 2, r: 0 });
    const open = getReachableCoords(state, mover.id);
    expect(open.has(coordKey({ q: 2, r: 1 }))).toBe(true);
  });

  it('UNB4', () => {
    const state = freshState();
    const mover = makeUnit('mover', 'wraith', 1, { q: 0, r: 0 });
    state.units = [mover, makeUnit('blocker', 'skeletonGuard', 2, { q: 2, r: 0 })];
    expect(getReachableCoords(state, mover.id).has(coordKey({ q: 2, r: 1 }))).toBe(true);
  });
});

describe('UNT2, UNC3', () => {
  it('UNT2', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'ghoul', 1, { q: 2, r: 2 });
    const defender = makeUnit('defender', 'skeletonGuard', 2, { q: 3, r: 2 });
    state.units = [attacker, defender];
    attackUnit(state, attacker.id, defender.id);
    expect(defender.hp).toBe(2);
    expect(attacker.hp).toBe(5);
    expect(defender.attacked).toBe(false);
  });

  it('UNT2-only', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'skeletonGuard', 1, { q: 2, r: 2 });
    const defender = makeUnit('defender', 'boneArcher', 2, { q: 3, r: 2 });
    state.units = [attacker, defender];
    attackUnit(state, attacker.id, defender.id);
    expect(attacker.hp).toBe(UNIT_DEFINITIONS.skeletonGuard.maxHp);
  });
});

describe('MPC1, MPC2', () => {
  it('MPC1', () => {
    const state = freshState();
    const well = state.sites.find((site) => site.id === 'well-northwest');
    expect(well).toBeDefined();
    state.units = [makeUnit('capturer', 'wraith', 1, { ...well!.coord })];
    expect(well!.owner).toBe(null);
    endTurn(state, fixedRandom);
    expect(well!.owner).toBe(1);
  });
});

describe('CRU3, UNT3', () => {
  it('UNT3', () => {
    const state = freshState();
    for (const site of state.sites) {
      if (site.type === 'keep' || site.type === 'fort') site.owner = 2;
    }
    state.units = [makeUnit('invoker', 'necromancer', 1, { q: 5, r: 4 })];
    const target = { q: 6, r: 4 };
    expect(getValidSummonCoords(state).some((coord) => coordKey(coord) === coordKey(target))).toBe(true);

    state.players[1].hand = ['skeletonGuard'];
    state.players[1].mana = 3;
    const result = playUnitCard(state, 0, target);
    expect(result.ok).toBe(true);
    expect(state.units.find((unit) => unit.coord.q === target.q && unit.coord.r === target.r)?.exhausted).toBe(true);
  });
});

describe('GRV1, GRV2', () => {
  it('GRV2', () => {
    const state = freshState();
    state.countdown = { player: 1, checkpoints: 0 };

    endTurn(state, fixedRandom);
    expect(state.countdown?.checkpoints).toBe(1);
    expect(state.winner).toBe(null);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.countdown?.checkpoints).toBe(2);
    expect(state.winner).toBe(null);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.winner).toBe(1);
  });
});
