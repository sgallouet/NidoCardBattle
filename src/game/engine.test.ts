import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_SITES, MAP_WIDTH, STARTING_UNITS, TERRAIN } from '../data/map';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  coordKey,
  createGameState,
  endTurn,
  getReachableCoords,
  getValidSummonCoords,
  isPassable,
  playUnitCard,
  terrainAt,
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

describe('MPS2, MPL4, MPT6', () => {
  it('MPS2', () => {
    expect(MAP_WIDTH).toBe(18);
    expect(MAP_HEIGHT).toBe(13);
    expect(TERRAIN.flat()).toHaveLength(234);
  });

  it('MPL1, MPL2, MPL3', () => {
    expect(MAP_SITES.filter((site) => site.type === 'keep')).toHaveLength(2);
    expect(MAP_SITES.filter((site) => site.type === 'fort')).toHaveLength(2);
    expect(MAP_SITES.filter((site) => site.type === 'well')).toHaveLength(4);
    for (const site of MAP_SITES) expect(isPassable(site.coord)).toBe(true);
    for (const unit of STARTING_UNITS) expect(isPassable(unit.coord)).toBe(true);
  });

  it('MPT6', () => {
    expect(terrainAt({ q: 8, r: 4 })).toBe('bridge');
    expect(isPassable({ q: 8, r: 4 })).toBe(true);
    expect(isPassable({ q: 8, r: 3 })).toBe(false);
  });

  it('MPT5, MPT6', () => {
    for (const row of TERRAIN) {
      expect(row.some((terrain) => terrain === 'water' || terrain === 'bridge')).toBe(true);
    }
  });

  it('MPL4', () => {
    const northernFort = MAP_SITES.find((site) => site.id === 'fort-north');
    const southernFort = MAP_SITES.find((site) => site.id === 'fort-south');
    expect(northernFort).toBeDefined();
    expect(southernFort).toBeDefined();
    expect(southernFort?.coord).not.toEqual({
      q: MAP_WIDTH - 1 - northernFort!.coord.q,
      r: MAP_HEIGHT - 1 - northernFort!.coord.r,
    });
  });
});

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
