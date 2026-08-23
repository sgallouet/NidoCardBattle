import { describe, expect, it } from 'vitest';
import { GAME_ACTION_KINDS } from './actions';
import { analyzeBattleLogs, generateBattleLog } from './battleLog';

const FAST_LOG_OPTIONS = {
  maxHalfTurns: 6,
  repetitionLimit: 3,
  aiOptions: {
    beamWidth: 2,
    maxDepth: 2,
    strategyMaxNodes: 120,
    strategyMaxPlanningMs: 5_000,
    candidatePlans: 2,
    responseBeamWidth: 1,
    responseDepth: 1,
    tacticalMaxNodes: 24,
    tacticalMaxPlanningMs: 5_000,
  },
} as const;

describe('battle log generator', () => {
  it('records deterministic action-level state deltas and turn summaries', () => {
    const first = generateBattleLog(98123, FAST_LOG_OPTIONS);
    const second = generateBattleLog(98123, FAST_LOG_OPTIONS);

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(2);
    expect(first.turns).toHaveLength(first.result.halfTurns);
    expect(first.turns.every((turn) => turn.steps.at(-1)?.action.kind === 'endTurn')).toBe(true);
    expect(first.turns.every((turn) => turn.end !== undefined)).toBe(true);
    expect(first.turns.every((turn) => Number.isFinite(turn.plan.strategic.outlook))).toBe(true);
    expect(first.turns.every((turn) => turn.plan.tactical.worstResponse !== undefined)).toBe(true);
    expect(first.turns.every((turn) => turn.plan.diagnostics.strategy.stopReason !== undefined)).toBe(true);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);

    for (const player of [1, 2] as const) {
      for (const kind of GAME_ACTION_KINDS) {
        const logged = first.turns
          .filter((turn) => turn.actor === player)
          .flatMap((turn) => turn.steps)
          .filter((step) => step.action.kind === kind)
          .length;
        expect(logged).toBe(first.result.actionCounts[player][kind]);
      }
    }
  });

  it('derives processable faction metrics from detailed logs', () => {
    const log = generateBattleLog(551, FAST_LOG_OPTIONS);
    const analysis = analyzeBattleLogs([log]);

    expect(analysis.matches).toBe(1);
    expect(analysis.factions.human.turns + analysis.factions.undead.turns).toBe(log.result.halfTurns);
    expect(analysis.factions.human.failedActions + analysis.factions.undead.failedActions).toBe(0);
    expect(analysis.terminations[log.result.termination]).toBe(1);
  });
});
