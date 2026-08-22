import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  COMMON_AI_OPTIONS,
  buildThreatMap,
  generateLegalAiActions,
  getBrowserAiSearchOptions,
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

const deterministicSearch = {
  beamWidth: 4,
  maxDepth: 3,
  maxNodes: 700,
  maxPlanningMs: 5_000,
  candidatePlans: 2,
  responseBeamWidth: 2,
  responseDepth: 2,
  responseMaxNodes: 120,
} as const;

describe('smart enemy AI', () => {
  it('takes Player 2 turn and returns control to Player 1', () => {
    const state = minimalAiTurnState();

    const result = runSmartAiTurn(state, fixedRandom, deterministicSearch);

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
      makeUnit('undead-attacker', 'skeletalInfantry', 2, { q: 3, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
    ];

    runSmartAiTurn(state, fixedRandom, deterministicSearch);

    expect(state.units.some((unit) => unit.id === 'human-commander')).toBe(false);
    expect(state.countdown?.player).toBe(2);
    expect(state.countdown?.checkpoints).toBe(1);
    expect(state.currentPlayer).toBe(1);
  });

  it('can finish the final Commander survival checkpoint and win', () => {
    const state = minimalAiTurnState();
    state.units = [makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 })];
    state.countdown = { player: 2, checkpoints: 2 };

    const result = runSmartAiTurn(state, fixedRandom, deterministicSearch);

    expect(result.endedTurn).toBe(true);
    expect(state.winner).toBe(2);
    expect(state.countdown?.checkpoints).toBe(3);
  });

  it('builds a next-turn threat map from movement plus attack range', () => {
    const state = minimalAiTurnState();
    state.units.push(makeUnit('human-ranger', 'longbowRanger', 1, { q: 9, r: 6 }));
    const threatened = { q: 13, r: 6 };

    const threatMap = buildThreatMap(state, 1);

    expect(threatMap.get(coordKey(threatened))).toBeGreaterThan(0);
  });

  it('searches a complete move then attack sequence to kill the Commander', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 4, r: 4 }, { hp: 2 }),
      makeUnit('undead-attacker', 'skeletalInfantry', 2, { q: 2, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const plan = planSmartAiTurn(state, { ...deterministicSearch, beamWidth: 12, maxDepth: 4 });

    expect(plan.actions.some((action) => action.kind === 'move' && action.unitId === 'undead-attacker')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'attack' && action.targetId === 'human-commander')).toBe(true);
    expect(plan.searchedStates).toBeGreaterThan(1);
  });

  it('advances units instead of spending its whole opening turn on summons', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);

    const plan = planSmartAiTurn(state, { ...deterministicSearch, maxDepth: 5 });

    expect(plan.actions.some((action) => action.kind === 'move' || action.kind === 'attack')).toBe(true);
    expect(plan.actions.every((action) => action.kind === 'summon')).toBe(false);
  });

  it('includes Banshee Displace combinations in its legal action search', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 8, r: 5 }),
      makeUnit('human-guard', 'royalGuard', 1, { q: 7, r: 5 }),
      makeUnit('undead-banshee', 'banshee', 2, { q: 6, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const actions = generateLegalAiActions(state);

    expect(actions.some((action) => action.kind === 'displace' && action.targetId === 'human-guard')).toBe(true);
  });

  it('runs a shallow visible-board Human response search', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.currentPlayer).toBe(2);

    const plan = planSmartAiTurn(state, deterministicSearch);

    expect(plan.responseStates).toBeGreaterThan(0);
    expect(Number.isFinite(plan.score)).toBe(true);
  });

  it('does not change its plan when only the hidden Human hand changes', () => {
    const first = minimalAiTurnState();
    const second = minimalAiTurnState();
    first.players[1].hand = ['longbowRanger'];
    second.players[1].hand = ['silverwingCavalry', 'lightMage', 'royalGuard', 'longbowRanger'];

    const firstPlan = planSmartAiTurn(first, deterministicSearch);
    const secondPlan = planSmartAiTurn(second, deterministicSearch);

    expect(secondPlan.actions).toEqual(firstPlan.actions);
    expect(secondPlan.score).toBe(firstPlan.score);
  });

  it('respects a tiny node budget and still completes the enemy turn', () => {
    const state = minimalAiTurnState();
    const result = runSmartAiTurn(state, fixedRandom, {
      ...COMMON_AI_OPTIONS,
      maxNodes: 20,
      maxPlanningMs: 5_000,
    });

    expect(result.searchedStates).toBeLessThanOrEqual(20);
    expect(result.timedOut).toBe(true);
    expect(result.endedTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });

  it('uses one common mobile-safe profile on every browser', () => {
    expect(getBrowserAiSearchOptions()).toBe(COMMON_AI_OPTIONS);
    expect(COMMON_AI_OPTIONS.maxPlanningMs).toBeLessThanOrEqual(60);
    expect(COMMON_AI_OPTIONS.maxNodes).toBeLessThanOrEqual(3_000);
    expect(COMMON_AI_OPTIONS.responseMaxNodes).toBeLessThanOrEqual(700);
  });
});
