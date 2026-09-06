import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  coordKey,
  createGameState,
  curseUnit,
  getAttackTargets,
  getCurseTargets,
  getInvokeDestinations,
  getThunderChainCoords,
  getThunderTargetCoords,
  hasActiveCurseFrom,
  moveUnit,
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
  hp: definitionId === 'commander' ? 10 : UNIT_DEFINITIONS[definitionId].maxHp,
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

describe('Necromancer restrictions', () => {
  it('raises its Necromancy skeleton Exhausted at exactly 1 HP', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const necromancer = makeUnit('necro', 'necromancer', 2, { q: 4, r: 6 });
    const victim = makeUnit('victim', 'longbowRanger', 1, { q: 6, r: 6 }, { hp: 1 });
    state.units = [necromancer, victim];

    expect(attackUnit(state, necromancer.id, victim.id).ok).toBe(true);
    const raised = state.units.find((unit) => unit.definitionId === 'skeletalInfantry');
    expect(raised).toMatchObject({
      owner: 2,
      hp: 1,
      exhausted: true,
      coord: { q: 6, r: 6 },
    });
    expect(UNIT_DEFINITIONS.skeletalInfantry.maxHp).toBe(2);
  });

  it('cannot make its normal ranged attack after moving', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const necromancer = makeUnit('necro', 'necromancer', 2, { q: 3, r: 10 });
    const target = makeUnit('target', 'royalGuard', 1, { q: 5, r: 8 });
    state.units = [necromancer, target];

    expect(moveUnit(state, necromancer.id, { q: 4, r: 9 }).ok).toBe(true);
    expect(necromancer.movementSpent).toBeGreaterThan(0);
    expect(getAttackTargets(state, necromancer.id)).toEqual([]);
  });

  it('allows only one active Curse per individual Necromancer', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const firstNecro = makeUnit('necro-a', 'necromancer', 2, { q: 4, r: 6 });
    const secondNecro = makeUnit('necro-b', 'necromancer', 2, { q: 4, r: 7 });
    const firstTarget = makeUnit('target-a', 'royalGuard', 1, { q: 6, r: 6 });
    const secondTarget = makeUnit('target-b', 'royalGuard', 1, { q: 6, r: 7 });
    state.units = [firstNecro, secondNecro, firstTarget, secondTarget];

    expect(curseUnit(state, firstNecro.id, firstTarget.id).ok).toBe(true);
    expect(firstTarget.curses?.[0]).toMatchObject({
      sourcePlayer: 2,
      sourceUnitId: firstNecro.id,
      remainingTurns: 3,
    });
    expect(hasActiveCurseFrom(state, firstNecro.id)).toBe(true);
    expect(getCurseTargets(state, firstNecro.id)).toEqual([]);
    expect(curseUnit(state, firstNecro.id, secondTarget.id).ok).toBe(false);

    expect(hasActiveCurseFrom(state, secondNecro.id)).toBe(false);
    expect(getCurseTargets(state, secondNecro.id).length).toBeGreaterThan(0);
  });
});

describe('Thunder Mage limits and chain Thunder', () => {
  it('blocks Invoke Beast while that Mage already has a living Beast', () => {
    const state = freshState();
    state.currentPlayer = 1;
    const mage = makeUnit('mage', 'lightMage', 1, { q: 4, r: 6 }, { invokedPetId: 'beast' });
    const beast = makeUnit('beast', 'invokedBeast', 1, { q: 5, r: 6 });
    state.units = [mage, beast];

    expect(getInvokeDestinations(state, mage.id)).toEqual([]);
  });

  it('targets only enemies in initial Range, then chains recursively through the connected enemy cluster', () => {
    const state = freshState();
    state.currentPlayer = 1;
    const mage = makeUnit('mage', 'lightMage', 1, { q: 4, r: 6 });
    const first = makeUnit('enemy-1', 'graveKnight', 2, { q: 6, r: 6 });
    const second = makeUnit('enemy-2', 'graveKnight', 2, { q: 7, r: 6 });
    const third = makeUnit('enemy-3', 'graveKnight', 2, { q: 8, r: 6 });
    const disconnected = makeUnit('enemy-far', 'graveKnight', 2, { q: 11, r: 6 });
    const friendly = makeUnit('friendly', 'royalGuard', 1, { q: 7, r: 5 });
    state.units = [mage, first, second, third, disconnected, friendly];

    const initialTargets = new Set(getThunderTargetCoords(state, mage.id).map(coordKey));
    expect(initialTargets).toEqual(new Set([coordKey(first.coord)]));

    const chain = getThunderChainCoords(state, mage.id, first.coord);
    expect(chain.map(coordKey)).toEqual([
      coordKey(first.coord),
      coordKey(second.coord),
      coordKey(third.coord),
    ]);

    const result = thunderAtCoord(state, mage.id, first.coord);
    expect(result.ok).toBe(true);
    expect(first.hp).toBe(4);
    expect(second.hp).toBe(4);
    expect(third.hp).toBe(4);
    expect(disconnected.hp).toBe(5);
    expect(friendly.hp).toBe(3);
    expect(mage.attacked).toBe(true);
  });
});
