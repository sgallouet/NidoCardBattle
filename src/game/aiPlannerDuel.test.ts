import { describe, expect, it, vi } from 'vitest';
import { simulatePlannerDuelBatch, simulatePlannerMatchupBatch } from './aiPlannerDuel';

describe('planner duel harness', () => {
  it('reports progress after each completed paired seed', () => {
    const onPairComplete = vi.fn();
    const report = simulatePlannerDuelBatch({
      pairs: 1,
      seed: 20260826,
      maxHalfTurns: 1,
      repetitionLimit: 2,
      aiOptions: {
        beamWidth: 1,
        maxDepth: 1,
        strategyMaxNodes: 1,
        strategyMaxPlanningMs: 5_000,
        candidatePlans: 1,
        responseBeamWidth: 1,
        responseDepth: 1,
        tacticalMaxNodes: 1,
        tacticalMaxPlanningMs: 5_000,
      },
      onPairComplete,
    });

    expect(report.games).toBe(2);
    expect(onPairComplete).toHaveBeenCalledOnce();
    expect(onPairComplete).toHaveBeenCalledWith({
      pairsCompleted: 1,
      totalPairs: 1,
      gamesCompleted: 2,
      v2Wins: 0,
      v3Wins: 0,
      draws: 2,
    });
  });

  it('runs paired V3 versus V4 assignments with generic telemetry', () => {
    const onPairComplete = vi.fn();
    const report = simulatePlannerMatchupBatch('v3', 'v4', {
      pairs: 1,
      seed: 20260901,
      maxHalfTurns: 1,
      repetitionLimit: 2,
      aiOptions: {
        beamWidth: 1,
        maxDepth: 1,
        strategyMaxNodes: 90,
        strategyMaxPlanningMs: 5_000,
        candidatePlans: 2,
        responseBeamWidth: 1,
        responseDepth: 1,
        tacticalMaxNodes: 30,
        tacticalMaxPlanningMs: 5_000,
      },
    }, onPairComplete);

    expect(report.planners).toEqual(['v3', 'v4']);
    expect(report.games).toBe(2);
    expect(report.replayFailuresByPlanner.v3).toBe(0);
    expect(report.replayFailuresByPlanner.v4).toBe(0);
    expect(report.searchTelemetryByPlanner.v4.candidatesGenerated).toBeGreaterThan(0);
    expect(report.searchTelemetryByPlanner.v4.candidatesAfterDeduplication)
      .toBeLessThanOrEqual(report.searchTelemetryByPlanner.v4.candidatesGenerated);
    expect(report.searchTelemetryByPlanner.v4.responseSequencesChecked).toBeGreaterThan(0);
    expect(onPairComplete).toHaveBeenCalledWith(expect.objectContaining({
      pairsCompleted: 1,
      gamesCompleted: 2,
      draws: 2,
    }));
  });
});
