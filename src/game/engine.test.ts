import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_SITES, MAP_WIDTH, STARTING_UNITS, TERRAIN } from '../data/map';
import { CARD_DEFINITIONS, PROTOTYPE_DECK } from '../data/cards';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  coordKey,
  createGameState,
  endTurn,
  getReachableCoords,
  getRestoreTargets,
  getValidSummonCoords,
  isPassable,
  isStoppedByBlocking,
  moveUnit,
  playUnitCard,
  restoreAdjacentAlly,
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

describe('UNR1-UNR8, CRD1, CRD2', () => {
  it('UNR1-UNR8', () => {
    const expected = {
      skeletonGuard: { name: 'Skeletal Infantry', cost: 1, maxHp: 2, attack: 2, traits: ['Blocking'], ability: undefined },
      boneArcher: { name: 'Longbow Ranger', cost: 3, maxHp: 2, attack: 2, traits: ['Ranged'], ability: undefined },
      vampire: { name: 'Silverwing Cavalry', cost: 6, maxHp: 5, attack: 4, traits: ['Flying', 'Charge'], ability: undefined },
      necromancer: { name: 'Necromancer', cost: 5, maxHp: 4, attack: 1, traits: ['Invoker'], ability: undefined },
      banshee: { name: 'Banshee Displacer', cost: 4, maxHp: 3, attack: 2, traits: [], ability: 'Displace' },
      wraith: { name: 'Light Mage', cost: 4, maxHp: 3, attack: 2, traits: [], ability: 'Restore' },
      ghoul: { name: 'Royal Guard', cost: 2, maxHp: 3, attack: 2, traits: ['Blocking', 'Retaliates'], ability: undefined },
      graveKnight: { name: 'Grave Knight', cost: 5, maxHp: 4, attack: 4, traits: ['Blocking', 'Retaliates'], ability: undefined },
    } as const;

    for (const [id, printed] of Object.entries(expected)) {
      const definition = UNIT_DEFINITIONS[id as UnitDefinitionId];
      const card = CARD_DEFINITIONS[id as keyof typeof CARD_DEFINITIONS];
      expect({
        name: definition.name,
        cost: definition.cost,
        maxHp: definition.maxHp,
        attack: definition.attack,
        traits: definition.traits,
        ability: definition.ability,
      }).toEqual(printed);
      expect([card.name, card.cost]).toEqual([printed.name, printed.cost]);
    }
  });

  it('CRD1, CRD2', () => {
    expect(PROTOTYPE_DECK).toHaveLength(16);
    for (const cardId of new Set(PROTOTYPE_DECK)) {
      expect(PROTOTYPE_DECK.filter((candidate) => candidate === cardId)).toHaveLength(2);
    }
  });
});

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

describe('UNT1, UNM4, UNT5', () => {
  it('UNT1', () => {
    const state = freshState();
    const mover = makeUnit('mover', 'banshee', 1, { q: 0, r: 8 });
    state.units = [mover, makeUnit('blocker', 'skeletonGuard', 2, { q: 2, r: 8 })];
    expect(isStoppedByBlocking(state, mover, { q: 1, r: 8 })).toBe(true);

    state.units[1] = makeUnit('non-blocker', 'boneArcher', 2, { q: 2, r: 8 });
    expect(isStoppedByBlocking(state, mover, { q: 1, r: 8 })).toBe(false);
  });

  it('UNT5', () => {
    const state = freshState();
    const flyer = makeUnit('flyer', 'vampire', 1, { q: 8, r: 4 });
    state.units = [flyer];
    expect(terrainAt({ q: 8, r: 3 })).toBe('water');
    expect(getReachableCoords(state, flyer.id).has(coordKey({ q: 8, r: 3 }))).toBe(true);
  });

  it('returns the exact authoritative path used by movement', () => {
    const state = freshState();
    const mover = makeUnit('mover', 'skeletonGuard', 1, { q: 2, r: 7 });
    state.units = [mover];
    const destination = { q: 4, r: 7 };

    const result = moveUnit(state, mover.id, destination);

    expect(result.ok).toBe(true);
    expect(result.path?.[0]).toEqual({ q: 2, r: 7 });
    expect(result.path?.at(-1)).toEqual(destination);
    expect(result.path?.length).toBeGreaterThan(1);
    expect(mover.coord).toEqual(destination);
  });
});

describe('UNT2, UNC3', () => {
  it('UNT2', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'necromancer', 1, { q: 2, r: 2 });
    const defender = makeUnit('defender', 'ghoul', 2, { q: 3, r: 2 });
    state.units = [attacker, defender];
    attackUnit(state, attacker.id, defender.id);
    expect(defender.hp).toBe(2);
    expect(attacker.hp).toBe(2);
    expect(defender.attacked).toBe(false);
  });

  it('UNT2, UNC3', () => {
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

  it('CRU4, UNT6', () => {
    const state = freshState();
    state.players[1].hand = ['vampire'];
    state.players[1].mana = 6;
    const target = getValidSummonCoords(state)[0];
    const result = playUnitCard(state, 0, target);
    expect(result.ok).toBe(true);
    expect(state.units.find((unit) => unit.id === result.summonedUnitId)?.exhausted).toBe(false);
  });
});

describe('UNB6', () => {
  it('UNB6', () => {
    const state = freshState();
    const mage = makeUnit('mage', 'wraith', 1, { q: 5, r: 4 });
    const ally = makeUnit('ally', 'ghoul', 1, { q: 6, r: 4 }, { hp: 1 });
    state.units = [mage, ally];
    expect(getRestoreTargets(state, mage.id).map((unit) => unit.id)).toEqual([ally.id]);
    expect(restoreAdjacentAlly(state, mage.id, ally.id).ok).toBe(true);
    expect(ally.hp).toBe(3);
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
