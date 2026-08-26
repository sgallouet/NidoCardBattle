import { CARD_DEFINITIONS } from '../data/cards';
import type { GameState, PlayerId, UnitState } from '../data/types';
import { GAME_ACTION_KINDS } from './actions';
import {
  COMMON_AI_OPTIONS,
  applyAiAction,
  assessTacticalOutcome,
  selectCandidateActions,
  type ActionKindCounts,
  type AiAction,
  type AiPlan,
  type AiSearchOptions,
  type SearchPhaseDiagnostics,
  type SearchStopReason,
  type TacticalAssessment,
} from './ai';
import {
  evaluateStrategicPosition,
  strategicUnitValue,
  type StrategicEvaluation,
} from './aiEvaluation';
import {
  endTurn,
  findUnit,
  hexDistance,
  terrainAt,
  unitDefinition,
} from './engine';

/**
 * The original 35/20 ms clocks were smaller than legal-action generation on real matches.
 * Planning runs in a Worker in normal browsers, so this remains mobile-safe while giving the
 * search enough wall-clock time to finish elementary two/three-action turns.
 */
export const LIVE_AI_OPTIONS_V2: Required<AiSearchOptions> = {
  ...COMMON_AI_OPTIONS,
  beamWidth: 8,
  maxDepth: 6,
  strategyMaxNodes: 2_600,
  strategyMaxPlanningMs: 160,
  candidatePlans: 4,
  responseBeamWidth: 5,
  responseDepth: 3,
  tacticalMaxNodes: 1_200,
  tacticalMaxPlanningMs: 120,
};

interface V2Diagnostics {
  strategy: SearchPhaseDiagnostics;
  tactical: SearchPhaseDiagnostics;
  strategyCompletedDepth: number;
  tacticalCompletedDepth: number;
  assessedCandidates: number;
  unassessedCandidates: number;
  planner: 'v2-iterative';
}

interface SearchNode {
  state: GameState;
  actions: AiAction[];
  score: number;
}

interface CompletedPlan extends SearchNode {
  endedState: GameState;
}

interface SearchResult {
  plans: CompletedPlan[];
  diagnostics: SearchPhaseDiagnostics;
  completedDepth: number;
  rootHadActions: boolean;
}

interface SearchBudget {
  deadline: number;
  maxNodes: number;
  nodes: number;
  stopReason: SearchStopReason;
  legalActions: number;
  retainedActions: number;
  legalByKind: ActionKindCounts;
  retainedByKind: ActionKindCounts;
}

interface AssessedCandidate {
  candidate: CompletedPlan;
  strategic: StrategicEvaluation;
  tactical: TacticalAssessment;
  responseDepth: number;
  assessed: boolean;
}

const nowMs = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const cloneState = (state: GameState): GameState => typeof structuredClone === 'function'
  ? structuredClone(state)
  : JSON.parse(JSON.stringify(state)) as GameState;
const opponentOf = (player: PlayerId): PlayerId => player === 1 ? 2 : 1;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const sameCoord = (a: { q: number; r: number }, b: { q: number; r: number }): boolean => a.q === b.q && a.r === b.r;

const emptyCounts = (): ActionKindCounts => ({
  summon: 0,
  tactic: 0,
  move: 0,
  attack: 0,
  displace: 0,
  rally: 0,
  soulLink: 0,
  curse: 0,
  invoke: 0,
});

const emptyDiagnostics = (): SearchPhaseDiagnostics => ({
  nodes: 0,
  stopReason: 'complete',
  legalActions: 0,
  retainedActions: 0,
  legalByKind: emptyCounts(),
  retainedByKind: emptyCounts(),
});

const createBudget = (maxNodes: number, maxMs: number): SearchBudget => ({
  deadline: nowMs() + maxMs,
  maxNodes,
  nodes: 0,
  stopReason: 'complete',
  legalActions: 0,
  retainedActions: 0,
  legalByKind: emptyCounts(),
  retainedByKind: emptyCounts(),
});

