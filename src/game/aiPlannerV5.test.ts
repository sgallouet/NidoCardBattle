import { describe, expect, it } from 'vitest';
import type { Coord, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { executeAiPlan, type AiPlan } from './ai';
import { PLANNER_V4_PROFILE } from './aiPlannerProfiles';
import { LIVE_AI_OPTIONS_V5, planAiTurnV5 } from './aiPlannerV5';
import { createGameState, endTurn } from './engine';

const fixedRandom = () => 0.25;
const QUICK_OPTIONS = {
  beamWidth: 3,
  maxDepth: 5,
  strategyMaxNodes: 900,
  strategyMaxPlanningMs: 8_000,
  candidatePlans: 12,
  responseBeamWidth: 3,
  responseDepth: 3,
  tacticalMaxNodes: 360,
  tacticalMaxPlanningMs: 8_000,
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

type V5Diagnostics = AiPlan['diagnostics'] & { planner: string };

describe('Planner V5 portfolio', () => {
  it('plays Profane Well on an opening 3-mana hand instead of only summoning a Bone Archer', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);
    state.players[2].mana = 3;
    state.players[2].hand = ['profaneWell', 'vampire', 'boneArcher', 'wraith', 'necromancer'];
    state.players[2].deck = [];
    state.players[2].discard = [];

    const plan = planAiTurnV5(state, QUICK_OPTIONS);

    expect((plan.diagnostics as V5Diagnostics).planner).toBe('v5-portfolio');
    expect(plan.actions.some((action) => action.kind === 'tactic' && action.cardId === 'profaneWell')).toBe(true);
    const replay = structuredClone(state);
    const turn = executeAiPlan(replay, plan, fixedRandom);
    expect(turn.actions.some((message) => message.startsWith('AI plan stopped:'))).toBe(false);
  });

  it('curses a reachable enemy Commander instead of only invoking', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].mana = 0;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.sites = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 13, r: 7 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 4 }),
      makeUnit('undead-necromancer', 'necromancer', 2, { q: 13, r: 4 }),
    ];

    const plan = planAiTurnV5(state, QUICK_OPTIONS);
    expect(plan.actions.some((action) =>
      action.kind === 'curse' && action.targetId === 'human-commander')).toBe(true);
  });

  it('does not Soul Link when the Commander faces no visible threat', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].mana = 0;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.sites = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 8 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 4 }),
      makeUnit('undead-ally', 'skeletalInfantry', 2, { q: 14, r: 4 }),
    ];

    const plan = planAiTurnV5(state, QUICK_OPTIONS);
    expect(plan.actions.some((action) => action.kind === 'soulLink')).toBe(false);
  });

  it('keeps the same total live node budget as V4', () => {
    expect(LIVE_AI_OPTIONS_V5.strategyMaxNodes).toBe(PLANNER_V4_PROFILE.liveOptions.strategyMaxNodes);
    expect(LIVE_AI_OPTIONS_V5.tacticalMaxNodes).toBe(PLANNER_V4_PROFILE.liveOptions.tacticalMaxNodes);
  });
});
