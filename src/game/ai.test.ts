import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  buildThreatMap,
  generateLegalAiActions,
  planSmartAiTurn,
  runSmartAiTurn,
} from './ai';
import { coordKey, createGameState, endTurn } from './engine';

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

const minimalAiTurnState = (): GameState => {
  const state = createGameState(fixedRandom);
  state.currentPlayer = 2;
  state.players[2].hand = [];
  state.players[2].deck = [];
  state.players[2].discard = [];
  state.players[2].mana = 0;
  state.sites = [];
  state.units = [
    makeUnit('human-commander', 'commander', 1, { q: 2, r: 9 }),
    makeUnit('undead-commander', 'commander', 2, { q: 15, r: 3 }),
  ];
  return state;
};

describe('smart enemy AI', () => {
  it('takes Player 2 turn and returns control to Player 1', () => {
    const state = minimalAiTurnState();

    const result = runSmartAiTurn(state, fixedRandom);

    expect(result.endedTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.winner).toBe(null);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.searchedStates).toBeGreaterThan(0);
  });

  it('prioritizes and kills an adjacent Human Commander', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 4, r: 4 }, { hp: 1 }),
      makeUnit('undead-attacker', 'skeletonGuard', 2, { q: 3, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
    ];

    runSmartAiTurn(state, fixedRandom);

    expect(state.units.some((unit) => unit.id === 'human-commander')).toBe(false);
    expect(state.countdown?.player).toBe(2);
    expect(state.countdown?.checkpoints).toBe(1);
    expect(state.currentPlayer).toBe(1);
  });

  it('can finish the final Commander survival checkpoint and win', () => {
    const state = minimalAiTurnState();
    state.units = [makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 })];
    state.countdown = { player: 2, checkpoints: 2 };

    const result = runSmartAiTurn(state, fixedRandom);

    expect(result.endedTurn).toBe(true);
    expect(state.winner).toBe(2);
    expect(state.countdown?.checkpoints).toBe(3);
  });

  it('builds a next-turn threat map from movement plus attack range', () => {
    const state = minimalAiTurnState();
    state.units.push(makeUnit('human-ranger', 'boneArcher', 1, { q: 9, r: 6 }));
    const threatened = { q: 13, r: 6 };

    const threatMap = buildThreatMap(state, 1);

    expect(threatMap.get(coordKey(threatened))).toBeGreaterThan(0);
  });

  it('searches a complete move then attack sequence to kill the Commander', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 5, r: 4 }, { hp: 2 }),
      makeUnit('undead-attacker', 'skeletonGuard', 2, { q: 2, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const plan = planSmartAiTurn(state, { beamWidth: 12, maxDepth: 4 });

    expect(plan.actions.some((action) => action.kind === 'move' && action.unitId === 'undead-attacker')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'attack' && action.targetId === 'human-commander')).toBe(true);
    expect(plan.searchedStates).toBeGreaterThan(1);
  });

  it('includes Banshee Displace combinations in its legal action search', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 8, r: 5 }),
      makeUnit('human-guard', 'ghoul', 1, { q: 7, r: 5 }),
      makeUnit('undead-banshee', 'banshee', 2, { q: 6, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const actions = generateLegalAiActions(state);

    expect(actions.some((action) => action.kind === 'displace' && action.targetId === 'human-guard')).toBe(true);
  });

  it('still works after a normal Human end-turn transition', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.currentPlayer).toBe(2);

    const plan = planSmartAiTurn(state, { beamWidth: 4, maxDepth: 2 });

    expect(plan.searchedStates).toBeGreaterThan(0);
    expect(Number.isFinite(plan.score)).toBe(true);
  });
});