const budgetExhausted = (budget: SearchBudget): boolean => {
  if (budget.nodes >= budget.maxNodes) {
    if (budget.stopReason === 'complete') budget.stopReason = 'node-limit';
    return true;
  }
  if (nowMs() >= budget.deadline) {
    budget.stopReason = 'time-limit';
    return true;
  }
  return false;
};

const budgetDiagnostics = (budget: SearchBudget): SearchPhaseDiagnostics => ({
  nodes: budget.nodes,
  stopReason: budget.stopReason,
  legalActions: budget.legalActions,
  retainedActions: budget.retainedActions,
  legalByKind: { ...budget.legalByKind },
  retainedByKind: { ...budget.retainedByKind },
});

const mergeDiagnostics = (target: SearchPhaseDiagnostics, source: SearchPhaseDiagnostics): void => {
  target.nodes += source.nodes;
  target.legalActions += source.legalActions;
  target.retainedActions += source.retainedActions;
  for (const kind of GAME_ACTION_KINDS) {
    target.legalByKind[kind] += source.legalByKind[kind];
    target.retainedByKind[kind] += source.retainedByKind[kind];
  }
  if (source.stopReason === 'time-limit') target.stopReason = 'time-limit';
  else if (source.stopReason === 'node-limit' && target.stopReason === 'complete') target.stopReason = 'node-limit';
};

const stateSignature = (state: GameState, includeHand: boolean): string => {
  const units = state.units
    .map((unit) => [
      unit.id,
      unit.owner,
      unit.definitionId,
      unit.coord.q,
      unit.coord.r,
      unit.hp,
      unit.exhausted ? 1 : 0,
      unit.moved ? 1 : 0,
      unit.attacked ? 1 : 0,
      unit.movementSpent ?? 0,
      unit.moveBonus ?? 0,
      unit.soulLinkTargetId ?? '',
      unit.curseTurns ?? 0,
    ].join(':'))
    .sort()
    .join('|');
  const sites = state.sites.map((site) => `${site.id}:${site.owner ?? 0}`).sort().join('|');
  const player = state.players[state.currentPlayer];
  return [
    state.currentPlayer,
    player.mana,
    includeHand ? player.hand.join(',') : '',
    units,
    sites,
    state.tileEffects.map((effect) => JSON.stringify(effect)).sort().join('|'),
    state.builtBridges.map((coord) => `${coord.q},${coord.r}`).sort().join('|'),
    state.scorchedForests.map((coord) => `${coord.q},${coord.r}`).sort().join('|'),
    `${state.countdown?.player ?? 0}:${state.countdown?.checkpoints ?? 0}`,
    state.winner ?? 0,
  ].join(';');
};

const controlledDeploymentSites = (state: GameState, player: PlayerId) =>
  state.sites.filter((site) => site.owner === player && (site.type === 'keep' || site.type === 'fort'));

const freeDeploymentSites = (state: GameState, player: PlayerId): number =>
  controlledDeploymentSites(state, player).filter((site) =>
    !state.units.some((unit) => sameCoord(unit.coord, site.coord))).length;

const blockedDeploymentSites = (state: GameState, player: PlayerId): number =>
  controlledDeploymentSites(state, player).filter((site) =>
    state.units.some((unit) => unit.owner === player && sameCoord(unit.coord, site.coord))).length;

const invadedDeploymentSites = (state: GameState, player: PlayerId): number =>
  controlledDeploymentSites(state, player).filter((site) =>
    state.units.some((unit) => unit.owner !== player && sameCoord(unit.coord, site.coord))).length;

const playableUnitCardCount = (state: GameState, player: PlayerId): number => {
  const runtime = state.players[player];
  return runtime.hand.filter((rawId) => {
    const card = CARD_DEFINITIONS[rawId as keyof typeof CARD_DEFINITIONS];
    return card?.type === 'unit' && card.cost <= runtime.mana;
  }).length;
};

