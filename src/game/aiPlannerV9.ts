import { CARD_DEFINITIONS, FACTION_DECKS } from '../data/cards';
import type { GameState, PlayerId } from '../data/types';
import { GAME_ACTION_KINDS, getLegalGameActions } from './actions';
import { applyAiAction, assessTacticalOutcome, type AiAction, type AiPlan, type AiSearchOptions, type ActionKindCounts, type SearchPhaseDiagnostics } from './ai';
import { evaluateStrategicPosition } from './aiEvaluation';
import { createV9Evaluator } from './aiV9Evaluation';
import { prepareAiContinuation } from './aiPlanReplay';
import { endTurn, findUnit, hexDistance, sameCoord, unitDefinition } from './engine';

export const LIVE_AI_OPTIONS_V9: Required<AiSearchOptions> = {
  beamWidth: 5, maxDepth: 24, candidatePlans: 5,
  strategyMaxNodes: 7_200, strategyMaxPlanningMs: 650,
  responseBeamWidth: 3, responseDepth: 16,
  tacticalMaxNodes: 3_000, tacticalMaxPlanningMs: 350,
};
export const getBrowserAiSearchOptions = () => ({ ...LIVE_AI_OPTIONS_V9 });
const now = () => performance.now();
const counts = () => Object.fromEntries(GAME_ACTION_KINDS.map((kind) => [kind, 0])) as unknown as ActionKindCounts;
const diagnostics = (): SearchPhaseDiagnostics => ({ nodes: 0, stopReason: 'complete', legalActions: 0, retainedActions: 0, legalByKind: counts(), retainedByKind: counts() });
export interface Budget { stats: SearchPhaseDiagnostics; maxNodes: number; deadline: number }
const exhausted = (budget: Budget): boolean => {
  if (budget.stats.nodes >= budget.maxNodes) { budget.stats.stopReason = 'node-limit'; return true; }
  if (now() >= budget.deadline) { budget.stats.stopReason = 'time-limit'; return true; }
  return false;
};
export const v9StateKey = (state: GameState): string => JSON.stringify(state);

