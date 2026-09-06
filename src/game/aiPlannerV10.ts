import type { GameState, PlayerId } from '../data/types';
import { applyAiAction, assessTacticalOutcome, type AiPlan, type AiSearchOptions } from './ai';
import { prepareAiContinuation } from './aiPlanReplay';
import { evaluateStrategicPosition } from './aiEvaluation';
import { createV10Evaluator } from './aiV10Evaluation';
import { diagnostics, finish, LIVE_AI_OPTIONS_V9, merge, sampleV9Information, turnSearch, type Budget } from './aiPlannerV9';

export const LIVE_AI_OPTIONS_V10: Required<AiSearchOptions> = {
  ...LIVE_AI_OPTIONS_V9, candidatePlans: 3, strategyMaxPlanningMs: 650, tacticalMaxPlanningMs: 350,
};
type Candidate = ReturnType<typeof turnSearch>[number];

// Reserve endpoints with different purposes, rather than variations of the highest static score.
export const diverseV10Candidates = (initial: GameState, candidates: Candidate[], count: number): Candidate[] => {
  const actor = initial.currentPlayer;
  const commanderHp = (state: GameState, owner: PlayerId) => state.units.find((u) => u.owner === owner && u.definitionId === 'commander')?.hp ?? 0;
  const enemy = actor === 1 ? 2 : 1;
  const leader = initial.units.find((u) => u.owner === actor && u.definitionId === 'commander');
  const held = (candidate: Candidate) => !leader || candidate.ended.units.some((u) => u.id === leader.id && u.coord.q === leader.coord.q && u.coord.r === leader.coord.r);
  const selections = [
    [...candidates].sort((a, b) => Number(held(b)) - Number(held(a)) || commanderHp(b.ended, actor) - commanderHp(a.ended, actor) || b.score - a.score),
    [...candidates].sort((a, b) => commanderHp(a.ended, enemy) - commanderHp(b.ended, enemy) || b.score - a.score),
    [...candidates].sort((a, b) => b.ended.sites.filter((s) => s.owner === actor).length - a.ended.sites.filter((s) => s.owner === actor).length || b.score - a.score),
  ];
  const result: Candidate[] = [];
  const win = candidates.find((c) => c.ended.winner === actor);
  if (win) result.push(win);
  for (const ranked of selections) if (result.length < count && !result.includes(ranked[0])) result.push(ranked[0]);
  for (const candidate of candidates) if (result.length < count && !result.includes(candidate)) result.push(candidate);
  return result;
};