const oneTurnLethalExposure = (state: GameState, player: PlayerId): number => {
  const opponent = opponentOf(player);
  let exposedValue = 0;
  for (const target of state.units) {
    if (target.owner !== player || target.definitionId === 'commander') continue;
    const threatened = state.units.some((attacker) => {
      if (attacker.owner !== opponent || attacker.exhausted) return false;
      const definition = unitDefinition(attacker);
      const hillRange = definition.range > 1 && terrainAt(attacker.coord) === 'hill' ? 1 : 0;
      const reach = definition.move + definition.range + hillRange;
      return definition.attack >= target.hp && hexDistance(attacker.coord, target.coord) <= reach;
    });
    if (threatened) exposedValue += strategicUnitValue(target);
  }
  return exposedValue;
};

/**
 * Keeps the explainable six-component evaluation but repairs the strongest passive incentives:
 * hoarding cards, blocking the only deployment site, and leaving valuable units in visible one-hit danger.
 */
const evaluateV2 = (state: GameState, perspective: PlayerId): StrategicEvaluation => {
  const base = evaluateStrategicPosition(state, perspective);
  if (Math.abs(base.outlook) >= 100) return base;
  const opponent = opponentOf(perspective);
  const components = { ...base.components };

  const ownFree = freeDeploymentSites(state, perspective);
  const enemyFree = freeDeploymentSites(state, opponent);
  const ownBlocked = blockedDeploymentSites(state, perspective);
  const enemyBlocked = blockedDeploymentSites(state, opponent);
  const ownInvaded = invadedDeploymentSites(state, perspective);
  const enemyInvaded = invadedDeploymentSites(state, opponent);
  const ownPlayableUnits = playableUnitCardCount(state, perspective);

  const deploymentDelta = (ownFree - enemyFree) * 2.5
    - (ownBlocked - enemyBlocked) * 2.2
    - (ownInvaded - enemyInvaded) * 5.5;
  const deploymentEmergency = ownFree === 0 && ownPlayableUnits > 0 ? -7 : 0;
  const handHoardingCorrection = -Math.min(4.5, state.players[perspective].hand.length * 0.75);
  const bankedPlayableMana = state.currentPlayer === perspective && ownPlayableUnits > 0
    ? -Math.min(5, state.players[perspective].mana * 0.55)
    : 0;
  components.economy = clamp(
    components.economy + deploymentDelta + deploymentEmergency + handHoardingCorrection + bankedPlayableMana,
    -20,
    20,
  );

  const exposureDelta = oneTurnLethalExposure(state, perspective) - oneTurnLethalExposure(state, opponent);
  components.position = clamp(
    components.position - clamp(exposureDelta / 420, -10, 10) - ownInvaded * 3 + enemyInvaded * 3,
    -24,
    24,
  );

  const outlook = clamp(Object.values(components).reduce((sum, value) => sum + value, 0), -100, 100);
  return { outlook, components };
};

const actionSequenceUtility = (
  initial: GameState,
  state: GameState,
  actions: AiAction[],
  actor: PlayerId,
): number => {
  if (actions.length === 0) return -3;
  const manaSpent = Math.max(0, initial.players[actor].mana - state.players[actor].mana);
  const freedDeployment = Math.max(0, freeDeploymentSites(state, actor) - freeDeploymentSites(initial, actor));
  const capturesThreatened = state.sites.filter((site) => site.owner !== actor
    && state.units.some((unit) => unit.owner === actor && sameCoord(unit.coord, site.coord))).length;
  const meaningful = actions.reduce((total, action) => total
    + (action.kind === 'attack' ? 1.5 : 0)
    + (action.kind === 'summon' ? 1.1 : 0)
    + (action.kind === 'tactic' ? 0.6 : 0)
    + (action.kind === 'invoke' ? 0.8 : 0), 0);
  return Math.min(8, actions.length * 0.65 + manaSpent * 0.8 + meaningful + freedDeployment * 3 + capturesThreatened * 1.5);
};

