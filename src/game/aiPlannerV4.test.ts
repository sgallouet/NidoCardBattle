import { describe, expect, it } from 'vitest';
import type { Coord, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { executeAiPlan, type AiPlan } from './ai';
import { PLANNER_V3_PROFILE, PORTFOLIO_DOCTRINES } from './aiPlannerProfiles';
import {
  LIVE_AI_OPTIONS_V4,
  getBrowserAiSearchOptions,
  planAiTurnV4,
  type PlannerV4Doctrine,
} from './aiPlannerV4';
import { createGameState } from './engine';

const fixedRandom = () => 0.25;
const QUICK_OPTIONS = {
  beamWidth: 2,
  maxDepth: 3,
  strategyMaxNodes: 360,
  strategyMaxPlanningMs: 5_000,
  candidatePlans: 12,
  responseBeamWidth: 3,
  responseDepth: 3,
  tacticalMaxNodes: 240,
  tacticalMaxPlanningMs: 5_000,
} as const;

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

type V4Diagnostics = AiPlan['diagnostics'] & {
  planner: string;
  selectedDoctrine: PlannerV4Doctrine;
  candidatesGenerated: number;
  candidatesAfterDeduplication: number;
  tacticalCandidatesAssessed: number;
  responseSequencesChecked: number;
};

const diagnosticsOf = (plan: AiPlan): V4Diagnostics => plan.diagnostics as V4Diagnostics;

describe('Planner V4 portfolio', () => {
  it('generates diverse candidates and returns a replayable complete turn', () => {
    const state = createGameState(fixedRandom);
    const plan = planAiTurnV4(state, QUICK_OPTIONS);
    const diagnostics = diagnosticsOf(plan);

    expect(diagnostics.planner).toBe('v4-portfolio');
    expect(PORTFOLIO_DOCTRINES).toContain(diagnostics.selectedDoctrine);
    expect(diagnostics.candidatesGenerated).toBeGreaterThan(PORTFOLIO_DOCTRINES.length);
    expect(diagnostics.candidatesAfterDeduplication).toBeLessThanOrEqual(diagnostics.candidatesGenerated);
    expect(diagnostics.tacticalCandidatesAssessed).toBeGreaterThan(0);
    expect(diagnostics.tacticalCandidatesAssessed).toBeLessThanOrEqual(12);
    expect(diagnostics.responseSequencesChecked).toBeGreaterThan(0);
    expect(diagnostics.strategy.nodes).toBeLessThanOrEqual(QUICK_OPTIONS.strategyMaxNodes);
    expect(diagnostics.tactical.nodes).toBeLessThanOrEqual(QUICK_OPTIONS.tacticalMaxNodes);

    const replay = structuredClone(state);
    const turn = executeAiPlan(replay, plan, fixedRandom);
    expect(turn.actions.some((message) => message.startsWith('AI plan stopped:'))).toBe(false);
    expect(replay.winner !== null || turn.endedTurn).toBe(true);
  });

  it('gates strategic play behind stopping a visible Commander kill', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].mana = 0;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.sites = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 14, r: 9 }),
      makeUnit('human-threat', 'skeletalInfantry', 1, { q: 5, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 6, r: 5 }, { hp: 2 }),
      makeUnit('undead-defender', 'graveKnight', 2, { q: 5, r: 6 }),
    ];

    const plan = planAiTurnV4(state, { ...QUICK_OPTIONS, beamWidth: 4, strategyMaxNodes: 700 });
    expect(plan.tactical.tier).not.toBe('forced-loss');
    expect(plan.actions.some((action) =>
      action.kind === 'attack' && action.targetId === 'human-threat')).toBe(true);
  });

  it('uses the same total live node budget as V3', () => {
    expect(LIVE_AI_OPTIONS_V4.strategyMaxNodes).toBe(PLANNER_V3_PROFILE.liveOptions.strategyMaxNodes);
    expect(LIVE_AI_OPTIONS_V4.tacticalMaxNodes).toBe(PLANNER_V3_PROFILE.liveOptions.tacticalMaxNodes);
  });

  it('uses one common mobile-safe V4 profile on every browser', () => {
    expect(getBrowserAiSearchOptions()).toBe(LIVE_AI_OPTIONS_V4);
    expect(LIVE_AI_OPTIONS_V4.strategyMaxNodes).toBe(2_600);
    expect(LIVE_AI_OPTIONS_V4.strategyMaxPlanningMs).toBe(160);
    expect(LIVE_AI_OPTIONS_V4.tacticalMaxNodes).toBe(1_200);
    expect(LIVE_AI_OPTIONS_V4.tacticalMaxPlanningMs).toBe(120);
  });
});
