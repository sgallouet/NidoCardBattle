import { describe, expect, it } from 'vitest';
import { createGameState, endTurn, findUnit } from './engine';
import { executeAiPlan } from './ai';
import { diverseV10Candidates, planAiTurnV10 } from './aiPlannerV10';
import { createV10Evaluator } from './aiV10Evaluation';

const options = { strategyMaxNodes: 1_200, tacticalMaxNodes: 600, strategyMaxPlanningMs: 60_000, tacticalMaxPlanningMs: 60_000 };
describe('V10 human-playtest regressions', () => {
  it('advances the healthy Commander toward contested sites from the recorded opening', () => {
    const state = createGameState(() => 0.25);
    endTurn(state, () => 0.25);
    state.players[2].hand = ['graveLock', 'necromancer', 'boneArcher', 'profaneWell'];
    const leader = state.units.find((unit) => unit.owner === 2 && unit.definitionId === 'commander')!;
    const evaluator = createV10Evaluator();
    const before = Math.min(...state.sites.filter((site) => site.type === 'fort').map((site) => evaluator.travel(state, leader, site.coord)));
    const plan = planAiTurnV10(state, options);
    const replay = structuredClone(state);
    const result = executeAiPlan(replay, plan, () => 0.25);
    expect(result.actions.some((message) => message.startsWith('AI plan stopped:'))).toBe(false);
    const after = findUnit(replay, leader.id)!;
    expect(Math.min(...state.sites.filter((site) => site.type === 'fort').map((site) => evaluator.travel(replay, after, site.coord)))).toBeLessThan(before);
  });
  it('preserves hidden-card invariance and search limits', () => {
    const state = createGameState(() => 0.25);
    const changed = structuredClone(state);
    changed.players[2].hand.fill('graveKnight');
    changed.players[1].deck.reverse(); changed.players[2].deck.reverse();
    const plan = planAiTurnV10(state, options);
    expect(planAiTurnV10(changed, options).actions).toEqual(plan.actions);
    expect(plan.diagnostics.strategy.nodes).toBeLessThanOrEqual(options.strategyMaxNodes);
    expect(plan.diagnostics.tactical.nodes).toBeLessThanOrEqual(options.tacticalMaxNodes);
  });
  it('values shelter from HUR4 over a vulnerable position', () => {
    const state = createGameState(() => 0.25);
    state.sites = [];
    state.units = [
      { id: 'cavalry', definitionId: 'silverwingCavalry', owner: 1, hp: 5, coord: { q: 11, r: 4 }, moved: false, attacked: false, exhausted: false },
      { id: 'necro', definitionId: 'necromancer', owner: 2, hp: 4, coord: { q: 8, r: 4 }, moved: false, attacked: false, exhausted: false },
    ];
    const evaluator = createV10Evaluator();
    const exposed = evaluator.evaluate(state, 2);
    state.units[1].coord = { q: 4, r: 4 };
    expect(evaluator.evaluate(state, 2)).toBeGreaterThan(exposed);
  });
});

 it('retains defence, Commander pressure and capture alternatives', () => {
   const initial = createGameState(() => 0.25);
   const node = (hp: number, enemyHp: number, capture: boolean, score: number) => {
     const ended = structuredClone(initial);
     ended.units.find((u) => u.owner === 1 && u.definitionId === 'commander')!.hp = hp;
     ended.units.find((u) => u.owner === 2 && u.definitionId === 'commander')!.hp = enemyHp;
     if (capture) ended.sites.forEach((s) => { s.owner = 1; });
     return { state: ended, ended, actions: [], score };
   };
   const capture = node(6, 10, true, 300), attack = node(6, 2, false, 200), defend = node(10, 10, false, 100);
   expect(new Set(diverseV10Candidates(initial, [capture, attack, defend], 3))).toEqual(new Set([capture, attack, defend]));
 });
 it('does not reward an enemy retreat by relocating the operational target', () => {
   const state = createGameState(() => 0.25);
   state.sites.forEach((s) => { s.owner = 1; });
   const unit = state.units.find((u) => u.owner === 1 && u.definitionId !== 'commander')!;
   const evaluator = createV10Evaluator(state);
   const before = evaluator.position(state, unit);
   const changed = structuredClone(state);
   changed.units.find((u) => u.owner === 2 && u.definitionId === 'commander')!.coord = { q: 17, r: 0 };
   expect(evaluator.position(changed, unit)).toBe(before);
 });
it('keeps a holding alternative against the recorded Bone Archer and Grave Knight combination', () => {
  const state = createGameState(() => 0.25);
  state.turnNumber = 15;
  state.players[1].hand = []; state.players[2].hand = [];
  state.units = [
    { id: 'leader', definitionId: 'commander', owner: 1, hp: 7, coord: { q: 9, r: 4 }, moved: false, attacked: false, exhausted: false,
      curses: [{ sourcePlayer: 2, remainingTurns: 1 }, { sourcePlayer: 2, remainingTurns: 2 }] },
    { id: 'enemy', definitionId: 'commander', owner: 2, hp: 10, coord: { q: 17, r: 7 }, moved: false, attacked: false, exhausted: false },
    { id: 'archer', definitionId: 'boneArcher', owner: 2, hp: 1, coord: { q: 12, r: 3 }, moved: false, attacked: false, exhausted: false },
    { id: 'knight', definitionId: 'graveKnight', owner: 2, hp: 5, coord: { q: 13, r: 3 }, moved: false, attacked: false, exhausted: false },
  ];
  state.sites.forEach((s) => { s.owner = 1; });
  const plan = planAiTurnV10(state, { ...options, strategyMaxNodes: 3000, tacticalMaxNodes: 3000 });
  executeAiPlan(state, plan, () => 0.25);
  expect(findUnit(state, 'leader')!.coord).not.toEqual({ q: 11, r: 4 });
  const response = planAiTurnV10(state, { ...options, strategyMaxNodes: 3000, tacticalMaxNodes: 3000 });
  executeAiPlan(state, response, () => 0.25);
  expect(findUnit(state, 'leader')).toBeDefined();
});
