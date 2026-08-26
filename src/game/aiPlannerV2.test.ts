import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { createGameState } from './engine';
import { LIVE_AI_OPTIONS_V2, planSmartAiTurnV2 } from './aiPlannerV2';

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

const generousSearch = {
  ...LIVE_AI_OPTIONS_V2,
  strategyMaxPlanningMs: 5_000,
  tacticalMaxPlanningMs: 5_000,
  strategyMaxNodes: 4_000,
  tacticalMaxNodes: 2_000,
  beamWidth: 10,
  maxDepth: 4,
  responseDepth: 3,
} as const;

const blockedDeploymentState = (): GameState => {
  const state = createGameState(fixedRandom);
  state.currentPlayer = 2;
  state.players[2].mana = 8;
  state.players[2].hand = ['skeletalInfantry', 'vampire'];
  state.players[2].deck = [];
  state.players[2].discard = [];
  state.sites = [{
    id: 'only-undead-keep',
    type: 'keep',
    coord: { q: 12, r: 6 },
    owner: 2,
    initialOwner: 2,
  }];
  state.units = [
    makeUnit('human-commander', 'commander', 1, { q: 2, r: 8 }),
    makeUnit('undead-commander', 'commander', 2, { q: 15, r: 8 }),
    makeUnit('keep-blocker', 'skeletalInfantry', 2, { q: 12, r: 6 }),
  ];
  return state;
};

describe('live AI planner V2 regressions', () => {
  it('finds move-blocker then summon instead of ending after one harmless action', () => {
    const state = blockedDeploymentState();
    const plan = planSmartAiTurnV2(state, generousSearch);

    const moveIndex = plan.actions.findIndex((action) =>
      action.kind === 'move' && action.unitId === 'keep-blocker');
    const summonIndex = plan.actions.findIndex((action) => action.kind === 'summon');

    expect(moveIndex).toBeGreaterThanOrEqual(0);
    expect(summonIndex).toBeGreaterThan(moveIndex);
    expect(plan.actions.length).toBeGreaterThanOrEqual(2);
  });

  it('records completed strategic depth so a timeout cannot masquerade as a deep search', () => {
    const state = blockedDeploymentState();
    const plan = planSmartAiTurnV2(state, generousSearch);
    const diagnostics = plan.diagnostics as typeof plan.diagnostics & {
      strategyCompletedDepth: number;
      tacticalCompletedDepth: number;
      planner: string;
    };

    expect(diagnostics.planner).toBe('v2-iterative');
    expect(diagnostics.strategyCompletedDepth).toBeGreaterThanOrEqual(2);
    expect(diagnostics.tacticalCompletedDepth).toBeGreaterThanOrEqual(1);
  });

  it('never calls an unassessed candidate safe when a visible direct reply exists', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].mana = 0;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.sites = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 8 }),
      makeUnit('human-cavalry', 'silverwingCavalry', 1, { q: 8, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 8 }),
      makeUnit('exposed-vampire', 'vampire', 2, { q: 10, r: 5 }),
    ];

    const plan = planSmartAiTurnV2(state, generousSearch);
    if (plan.tactical.tier === 'safe') {
      expect(plan.tactical.worstResponse.length).toBeGreaterThan(0);
    }
    const diagnostics = plan.diagnostics as typeof plan.diagnostics & {
      unassessedCandidates: number;
    };
    expect(diagnostics.unassessedCandidates).toBe(0);
  });

  it('uses a materially larger but still bounded live Worker budget than the broken 35/20 ms profile', () => {
    expect(LIVE_AI_OPTIONS_V2.strategyMaxPlanningMs).toBeGreaterThanOrEqual(120);
    expect(LIVE_AI_OPTIONS_V2.tacticalMaxPlanningMs).toBeGreaterThanOrEqual(80);
    expect(LIVE_AI_OPTIONS_V2.strategyMaxPlanningMs).toBeLessThanOrEqual(250);
    expect(LIVE_AI_OPTIONS_V2.tacticalMaxPlanningMs).toBeLessThanOrEqual(180);
  });
});