const actionPriority = (state: GameState, actor: PlayerId, action: AiAction): number => {
  const opponent = opponentOf(actor);
  if (action.kind === 'attack') {
    const attacker = findUnit(state, action.unitId);
    const target = findUnit(state, action.targetId);
    if (!attacker || !target) return -100_000;
    const lethal = unitDefinition(attacker).attack >= target.hp;
    return (target.definitionId === 'commander' ? 100_000 : 0)
      + (lethal ? 12_000 : 0)
      + strategicUnitValue(target);
  }
  if (action.kind === 'move') {
    const unit = findUnit(state, action.unitId);
    if (!unit) return -100_000;
    const deploymentSite = controlledDeploymentSites(state, actor).find((site) => sameCoord(site.coord, unit.coord));
    const freesBlockedSite = deploymentSite && playableUnitCardCount(state, actor) > 0 ? 9_000 : 0;
    const capture = state.sites.some((site) => site.owner !== actor && sameCoord(site.coord, action.destination)) ? 4_500 : 0;
    const enemyCommander = state.units.find((candidate) => candidate.owner === opponent && candidate.definitionId === 'commander');
    const approach = enemyCommander
      ? (hexDistance(unit.coord, enemyCommander.coord) - hexDistance(action.destination, enemyCommander.coord)) * 320
      : 0;
    const definition = unitDefinition(unit);
    const setsUpAttack = state.units.some((target) => target.owner === opponent
      && hexDistance(action.destination, target.coord) <= definition.range) ? 2_800 : 0;
    return freesBlockedSite + capture + setsUpAttack + approach;
  }
  if (action.kind === 'summon') {
    const card = CARD_DEFINITIONS[action.cardId];
    const enemyCommander = state.units.find((candidate) => candidate.owner === opponent && candidate.definitionId === 'commander');
    const approach = enemyCommander ? Math.max(0, 12 - hexDistance(action.destination, enemyCommander.coord)) * 80 : 0;
    return 3_000 + card.cost * 420 + approach;
  }
  if (action.kind === 'tactic') return 2_300;
  if (action.kind === 'invoke') return 2_500;
  return 1_900;
};

/** Smaller search frontier, after engine-owned legal generation, with every action family kept represented. */
const selectV2Actions = (
  state: GameState,
  actor: PlayerId,
  includeCards: boolean,
  budget: SearchBudget,
): AiAction[] => {
  const selection = selectCandidateActions(state, actor, includeCards);
  budget.legalActions += selection.stats.legalActions;
  for (const kind of GAME_ACTION_KINDS) budget.legalByKind[kind] += selection.stats.legalByKind[kind];

  const ranked = [...selection.actions].sort((a, b) => actionPriority(state, actor, b) - actionPriority(state, actor, a));
  const caps: Record<AiAction['kind'], number> = {
    attack: 10,
    move: 10,
    summon: 6,
    tactic: 4,
    displace: 3,
    rally: 2,
    soulLink: 2,
    curse: 3,
    invoke: 3,
  };
  const counts = emptyCounts();
  const retained: AiAction[] = [];
  for (const action of ranked) {
    if (retained.length >= 34) break;
    if (counts[action.kind] >= caps[action.kind]) continue;
    retained.push(action);
    counts[action.kind] += 1;
  }

  // One move per movable unit is guaranteed when possible; this prevents attack/card density
  // from crowding out "move blocker -> summon" and "move -> attack" sequences.
  const moveUnits = new Set(retained.filter((action) => action.kind === 'move').map((action) => action.unitId));
  for (const action of ranked) {
    if (action.kind !== 'move' || moveUnits.has(action.unitId) || retained.length >= 38) continue;
    retained.push(action);
    moveUnits.add(action.unitId);
    counts.move += 1;
  }

  budget.retainedActions += retained.length;
  for (const kind of GAME_ACTION_KINDS) budget.retainedByKind[kind] += counts[kind];
  return retained;
};

const finishTurn = (state: GameState, actor: PlayerId): GameState => {
  const ended = cloneState(state);
  if (!ended.winner && ended.currentPlayer === actor) endTurn(ended, () => 0.5);
  return ended;
};

