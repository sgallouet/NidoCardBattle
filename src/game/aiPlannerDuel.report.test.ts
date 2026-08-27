import { expect, it } from 'vitest';
import { simulatePlannerDuelBatch } from './aiPlannerDuel';

const simulationTest = import.meta.env.MODE === 'simulation' ? it : it.skip;

simulationTest('prints a paired Planner V2 vs Planner V3 strength report', () => {
  const report = simulatePlannerDuelBatch({
    pairs: 40,
    seed: 20260826,
    maxHalfTurns: 140,
    repetitionLimit: 4,
    onPairComplete: (progress) => console.log(`AI_PLANNER_DUEL_PROGRESS ${JSON.stringify(progress)}`),
  });

  const summary = {
    pairs: report.pairs,
    games: report.games,
    v2Wins: report.v2Wins,
    v3Wins: report.v3Wins,
    draws: report.draws,
    v2WinRate: report.v2WinRate,
    v3WinRate: report.v3WinRate,
    v3DecisiveWinRate: report.v3DecisiveWinRate,
    firstPlayerWinRate: report.firstPlayerWinRate,
    pairWinsV2: report.pairWinsV2,
    pairWinsV3: report.pairWinsV3,
    pairTies: report.pairTies,
    averageHalfTurns: report.averageHalfTurns,
    averageActionsPerTurn: report.averageActionsPerTurn,
    capturesByPlanner: report.capturesByPlanner,
    killsByPlanner: report.killsByPlanner,
    replayFailuresByPlanner: report.replayFailuresByPlanner,
    factionWinsByPlanner: report.factionWinsByPlanner,
    doctrineSelections: report.doctrineSelections,
  };

  console.log(`AI_PLANNER_DUEL_REPORT ${JSON.stringify(summary)}`);
  expect(report.games).toBe(80);
  expect(report.replayFailuresByPlanner.v2).toBe(0);
  expect(report.replayFailuresByPlanner.v3).toBe(0);
}, 3_600_000);
