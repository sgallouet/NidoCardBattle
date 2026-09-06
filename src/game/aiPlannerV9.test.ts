import { describe, expect, it } from 'vitest';
import { createGameState } from './engine';
import { applyAiAction, executeAiPlan } from './ai';
import { planAiTurnV9, sampleV9Information, selectV9Actions, v9StateKey } from './aiPlannerV9';
import { createV9Evaluator } from './aiV9Evaluation';
import { validateAiContinuation } from './aiPlanReplay';

const options = { strategyMaxNodes: 600, tacticalMaxNodes: 240, strategyMaxPlanningMs: 60_000, tacticalMaxPlanningMs: 60_000, maxDepth: 12 };
describe('V9 adversarial search', () => {
  it('preserves inputs and replays a coherent turn through the engine', () => {
    const state = createGameState(() => 0.25);
    const original = structuredClone(state);
    const plan = planAiTurnV9(state, options);
    expect(state).toEqual(original);
    expect(plan.actions.length).toBeGreaterThan(0);
    const result = executeAiPlan(state, plan, () => 0.25);
    expect(result.actions.some((message) => message.startsWith('AI plan stopped:'))).toBe(false);
    expect(result.endedTurn).toBe(true);
    expect(plan.diagnostics.strategy.nodes).toBeLessThanOrEqual(options.strategyMaxNodes);
    expect(plan.diagnostics.tactical.nodes).toBeLessThanOrEqual(options.tacticalMaxNodes);
  });
  it('is invariant to inaccessible hand identities and both future deck orders', () => {
    const state = createGameState(() => 0.25);
    const changed = structuredClone(state);
    changed.players[2].hand.fill('graveKnight');
    changed.players[2].deck.reverse();
    changed.players[1].deck.reverse();
    expect(sampleV9Information(state, 1, 0)).toEqual(sampleV9Information(changed, 1, 0));
    expect(planAiTurnV9(state, options).actions).toEqual(planAiTurnV9(changed, options).actions);
  });
  it('executes GRV4 before any positional preference', () => {
    const state = createGameState(() => 0.25);
    state.units = state.units.filter((unit) => unit.definitionId === 'commander');
    state.units[0].coord = { q: 8, r: 4 };
    state.units[1].coord = { q: 9, r: 4 };
    state.units[1].hp = 1;
    for (const player of [1, 2] as const) { state.players[player].hand = []; state.players[player].deck = []; }
    const plan = planAiTurnV9(state, options);
    for (const action of plan.actions) expect(applyAiAction(state, action).ok).toBe(true);
    expect(state.winner).toBe(1);
  });
  it('reserves expanded action groups even with many CRC7 targets', () => {
    const state = createGameState(() => 0.25);
    state.players[1].mana = 10;
    state.players[1].hand = ['raiseFort', 'royalGuard'];
    const { legal, actions } = selectV9Actions(state, createV9Evaluator());
    const group = (action: typeof legal[number]) => `${action.kind}:${'unitId' in action ? action.unitId : action.cardId}`;
    const groups = new Set(legal.map(group));
    expect(groups.size).toBeLessThanOrEqual(24);
    expect(new Set(actions.map(group))).toEqual(groups);
  });
  it('does not merge future-relevant status changes', () => {
    const state = createGameState(() => 0.25);
    const changed = structuredClone(state);
    changed.units[0].curses = [{ sourcePlayer: 2, remainingTurns: 2 }];
    expect(v9StateKey(state)).not.toBe(v9StateKey(changed));
  });
  it('validates each continuation and rejects a changed board', () => {
    const initial = createGameState(() => 0.25);
    const plan = planAiTurnV9(initial, options);
    const live = structuredClone(initial);
    for (const [index, action] of plan.actions.entries()) {
      expect(() => validateAiContinuation(live, plan, index)).not.toThrow();
      expect(applyAiAction(live, action).ok).toBe(true);
    }
    initial.units[0].hp--;
    expect(() => validateAiContinuation(initial, plan, 0)).toThrow('diverged');
  });
});