const iterativeTurnSearch = (
  initialState: GameState,
  actor: PlayerId,
  perspective: PlayerId,
  includeCards: boolean,
  maximize: boolean,
  beamWidth: number,
  maxDepth: number,
  planCount: number,
  budget: SearchBudget,
): SearchResult => {
  const root = cloneState(initialState);
  const rootScore = evaluateV2(root, perspective).outlook;
  let beam: SearchNode[] = [{ state: root, actions: [], score: rootScore }];
  let completedDepth = 0;
  let rootHadActions = false;
  let bestCompleted: CompletedPlan[] = [];
  const visited = new Map<string, number>([[stateSignature(root, includeCards), rootScore]]);

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    if (budgetExhausted(budget) || beam.length === 0) break;
    const next: SearchNode[] = [];
    let depthCompleted = true;

    for (const node of beam) {
      if (budgetExhausted(budget)) {
        depthCompleted = false;
        break;
      }
      const actions = selectV2Actions(node.state, actor, includeCards, budget);
      if (depth === 1 && node.actions.length === 0) rootHadActions = actions.length > 0;

      for (const action of actions) {
        if (budgetExhausted(budget)) {
          depthCompleted = false;
          break;
        }
        const child = cloneState(node.state);
        const result = applyAiAction(child, action);
        if (!result.ok) continue;
        budget.nodes += 1;
        const utility = actionSequenceUtility(initialState, child, [...node.actions, action], actor);
        const perspectiveUtility = actor === perspective ? utility : -utility;
        const score = evaluateV2(child, perspective).outlook + perspectiveUtility;
        const signature = stateSignature(child, includeCards);
        const previous = visited.get(signature);
        const better = previous === undefined || (maximize ? score > previous : score < previous);
        if (!better) continue;
        visited.set(signature, score);
        next.push({ state: child, actions: [...node.actions, action], score });
      }
      if (!depthCompleted) break;
    }

    if (!depthCompleted) break;
    next.sort((a, b) => maximize ? b.score - a.score : a.score - b.score);
    beam = next.slice(0, beamWidth);
    completedDepth = depth;

    const finished = beam.map((node) => {
      const endedState = finishTurn(node.state, actor);
      const utility = actionSequenceUtility(initialState, node.state, node.actions, actor);
      const perspectiveUtility = actor === perspective ? utility : -utility;
      return {
        ...node,
        endedState,
        score: evaluateV2(endedState, perspective).outlook + perspectiveUtility,
      };
    });
    bestCompleted = [...bestCompleted, ...finished]
      .sort((a, b) => maximize ? b.score - a.score : a.score - b.score)
      .slice(0, Math.max(planCount * 3, beamWidth));
  }

  if (bestCompleted.length === 0) {
    const endedState = finishTurn(root, actor);
    bestCompleted = [{ state: root, actions: [], score: evaluateV2(endedState, perspective).outlook - 6, endedState }];
  }

  bestCompleted.sort((a, b) => maximize ? b.score - a.score : a.score - b.score);
  return {
    plans: bestCompleted.slice(0, planCount),
    diagnostics: budgetDiagnostics(budget),
    completedDepth,
    rootHadActions,
  };
};

const material = (state: GameState, player: PlayerId): number => state.units
  .filter((unit) => unit.owner === player)
  .reduce((sum, unit) => sum + strategicUnitValue(unit), 0);

const makeUnassessedTactical = (state: GameState, perspective: PlayerId): TacticalAssessment => {
  const base = assessTacticalOutcome(state, state, perspective, []);
  return {
    ...base,
    tier: base.tier === 'forced-win' ? 'forced-win' : 'unsafe',
    score: base.tier === 'forced-win' ? base.score : -85,
    worstResponse: [],
    worstResponseStrategicOutlook: base.tier === 'forced-win' ? base.worstResponseStrategicOutlook : -100,
  };
};

const strengthenTacticalTier = (
  candidateState: GameState,
  responseState: GameState,
  perspective: PlayerId,
  assessment: TacticalAssessment,
): TacticalAssessment => {
  if (assessment.tier !== 'safe') return assessment;
  const lostMaterial = material(candidateState, perspective) - material(responseState, perspective);
  const lostUnit = candidateState.units.some((unit) => unit.owner === perspective
    && unit.definitionId !== 'commander'
    && !responseState.units.some((after) => after.id === unit.id));
  if (!lostUnit || lostMaterial < 240) return assessment;
  return {
    ...assessment,
    tier: 'unsafe',
    score: Math.min(-18, assessment.score - Math.min(55, lostMaterial / 20)),
  };
};

