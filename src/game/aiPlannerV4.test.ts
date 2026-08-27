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
import { createGameState, terrainAt } from './engine';

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

  it('uses a larger live node budget than the V3 baseline so a 1s think can search', () => {
    expect(LIVE_AI_OPTIONS_V4.strategyMaxNodes).toBeGreaterThan(PLANNER_V3_PROFILE.liveOptions.strategyMaxNodes);
    expect(LIVE_AI_OPTIONS_V4.tacticalMaxNodes).toBeGreaterThan(PLANNER_V3_PROFILE.liveOptions.tacticalMaxNodes);
  });

  it('uses one common live profile with a 1s think budget on every browser', () => {
    expect(getBrowserAiSearchOptions()).toBe(LIVE_AI_OPTIONS_V4);
    expect(LIVE_AI_OPTIONS_V4.strategyMaxPlanningMs + LIVE_AI_OPTIONS_V4.tacticalMaxPlanningMs).toBe(1_000);
    expect(LIVE_AI_OPTIONS_V4.strategyMaxPlanningMs).toBe(700);
    expect(LIVE_AI_OPTIONS_V4.tacticalMaxPlanningMs).toBe(300);
  });

  it('moves a ranger onto a hill for the extra range', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].mana = 0;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.sites = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 15, r: 5 }),
      makeUnit('undead-archer', 'boneArcher', 2, { q: 13, r: 5 }),
    ];

    const plan = planAiTurnV4(state, { ...QUICK_OPTIONS, beamWidth: 4, maxDepth: 4, strategyMaxNodes: 700 });
    expect(plan.actions.some((action) =>
      action.kind === 'move'
      && action.unitId === 'undead-archer'
      && terrainAt(action.destination) === 'hill')).toBe(true);
  });

  it('walks a nearby unit onto an unowned mana well', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].mana = 0;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 8 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 4 }),
      makeUnit('undead-skirmisher', 'skeletalInfantry', 2, { q: 14, r: 4 }),
    ];

    const plan = planAiTurnV4(state, { ...QUICK_OPTIONS, beamWidth: 4, maxDepth: 4, strategyMaxNodes: 700 });
    expect(plan.actions.some((action) =>
      action.kind === 'move'
      && action.destination.q === 13
      && action.destination.r === 4)).toBe(true);
  });
});

