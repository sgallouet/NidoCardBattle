import { describe, expect, it } from 'vitest';
import { simulatePlannerDuelGame, type PlannerGameLog } from './aiPlannerDuel';

describe('saved planner games', () => {
  it('reconstructs every turn boundary and final board from resolved action deltas', () => {
    let log: PlannerGameLog | undefined;
    const options = { maxHalfTurns: 4, aiOptions: { strategyMaxNodes: 80, tacticalMaxNodes: 30, strategyMaxPlanningMs: 60_000, tacticalMaxPlanningMs: 60_000 } };
    const plain = simulatePlannerDuelGame(20260908, { 1: 'v9', 2: 'v10' }, options);
    const recorded = simulatePlannerDuelGame(20260908, { 1: 'v9', 2: 'v10' }, { ...options, recordGame: (value) => { log = value; return 'game.json'; } });
    expect({ ...recorded, logPath: undefined }).toEqual(plain);
    const state = structuredClone(log!.initial);
    for (const turn of log!.turns) {
      expect(state).toEqual(turn.start);
      expect(turn.steps.at(-1)!.action.kind).toBe('endTurn');
      for (const { result, delta } of turn.steps) {
        expect(result.ok).toBe(true);
        if (delta.state) Object.assign(state, delta.state.after);
        for (const change of delta.playersChanged ?? []) state.players[change.player] = change.after;
        for (const type of ['units', 'sites'] as const) {
          const removed = delta[`${type}Removed`] ?? [];
          const changed = delta[`${type}Changed`] ?? [];
          const added = delta[`${type}Added`] ?? [];
          const next = state[type].filter((item) => !removed.some((gone) => gone.id === item.id))
            .map((item) => changed.find((change) => change.before.id === item.id)?.after ?? item);
          Object.assign(state, { [type]: [...next, ...added].sort((a, b) => a.id.localeCompare(b.id)) });
        }
        if (delta.board) state.board = delta.board.after;
      }
    }
    expect(state).toEqual(log!.final);
  });
});