const tacticalRank = (assessment: TacticalAssessment): number => {
  if (assessment.tier === 'forced-win') return 3;
  if (assessment.tier === 'safe') return 2;
  if (assessment.tier === 'unsafe') return 1;
  return 0;
};

const compareResponses = (
  left: { plan: CompletedPlan; tactical: TacticalAssessment },
  right: { plan: CompletedPlan; tactical: TacticalAssessment },
): number => {
  const rank = tacticalRank(left.tactical) - tacticalRank(right.tactical);
  if (rank !== 0) return rank;
  return left.tactical.worstResponseStrategicOutlook - right.tactical.worstResponseStrategicOutlook;
};

const assessCandidates = (
  initialState: GameState,
  candidates: CompletedPlan[],
  perspective: PlayerId,
  options: Required<AiSearchOptions>,
): { candidates: AssessedCandidate[]; diagnostics: SearchPhaseDiagnostics; maxResponseDepth: number } => {
  const diagnostics = emptyDiagnostics();
  const assessed: AssessedCandidate[] = [];
  const responder = opponentOf(perspective);
  const count = Math.max(1, candidates.length);
  const perCandidateNodes = Math.max(40, Math.floor(options.tacticalMaxNodes / count));
  const perCandidateMs = Math.max(12, options.tacticalMaxPlanningMs / count);
  let maxResponseDepth = 0;

  for (const candidate of candidates) {
    if (candidate.endedState.winner || candidate.endedState.currentPlayer !== responder) {
      assessed.push({
        candidate,
        strategic: evaluateV2(candidate.endedState, perspective),
        tactical: assessTacticalOutcome(initialState, candidate.endedState, perspective, []),
        responseDepth: 0,
        assessed: true,
      });
      continue;
    }

    // Guaranteed direct-attack pass before any clock check. A lethal visible reply can therefore
    // never disappear merely because another candidate consumed the tactical wall clock.
    const directBudget = createBudget(Math.max(20, perCandidateNodes), Math.max(8, perCandidateMs));
    const directActions = selectV2Actions(candidate.endedState, responder, false, directBudget)
      .filter((action) => action.kind === 'attack');
    let worstDirect: { state: GameState; actions: AiAction[]; tactical: TacticalAssessment } | undefined;
    for (const action of directActions) {
      const responseState = cloneState(candidate.endedState);
      const result = applyAiAction(responseState, action);
      if (!result.ok) continue;
      directBudget.nodes += 1;
      const ended = finishTurn(responseState, responder);
      const tactical = strengthenTacticalTier(
        candidate.endedState,
        ended,
        perspective,
        assessTacticalOutcome(initialState, ended, perspective, [action]),
      );
      if (!worstDirect || compareResponses(
        { plan: { state: ended, endedState: ended, actions: [action], score: tactical.worstResponseStrategicOutlook }, tactical },
        { plan: { state: worstDirect.state, endedState: worstDirect.state, actions: worstDirect.actions, score: worstDirect.tactical.worstResponseStrategicOutlook }, tactical: worstDirect.tactical },
      ) < 0) worstDirect = { state: ended, actions: [action], tactical };
    }

    const responseBudget = createBudget(perCandidateNodes, perCandidateMs);
    const response = iterativeTurnSearch(
      candidate.endedState,
      responder,
      perspective,
      false,
      false,
      options.responseBeamWidth,
      options.responseDepth,
      4,
      responseBudget,
    );
    mergeDiagnostics(diagnostics, budgetDiagnostics(directBudget));
    mergeDiagnostics(diagnostics, response.diagnostics);
    maxResponseDepth = Math.max(maxResponseDepth, response.completedDepth);

    const responseOptions = response.plans.map((plan) => {
      const tactical = strengthenTacticalTier(
        candidate.endedState,
        plan.endedState,
        perspective,
        assessTacticalOutcome(initialState, plan.endedState, perspective, plan.actions),
      );
      return { plan, tactical };
    });
    if (worstDirect) {
      responseOptions.push({
        plan: {
          state: worstDirect.state,
          endedState: worstDirect.state,
          actions: worstDirect.actions,
          score: worstDirect.tactical.worstResponseStrategicOutlook,
        },
        tactical: worstDirect.tactical,
      });
    }
    responseOptions.sort(compareResponses);

    // Safe means "we actually searched at least one complete visible response ply".
    // If the clock expires before that, the candidate is deliberately not allowed to masquerade as safe.
    const validAssessment = response.completedDepth >= 1 || (!response.rootHadActions && directActions.length === 0);
    const worst = responseOptions[0];
    assessed.push({
      candidate,
      strategic: evaluateV2(candidate.endedState, perspective),
      tactical: worst
        ? validAssessment || worst.tactical.tier !== 'safe'
          ? worst.tactical
          : makeUnassessedTactical(candidate.endedState, perspective)
        : validAssessment
          ? assessTacticalOutcome(initialState, candidate.endedState, perspective, [])
          : makeUnassessedTactical(candidate.endedState, perspective),
      responseDepth: response.completedDepth,
      assessed: validAssessment,
    });
  }

  return { candidates: assessed, diagnostics, maxResponseDepth };
};