export const planAiTurnV10 = (initial: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  const options = { ...LIVE_AI_OPTIONS_V10, ...overrides };
  const started = performance.now();
  const deadline = started + options.strategyMaxPlanningMs + options.tacticalMaxPlanningMs;
  const actor = initial.currentPlayer;
  const evaluator = createV10Evaluator(initial);
  const strategy: Budget = { stats: diagnostics(), maxNodes: options.strategyMaxNodes, deadline: started + options.strategyMaxPlanningMs };
  const tactical = diagnostics();
  const candidates = turnSearch(sampleV9Information(initial, actor, 0), evaluator, strategy, options.beamWidth, options.maxDepth, options.candidatePlans * 6, 24, true);
  let responses = 0;
  let deepestReply = 0;
  let continuations = 0;
  const audited = new Map<string, { candidate: Candidate; value: number; worst: GameState; actions: AiPlan['actions']; leaderLost: boolean; checks: number }>();
  const audit = (pool: Candidate[], until: number) => {
    const selected = diverseV10Candidates(initial, pool, options.candidatePlans);
    const pending = selected.filter((c) => !audited.has(JSON.stringify(c.ended)));
    const nodes = Math.floor((options.tacticalMaxNodes - tactical.nodes) / Math.max(1, pending.length * 2));
    for (const candidate of pending) {
      if (performance.now() >= until || nodes <= 0) break;
      const entry = { candidate, value: candidate.score, worst: candidate.ended, actions: [] as AiPlan['actions'], leaderLost: false, checks: 0 };
      const values: number[] = [];
      for (let sample = 0; sample < 2 && performance.now() < until; sample++) {
        const world = sampleV9Information(initial, actor, sample);
        for (const action of candidate.actions) if (!applyAiAction(world, action).ok) throw new Error('V10 information-set replay failed.');
        const after = finish(world);
        if (after.winner) { values.push(evaluator.evaluate(after, actor)); entry.checks++; break; }
        if (sample === 0) { after.players[after.currentPlayer].hand = []; after.players[after.currentPlayer].deck = []; }
        const sliceEnd = Math.min(until, performance.now() + Math.max(0, until - performance.now()) / Math.max(1, (pending.length * 2 - responses % (pending.length * 2))));
        const budget: Budget = { stats: diagnostics(), maxNodes: Math.floor(nodes * 0.75), deadline: sliceEnd };
        const replyEvaluator = sample === 0 ? { ...evaluator, evaluate: (state: GameState, player: PlayerId) => evaluator.evaluate(state, player)
          - (state.units.find((u) => u.owner === actor && u.definitionId === 'commander')?.hp ?? 0) * 600 } : evaluator;
        const reply = turnSearch(after, replyEvaluator, budget, options.responseBeamWidth, options.responseDepth, 1, 8)[0];
        merge(tactical, budget.stats); responses++; deepestReply = Math.max(deepestReply, reply.actions.length);
        let value = evaluator.evaluate(reply.ended, actor);
        entry.leaderLost ||= initial.units.some((u) => u.owner === actor && u.definitionId === 'commander')
          && !reply.ended.units.some((u) => u.owner === actor && u.definitionId === 'commander');
        if (entry.checks === 0 || value < evaluator.evaluate(entry.worst, actor)) { entry.worst = reply.ended; entry.actions = reply.actions; }
        // Our known hand only: speculative future draws must not justify an exchange.
        if (!reply.ended.winner && performance.now() < sliceEnd) {
          const next = structuredClone(reply.ended);
          next.players[actor].hand = [...world.players[actor].hand];
          const continuation: Budget = { stats: diagnostics(), maxNodes: nodes - budget.stats.nodes, deadline: sliceEnd };
          const ownReply = turnSearch(next, evaluator, continuation, 1, options.responseDepth, 1, 6)[0];
          merge(tactical, continuation.stats); continuations++;
          value = value * 0.6 + evaluator.evaluate(ownReply.ended, actor) * 0.4;
        }
        values.push(value); entry.checks++;
      }
      if (values.length) {
        entry.value = Math.min(...values) * 0.7 + values.reduce((a, b) => a + b, 0) / values.length * 0.3;
        audited.set(JSON.stringify(candidate.ended), entry);
      }
    }
  };
  audit(candidates, Math.min(deadline, performance.now() + options.tacticalMaxPlanningMs * 0.65));
  // Reclaim unused response time for a wider strategic pass, reserving time to verify new endpoints.
  const remaining = deadline - performance.now();
  if (remaining > 50 && strategy.stats.nodes < options.strategyMaxNodes && tactical.nodes < options.tacticalMaxNodes) {
    const refinement: Budget = { stats: diagnostics(), maxNodes: options.strategyMaxNodes - strategy.stats.nodes, deadline: performance.now() + remaining * 0.55 };
    const extra = turnSearch(sampleV9Information(initial, actor, 0), evaluator, refinement, options.beamWidth + 2, options.maxDepth, options.candidatePlans * 6, 24, true);
    merge(strategy.stats, refinement.stats);
    candidates.push(...extra);
  }
  audit(candidates, deadline);
  const ranked = [...audited.values()].sort((a, b) => {
    const winA = a.candidate.ended.winner === actor, winB = b.candidate.ended.winner === actor;
    return Number(winB) - Number(winA) || Number(a.leaderLost) - Number(b.leaderLost) || b.value - a.value;
  });
  const best = ranked[0];
  const chosen = best?.candidate ?? candidates[0];
  const assessment = assessTacticalOutcome(initial, best?.worst ?? chosen.ended, actor, best?.actions ?? []);
  if (!chosen.ended.winner) assessment.tier = 'unsafe';
  return {
    actions: chosen.actions, expectedStates: prepareAiContinuation(initial, chosen.actions),
    strategic: evaluateStrategicPosition(chosen.ended, actor), tactical: assessment,
    diagnostics: { strategy: strategy.stats, tactical, planner: 'v10-held-control',
      candidatesGenerated: candidates.length, candidatesAfterDeduplication: new Set(candidates.map((c) => JSON.stringify(c.ended))).size,
      tacticalCandidatesAssessed: audited.size, responseSequencesChecked: responses, deepestReply, continuations,
    } as AiPlan['diagnostics'],
  };
};
