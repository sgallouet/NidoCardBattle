import { describe, expect, it } from 'vitest';
import { executeAiPlan, type AiPlan } from './ai';
import { planAiTurnV2AnyPlayer } from './aiPlannerAdapters';
import { planAiTurnV3, type PlannerV3Doctrine } from './aiPlannerV3';
import { createGameState } from './engine';

const fixedRandom = () => 0.25;
const QUICK_OPTIONS = {
  beamWidth: 2,
  maxDepth: 2,
  strategyMaxNodes: 220,
  strategyMaxPlanningMs: 5_000,
  candidatePlans: 4,
  responseBeamWidth: 2,
  responseDepth: 2,
  tacticalMaxNodes: 120,
  tacticalMaxPlanningMs: 5_000,
} as const;

const extendedDiagnostics = (plan: AiPlan): {
  planner?: string;
  selectedDoctrine?: PlannerV3Doctrine;
} => plan.diagnostics as AiPlan['diagnostics'] & {
  planner?: string;
  selectedDoctrine?: PlannerV3Doctrine;
};

describe('Planner V3 portfolio and duel adapters', () => {
  it('selects a named doctrine and produces a replayable complete turn', () => {
    const state = createGameState(fixedRandom);
    const plan = planAiTurnV3(state, QUICK_OPTIONS);
    const diagnostics = extendedDiagnostics(plan);

    expect(diagnostics.planner).toBe('v3-portfolio');
    expect(diagnostics.selectedDoctrine).toBeTruthy();

    const replay = structuredClone(state);
    const turn = executeAiPlan(replay, plan, fixedRandom);
    expect(turn.actions.some((message) => message.startsWith('AI plan stopped:'))).toBe(false);
    expect(replay.winner !== null || turn.endedTurn).toBe(true);
  });

  it('runs the exact Planner V2 logic for Player 1 through the mirror adapter', () => {
    const state = createGameState(fixedRandom);
    expect(state.currentPlayer).toBe(1);

    const plan = planAiTurnV2AnyPlayer(state, QUICK_OPTIONS);
    const replay = structuredClone(state);
    const turn = executeAiPlan(replay, plan, fixedRandom);

    expect(turn.actions.some((message) => message.startsWith('AI plan stopped:'))).toBe(false);
    expect(replay.winner !== null || turn.endedTurn).toBe(true);
    expect(replay.currentPlayer === 2 || replay.winner !== null).toBe(true);
  });
});
