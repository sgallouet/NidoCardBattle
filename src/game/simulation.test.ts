import { describe, expect, it } from 'vitest';
import { createGameState } from './engine';
import { planAiTurn, runAiTurn } from './ai';
import { seededRandom, simulateAiBatch, simulateAiMatch } from './simulation';

const FAST_SIM_OPTIONS = {
  beamWidth: 2,
  maxDepth: 2,
  strategyMaxNodes: 120,
  strategyMaxPlanningMs: 5_000,
  candidatePlans: 2,
  responseBeamWidth: 1,
  responseDepth: 1,
  tacticalMaxNodes: 24,
  tacticalMaxPlanningMs: 5_000,
} as const;

describe('faction-agnostic AI planner', () => {
  it('can plan and complete the Human Player 1 turn', () => {
    const random = seededRandom(42);
    const state = createGameState(random);
    expect(state.currentPlayer).toBe(1);

    const plan = planAiTurn(state, FAST_SIM_OPTIONS);
    expect(plan.diagnostics.strategy.nodes).toBeGreaterThan(0);
    expect(Number.isFinite(plan.strategic.outlook)).toBe(true);

    const result = runAiTurn(state, random, FAST_SIM_OPTIONS);
    expect(result.endedTurn).toBe(true);
    expect(state.currentPlayer).toBe(2);
  });
});

describe('AI-vs-AI simulation', () => {
  it('runs headlessly with deterministic seed and bounded turns', () => {
    const first = simulateAiMatch(12345, {
      maxHalfTurns: 6,
      repetitionLimit: 3,
      aiOptions: FAST_SIM_OPTIONS,
    });
    const second = simulateAiMatch(12345, {
      maxHalfTurns: 6,
      repetitionLimit: 3,
      aiOptions: FAST_SIM_OPTIONS,
    });

    expect(first.winner).toBe(second.winner);
    expect(first.termination).toBe(second.termination);
    expect(first.halfTurns).toBe(second.halfTurns);
    expect(first.actionCounts).toEqual(second.actionCounts);
    expect(first.summonsByCard).toEqual(second.summonsByCard);
    expect(first.halfTurns).toBeLessThanOrEqual(6);
    expect(first.planReplayFailures).toBe(0);
  });

  it('can give Undead the first move without changing faction ownership', () => {
    const result = simulateAiMatch(2026, {
      firstPlayerFaction: 'undead',
      maxHalfTurns: 2,
      aiOptions: FAST_SIM_OPTIONS,
    });

    expect(result.firstPlayerFaction).toBe('undead');
    expect(result.playerFactions[1]).toBe('undead');
    expect(result.playerFactions[2]).toBe('human');
    expect(result.halfTurns).toBeGreaterThan(0);
  });

  it('aggregates faction balance separately from first-player advantage', () => {
    const result = simulateAiBatch({
      matches: 4,
      seed: 77,
      maxHalfTurns: 4,
      repetitionLimit: 3,
      aiOptions: FAST_SIM_OPTIONS,
    });

    expect(result.matches).toBe(4);
    expect(result.matchesDetail.map((match) => match.firstPlayerFaction)).toEqual([
      'human', 'undead', 'human', 'undead',
    ]);
    expect(result.matchesDetail.map((match) => match.seed)).toEqual([
      77, 77, 77 + 0x9e3779b1, 77 + 0x9e3779b1,
    ]);
    expect(result.humanWins + result.undeadWins + result.stalemates).toBe(4);
    expect(result.terminations.victory + result.terminations.repetition + result.terminations['turn-limit']).toBe(4);
    expect(result.averageHalfTurns).toBeGreaterThan(0);
    expect(result.averageStrategyNodesPerTurn).toBeGreaterThan(0);
    expect(result.averageTacticalNodesPerTurn).toBeGreaterThan(0);
    expect(result.replayFailureRate).toBe(0);
    expect(result.firstPlayerWinRate).toBeGreaterThanOrEqual(0);
    expect(result.firstPlayerWinRate).toBeLessThanOrEqual(1);
    expect(result.objectiveControlShareByFaction.human.well).toBeGreaterThanOrEqual(0);
    expect(result.objectiveControlShareByFaction.undead.well).toBeGreaterThanOrEqual(0);
  });
});