// No inaccessible card identities or order enter search, evaluation, hashing or RNG seeds.
export const sampleV9Information = (initial: GameState, perspective: PlayerId, sample: number): GameState => {
  const state = structuredClone(initial);
  let seed = (initial.turnNumber * 1664525 + sample * 1013904223 + perspective) >>> 0;
  for (const player of [1, 2] as const) {
    const runtime = state.players[player];
    const known = [...runtime.discard, ...(player === perspective ? runtime.hand : [])];
    const pool: string[] = [...FACTION_DECKS[runtime.faction]];
    for (const card of known) {
      const index = pool.indexOf(card);
      if (index >= 0) pool.splice(index, 1);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (player !== perspective) runtime.hand = pool.splice(0, runtime.hand.length);
    runtime.deck = pool.slice(0, runtime.deck.length);
  }
  return state;
};

interface Node { state: GameState; ended: GameState; actions: AiAction[]; score: number }
type Evaluator = ReturnType<typeof createV9Evaluator>;
const finish = (state: GameState): GameState => {
  const ended = structuredClone(state);
  if (!ended.winner) endTurn(ended, () => 0.5);
  return ended;
};

export const selectV9Actions = (state: GameState, evaluator: Evaluator, limit = 24): { legal: AiAction[]; actions: AiAction[] } => {
  const actor = state.currentPlayer;
  const legal = getLegalGameActions(state);
  const priority = (action: AiAction): number => {
    const unit = 'unitId' in action ? findUnit(state, action.unitId) : undefined;
    if (action.kind === 'move' && unit) {
      const moved = { ...unit, coord: action.destination };
      let value = evaluator.position(state, moved) - evaluator.position(state, unit);
      for (const site of state.sites.filter((site) => site.owner !== actor)) {
        value = Math.max(value, (evaluator.travel(state, unit, site.coord) - evaluator.travel(state, moved, site.coord)) * 150);
        if (sameCoord(action.destination, site.coord)) value += 600;
      }
      const d = unitDefinition(unit);
      const targets = state.units.filter((other) => other.owner !== actor);
      if (!d.traits.includes('SetShot') && !unit.attacked) value += Math.max(0, ...targets.map((other) =>
        hexDistance(action.destination, other.coord) <= d.range ? d.attack * 150 + (other.hp <= d.attack ? 200 : 0) : 0));
      if (state.sites.some((site) => site.owner === actor && site.type !== 'well' && sameCoord(site.coord, unit.coord))) value += 220;
      return value;
    }
    if (action.kind === 'attack') {
      const target = findUnit(state, action.targetId)!;
      return 700 + (target.definitionId === 'commander' ? 1_000 : evaluator.unitValue(target) * 0.4);
    }
    if (action.kind === 'summon') return 500 + CARD_DEFINITIONS[action.cardId].cost * 40;
    if (action.kind === 'invoke') return 550;
    if (action.kind === 'thunder') return state.units.reduce((sum, other) => sum + (hexDistance(other.coord, action.destination) <= 1
      ? (other.owner === actor ? -1 : 1) * (other.hp <= 1 ? evaluator.unitValue(other) : 150) : 0), 0);
    if (action.kind === 'tactic' && 'destination' in action) {
      const nearest = Math.min(20, ...state.units.map((other) => hexDistance(other.coord, action.destination)));
      return 150 - nearest * 30 + (state.units.some((other) => other.owner !== actor && sameCoord(other.coord, action.destination)) ? 400 : 0);
    }
    return 400;
  };
  const ranked = legal.map((action) => ({ action, score: priority(action) })).sort((a, b) => b.score - a.score).map(({ action }) => action);
  const actions: AiAction[] = [];
  const selected = new Set<AiAction>();
  const groups = new Set<string>();
  const add = (action: AiAction) => { if (!selected.has(action) && actions.length < limit) { actions.push(action); selected.add(action); } };
  // Reserve actual expansions before backfill. Each unit/action-kind or card gets a representative.
  for (const action of ranked) {
    const group = `${action.kind}:${'unitId' in action ? action.unitId : action.cardId}`;
    if (groups.has(group)) continue;
    groups.add(group); add(action);
  }
  for (const action of ranked) add(action);
  return { legal, actions };
};

const turnSearch = (initial: GameState, evaluator: Evaluator, budget: Budget, width: number, depth: number, count: number, actionLimit = 24, retainCommanderHold = false): Node[] => {
  const actor = initial.currentPlayer;
  const leader = initial.units.find((u) => u.owner === actor && u.definitionId === 'commander');
  const retainsLeader = (node: Node) => !leader || node.ended.units.some((u) => u.id === leader.id && sameCoord(u.coord, leader.coord));
  let holding: Node | undefined;
  const ended = finish(initial);
  const root: Node = { state: initial, ended, actions: [], score: evaluator.evaluate(ended, actor) };
  holding = root;
  let beam = [root];
  const completed = new Map<string, Node>([[v9StateKey(ended), root]]);
  const visited = new Set([v9StateKey(initial)]);
  for (let step = 0; step < depth && beam.length && !exhausted(budget); step++) {
    const next: Node[] = [];
    for (const node of beam) {
      if (exhausted(budget)) break;
      if (node.state.winner) continue;
      const selection = selectV9Actions(node.state, evaluator, actionLimit);
      budget.stats.legalActions += selection.legal.length;
      budget.stats.retainedActions += selection.actions.length;
      for (const action of selection.legal) budget.stats.legalByKind[action.kind]++;
      for (const action of selection.actions) budget.stats.retainedByKind[action.kind]++;
      for (const action of selection.actions) {
        if (exhausted(budget)) break;
        const child = structuredClone(node.state);
        if (!applyAiAction(child, action).ok) throw new Error('V9 generated an illegal action.');
        budget.stats.nodes++;
        const key = v9StateKey(child);
        if (visited.has(key)) continue;
        visited.add(key);
        const endedChild = finish(child);
        const candidate = { state: child, ended: endedChild, actions: [...node.actions, action], score: evaluator.evaluate(endedChild, actor) };
        if (retainCommanderHold && retainsLeader(candidate) && candidate.score > holding!.score) holding = candidate;
        next.push(candidate);
        const endKey = v9StateKey(endedChild);
        const previous = completed.get(endKey);
        if (!previous || previous.actions.length > candidate.actions.length) completed.set(endKey, candidate);
      }
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, Math.max(1, width));
    // Bound retained endpoints while retaining the explicit end-turn choice.
    if (completed.size > count * 20) {
      const best = [...completed.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, count * 10);
      completed.clear(); for (const [key, node] of best) completed.set(key, node);
    }
  }
  const result = [...completed.values()].sort((a, b) => b.score - a.score || a.actions.length - b.actions.length).slice(0, count);
  if (retainCommanderHold && holding && !result.includes(holding)) result.push(holding);
  return result;
};

export const planAiTurnV9 = (initial: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  const options = { ...LIVE_AI_OPTIONS_V9, ...overrides };
  const actor = initial.currentPlayer;
  const evaluator = createV9Evaluator();
  const strategy: Budget = { stats: diagnostics(), maxNodes: options.strategyMaxNodes, deadline: now() + options.strategyMaxPlanningMs };
  const state = sampleV9Information(initial, actor, 0);
  const candidates = turnSearch(state, evaluator, strategy, options.beamWidth, options.maxDepth, options.candidatePlans);
  const tactical: Budget = { stats: diagnostics(), maxNodes: options.tacticalMaxNodes, deadline: now() + options.tacticalMaxPlanningMs };
  let best = candidates[0];
  let bestValue = -Infinity;
  let worstState = best.ended;
  let worstActions: AiAction[] = [];
  let audited = 0;
  let responses = 0;
  // Equal budgets and common information samples make candidate comparisons reproducible.
  for (const candidate of candidates) {
    if (candidate.ended.winner === actor) { best = candidate; worstState = candidate.ended; worstActions = []; break; }
    if (exhausted(tactical)) break;
    const maxNodes = Math.floor(options.tacticalMaxNodes / candidates.length);
    const local: Budget = { stats: diagnostics(), maxNodes, deadline: Math.min(tactical.deadline, now() + options.tacticalMaxPlanningMs / candidates.length) };
    const values: number[] = [];
    let candidateWorst = candidate.ended;
    let candidateWorstActions: AiAction[] = [];
    let lowest = Infinity;
    for (let sample = 0; sample < 2 && !exhausted(local); sample++) {
      const world = sampleV9Information(initial, actor, sample);
      for (const action of candidate.actions) {
        if (!applyAiAction(world, action).ok) throw new Error('V9 information sample changed a known action.');
      }
      const after = finish(world);
      const responseBudget: Budget = { stats: diagnostics(), maxNodes: Math.floor(maxNodes * 0.35), deadline: local.deadline };
      const replyWidth = Math.max(1, Math.min(options.responseBeamWidth, Math.floor(responseBudget.maxNodes / (6 * options.responseDepth))));
      const replies = after.winner ? [] : turnSearch(after, evaluator, responseBudget, replyWidth, options.responseDepth, 1, 6);
      merge(local.stats, responseBudget.stats);
      const reply = replies[0];
      const responseState = reply?.ended ?? after;
      let value = evaluator.evaluate(responseState, actor);
      // One shared known-hand continuation: sampled new draws are withheld from our reply.
      if (!responseState.winner && responseState.currentPlayer === actor && !exhausted(local)) {
        const continuation = structuredClone(responseState);
        continuation.players[actor].hand = [...candidate.state.players[actor].hand];
        const continuationBudget: Budget = { stats: diagnostics(), maxNodes: Math.floor(maxNodes * 0.15), deadline: local.deadline };
        const next = turnSearch(continuation, evaluator, continuationBudget, 1, options.responseDepth, 1, 6)[0];
        merge(local.stats, continuationBudget.stats);
        const nextValue = evaluator.evaluate(next.ended, actor);
        value = responseState.winner ? value : value * 0.65 + nextValue * 0.35;
      }
      values.push(value); responses++;
      if (value < lowest) { lowest = value; candidateWorst = responseState; candidateWorstActions = reply?.actions ?? []; }
    }
    merge(tactical.stats, local.stats);
    if (!values.length) continue;
    audited++;
    const value = Math.min(...values) * 0.6 + values.reduce((sum, value) => sum + value, 0) / values.length * 0.4;
    if (value > bestValue) { bestValue = value; best = candidate; worstState = candidateWorst; worstActions = candidateWorstActions; }
  }
  const assessment = assessTacticalOutcome(initial, worstState, actor, worstActions);
  // Finite selective replies establish no proof of a forced outcome except a committed terminal.
  if (!best.ended.winner && (assessment.tier === 'forced-win' || assessment.tier === 'forced-loss')) assessment.tier = 'unsafe';
  if (!best.ended.winner && audited === 0) assessment.tier = 'unsafe';
  return {
    actions: best.actions,
    expectedStates: prepareAiContinuation(initial, best.actions),
    strategic: evaluateStrategicPosition(best.ended, actor), tactical: assessment,
    diagnostics: { strategy: strategy.stats, tactical: tactical.stats, planner: 'v9-adversarial', candidatesGenerated: candidates.length,
      candidatesAfterDeduplication: candidates.length, tacticalCandidatesAssessed: audited, responseSequencesChecked: responses } as AiPlan['diagnostics'],
  };
};

const merge = (target: SearchPhaseDiagnostics, source: SearchPhaseDiagnostics) => {
  target.nodes += source.nodes; target.legalActions += source.legalActions; target.retainedActions += source.retainedActions;
  for (const kind of GAME_ACTION_KINDS) { target.legalByKind[kind] += source.legalByKind[kind]; target.retainedByKind[kind] += source.retainedByKind[kind]; }
  if (source.stopReason === 'time-limit' || target.stopReason === 'complete') target.stopReason = source.stopReason;
};

export { turnSearch, finish, diagnostics, merge };