const compareCandidates = (left: AssessedCandidate, right: AssessedCandidate): number => {
  const tier = tacticalRank(right.tactical) - tacticalRank(left.tactical);
  if (tier !== 0) return tier;
  const assessed = Number(right.assessed) - Number(left.assessed);
  if (assessed !== 0) return assessed;
  const response = right.tactical.worstResponseStrategicOutlook - left.tactical.worstResponseStrategicOutlook;
  if (response !== 0) return response;
  const tactical = right.tactical.score - left.tactical.score;
  if (tactical !== 0) return tactical;
  if (right.candidate.actions.length !== left.candidate.actions.length) {
    return right.candidate.actions.length - left.candidate.actions.length;
  }
  return right.strategic.outlook - left.strategic.outlook;
};

/**
 * Live planner V2: iterative deepening, independent tactical budgets, guaranteed immediate-reply
 * assessment, and deployment/resource-aware evaluation. Gameplay rules remain engine-owned.
 */
export const planSmartAiTurnV2 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  const perspective = state.currentPlayer;
  const options: Required<AiSearchOptions> = { ...LIVE_AI_OPTIONS_V2, ...overrides };
  if (state.winner || perspective !== 2) {
    const strategic = evaluateV2(state, 2);
    return {
      actions: [],
      strategic,
      tactical: assessTacticalOutcome(state, state, 2),
      diagnostics: { strategy: emptyDiagnostics(), tactical: emptyDiagnostics() },
    };
  }

  const strategyBudget = createBudget(options.strategyMaxNodes, options.strategyMaxPlanningMs);
  const strategy = iterativeTurnSearch(
    state,
    perspective,
    perspective,
    true,
    true,
    options.beamWidth,
    options.maxDepth,
    Math.max(2, options.candidatePlans),
    strategyBudget,
  );
  const tactical = assessCandidates(state, strategy.plans, perspective, options);
  tactical.candidates.sort(compareCandidates);
  const best = tactical.candidates[0];

  const extendedDiagnostics: V2Diagnostics = {
    strategy: strategy.diagnostics,
    tactical: tactical.diagnostics,
    strategyCompletedDepth: strategy.completedDepth,
    tacticalCompletedDepth: tactical.maxResponseDepth,
    assessedCandidates: tactical.candidates.filter((candidate) => candidate.assessed).length,
    unassessedCandidates: tactical.candidates.filter((candidate) => !candidate.assessed).length,
    planner: 'v2-iterative',
  };

  return {
    actions: best?.candidate.actions ?? [],
    strategic: best?.strategic ?? evaluateV2(state, perspective),
    tactical: best?.tactical ?? makeUnassessedTactical(state, perspective),
    diagnostics: extendedDiagnostics,
  };
};
