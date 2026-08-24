import { expect, it } from 'vitest';
import { simulateAiBatch } from './simulation';

const simulationTest = import.meta.env.MODE === 'simulation' ? it : it.skip;

simulationTest('prints an AI-vs-AI balance report', () => {
  const report = simulateAiBatch({
    matches: 12,
    seed: 20260822,
    maxHalfTurns: 120,
    repetitionLimit: 4,
  });

  const summary = {
    matches: report.matches,
    humanWins: report.humanWins,
    undeadWins: report.undeadWins,
    stalemates: report.stalemates,
    humanWinRate: report.humanWinRate,
    undeadWinRate: report.undeadWinRate,
    firstPlayerWinRate: report.firstPlayerWinRate,
    averageRounds: report.averageRounds,
    averageStrategyNodesPerTurn: report.averageStrategyNodesPerTurn,
    averageTacticalNodesPerTurn: report.averageTacticalNodesPerTurn,
    strategyNodeLimitRate: report.strategyNodeLimitRate,
    strategyTimeLimitRate: report.strategyTimeLimitRate,
    tacticalNodeLimitRate: report.tacticalNodeLimitRate,
    tacticalTimeLimitRate: report.tacticalTimeLimitRate,
    replayFailureRate: report.replayFailureRate,
    commanderDeathGamesByFaction: report.commanderDeathGamesByFaction,
    objectiveControlShareByFaction: report.objectiveControlShareByFaction,
    summonsByCard: report.summonsByCard,
    actionCountsByFaction: report.actionCountsByFaction,
    terminations: report.terminations,
  };

  console.log(`AI_SIMULATION_REPORT ${JSON.stringify(summary)}`);
  expect(report.matches).toBe(12);
  expect(report.replayFailureRate).toBe(0);
}, 900_000);
