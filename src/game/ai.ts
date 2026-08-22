import { CARD_DEFINITIONS } from '../data/cards';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { ActionResult, Coord, GameState, PlayerId, UnitState } from '../data/types';
import {
  actionTargetId,
  applyGameAction,
  getLegalGameActions,
  type GameAction,
} from './actions';
import {
  coordKey,
  endTurn,
  findUnit,
  getReachableCoords,
  hexDistance,
  terrainAt,
  unitDefinition,
} from './engine';

const UNDEAD_PLAYER: PlayerId = 2;
const PLANNING_RANDOM = () => 0.5;
const MAX_ACTIONS_PER_NODE = 72;

export interface AiTurnResult {
  actions: string[];
  endedTurn: boolean;
  planScore: number;
  searchedStates: number;
  responseStates: number;
  timedOut: boolean;
}

/** AI actions are exactly the engine's legal gameplay actions. */
export type AiAction = GameAction;

export interface AiPlan {
  actions: AiAction[];
  score: number;
  searchedStates: number;
  responseStates: number;
  timedOut: boolean;
}

export interface AiSearchOptions {
  beamWidth?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxPlanningMs?: number;
  candidatePlans?: number;
  responseBeamWidth?: number;
  responseDepth?: number;
  responseMaxNodes?: number;
}

/** One common mobile-safe intelligence budget for every live-game device. */
export const COMMON_AI_OPTIONS: Required<AiSearchOptions> = {
  beamWidth: 9,
  maxDepth: 7,
  maxNodes: 2_800,
  maxPlanningMs: 55,
  candidatePlans: 4,
  responseBeamWidth: 4,
  responseDepth: 4,
  responseMaxNodes: 650,
};

/** Same intelligence/node limits for headless simulation; relaxed clock only removes device-speed noise. */
export const SIMULATION_AI_OPTIONS: Required<AiSearchOptions> = {
  ...COMMON_AI_OPTIONS,
  maxPlanningMs: 60_000,
};

/** Backwards-compatible alias while older callers migrate. */
export const MOBILE_AI_OPTIONS = COMMON_AI_OPTIONS;
export const getBrowserAiSearchOptions = (): Required<AiSearchOptions> => COMMON_AI_OPTIONS;

const nowMs = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();

/**
 * Correctness-first simulation clone. New state-bearing traits/abilities are copied automatically,
 * so adding a new serializable field to GameState/UnitState does not require an AI change.
 */
const cloneState = (state: GameState): GameState => {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as GameState;
};

const coordFromKey = (key: string): Coord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

const opponentOf = (player: PlayerId): PlayerId => player === 1 ? 2 : 1;

const commander = (state: GameState, player: PlayerId): UnitState | undefined =>
  state.units.find((unit) => unit.owner === player && unit.definitionId === 'commander');

const unitValue = (unit: UnitState): number => {
  const definition = unitDefinition(unit);
  if (unit.definitionId === 'commander') return 0;
  const base = (definition.cost + 1) * 110
    + definition.attack * 45
    + definition.maxHp * 28
    + definition.move * 16
    + definition.range * 20
    + definition.traits.length * 24
    + (definition.ability ? 55 : 0);
  return base * (0.45 + 0.55 * Math.max(0, unit.hp) / definition.maxHp);
};

const potentialRangeFrom = (unit: UnitState, origin: Coord): number => {
  const definition = unitDefinition(unit);
  return definition.range > 1 && terrainAt(origin) === 'hill'
    ? definition.range + 1
    : definition.range;
};

/** Exact visible-board physical threat map; hidden cards are intentionally excluded. */
export const buildThreatMap = (state: GameState, attackerPlayer: PlayerId): Map<string, number> => {
  const planning = cloneState(state);
  planning.currentPlayer = attackerPlayer;
  for (const unit of planning.units) {
    if (unit.owner !== attackerPlayer) continue;
    unit.exhausted = false;
    unit.moved = false;
    unit.attacked = false;
    unit.movementSpent = 0;
    unit.postAttackMoved = false;
    unit.moveBonus = 0;
  }

  const pressure = new Map<string, number>();
  for (const unit of planning.units.filter((candidate) => candidate.owner === attackerPlayer)) {
    const origins: Coord[] = [unit.coord];
    for (const key of getReachableCoords(planning, unit.id).keys()) origins.push(coordFromKey(key));

    const threatenedByThisUnit = new Set<string>();
    for (const origin of origins) {
      const range = potentialRangeFrom(unit, origin);
      for (let r = 0; r < MAP_HEIGHT; r += 1) {
        for (let q = 0; q < MAP_WIDTH; q += 1) {
          const target = { q, r };
          if (hexDistance(origin, target) <= range) threatenedByThisUnit.add(coordKey(target));
        }
      }
    }

    for (const key of threatenedByThisUnit) pressure.set(key, (pressure.get(key) ?? 0) + 1);
  }
  return pressure;
};

const approximateAttackPressure = (state: GameState, attackerPlayer: PlayerId, target: Coord): number =>
  state.units.filter((unit) => {
    if (unit.owner !== attackerPlayer) return false;
    const definition = unitDefinition(unit);
    const optimisticReach = definition.move + definition.range + (definition.range > 1 ? 1 : 0);
    return hexDistance(unit.coord, target) <= optimisticReach;
  }).length;

const countAdjacentBlockers = (state: GameState, target: UnitState): number =>
  state.units.filter((unit) => unit.owner === target.owner
    && unit.id !== target.id
    && unitDefinition(unit).traits.includes('Blocking')
    && hexDistance(unit.coord, target.coord) === 1).length;

const nearestEnemyDistance = (state: GameState, source: UnitState, enemyPlayer: PlayerId): number => {
  const distances = state.units
    .filter((unit) => unit.owner === enemyPlayer)
    .map((unit) => hexDistance(source.coord, unit.coord));
  return distances.length > 0 ? Math.min(...distances) : 20;
};

/** Score from the requested player's point of view. The same weights are used for both factions. */
export const evaluatePosition = (state: GameState, perspective: PlayerId): number => {
  const opponent = opponentOf(perspective);
  if (state.winner === perspective) return 1_000_000;
  if (state.winner === opponent) return -1_000_000;

  let score = 0;
  const ownCommander = commander(state, perspective);
  const enemyCommander = commander(state, opponent);

  if (!ownCommander) score -= 180_000;
  if (!enemyCommander) score += 150_000;

  for (const unit of state.units) {
    score += (unit.owner === perspective ? 1 : -1) * unitValue(unit);
  }

  for (const site of state.sites) {
    const sign = site.owner === perspective ? 1 : site.owner === opponent ? -1 : 0;
    if (site.type === 'well') score += sign * 360;
    if (site.type === 'fort') score += sign * 250;
  }

  if (state.countdown?.player === perspective) score += 32_000 + state.countdown.checkpoints * 18_000;
  if (state.countdown?.player === opponent) score -= 45_000 + state.countdown.checkpoints * 24_000;

  if (ownCommander) {
    const pressure = approximateAttackPressure(state, opponent, ownCommander.coord);
    score -= pressure * 5_500;
    score += countAdjacentBlockers(state, ownCommander) * 180;
    score += Math.min(8, nearestEnemyDistance(state, ownCommander, opponent)) * 85;
  }

  if (enemyCommander) {
    const pressure = approximateAttackPressure(state, perspective, enemyCommander.coord);
    score += pressure * 3_700;
    score -= countAdjacentBlockers(state, enemyCommander) * 120;
    const ownDistances = state.units
      .filter((unit) => unit.owner === perspective && unit.definitionId !== 'commander')
      .map((unit) => hexDistance(unit.coord, enemyCommander.coord));
    if (ownDistances.length > 0) score += Math.max(0, 9 - Math.min(...ownDistances)) * 105;
  }

  // The planner may use its own hand/deck, but never scores hidden opponent cards.
  const own = state.players[perspective];
  score += own.hand.length * 28;
  score += own.deck.length * 8;
  score += own.mana * 18;
  return score;
};

/** Legacy Player-2 evaluator retained for live enemy scene/tests. */
export const evaluateAiPosition = (state: GameState): number => evaluatePosition(state, UNDEAD_PLAYER);

const exactCommanderThreatAdjustment = (state: GameState, perspective: PlayerId): number => {
  const opponent = opponentOf(perspective);
  let adjustment = 0;
  const ownCommander = commander(state, perspective);
  const enemyCommander = commander(state, opponent);
  if (ownCommander) {
    const enemyThreats = buildThreatMap(state, opponent);
    adjustment -= (enemyThreats.get(coordKey(ownCommander.coord)) ?? 0) * 1_800;
  }
  if (enemyCommander) {
    const ownThreats = buildThreatMap(state, perspective);
    adjustment += (ownThreats.get(coordKey(enemyCommander.coord)) ?? 0) * 1_200;
  }
  return adjustment;
};

/**
 * Search-cache signature serializes full state-bearing gameplay data so strategically different
 * board-effect states are never merged by the planner.
 */
const stateSignature = (state: GameState, includeCurrentHand: boolean): string => {
  const units = [...state.units]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((unit) => JSON.stringify(unit))
    .join('|');
  const sites = state.sites.map((site) => `${site.id}:${site.owner ?? 0}`).join('|');
  const builtBridges = [...state.builtBridges].map(coordKey).sort().join(',');
  const tileEffects = [...state.tileEffects]
    .sort((a, b) => coordKey(a.coord).localeCompare(coordKey(b.coord)))
    .map((effect) => JSON.stringify(effect))
    .join('|');
  const current = state.players[state.currentPlayer];
  const hand = includeCurrentHand ? current.hand.join(',') : '';
  return [
    state.currentPlayer,
    current.mana,
    hand,
    units,
    sites,
    builtBridges,
    tileEffects,
    `${state.countdown?.player ?? 0}:${state.countdown?.checkpoints ?? 0}`,
    state.winner ?? 0,
    state.nextUnitId,
  ].join(';');
};

/** AI delegates legal-action knowledge entirely to the gameplay engine. */
export const generateLegalActionsForPlayer = (
  state: GameState,
  playerId: PlayerId,
  includeCards: boolean,
): AiAction[] => getLegalGameActions(state, playerId, { includeCards });

export const generateLegalAiActions = (state: GameState): AiAction[] =>
  generateLegalActionsForPlayer(state, UNDEAD_PLAYER, true);

/** AI delegates action resolution entirely to the gameplay engine. */
export const applyAiAction = (state: GameState, action: AiAction): ActionResult =>
  applyGameAction(state, action);

/** Cheap ordering only controls which legal actions are explored first; final scoring uses simulated states. */
const actionPriority = (state: GameState, action: AiAction, actor: PlayerId): number => {
  const opponent = opponentOf(actor);

  if (action.kind === 'attack') {
    const target = findUnit(state, action.targetId);
    const attacker = findUnit(state, action.unitId);
    if (!target || !attacker) return -100_000;
    const lethal = unitDefinition(attacker).attack >= target.hp ? 1 : 0;
    return (target.definitionId === 'commander' ? 100_000 : 0)
      + lethal * 8_000
      + unitValue(target);
  }

  if (action.kind === 'summon') {
    const card = CARD_DEFINITIONS[action.cardId];
    const enemyCommander = commander(state, opponent);
    const proximity = enemyCommander ? 12 - hexDistance(action.destination, enemyCommander.coord) : 0;
    const restoreTarget = action.restoreTargetId ? findUnit(state, action.restoreTargetId) : undefined;
    const restoreBonus = restoreTarget
      ? Math.max(0, unitDefinition(restoreTarget).maxHp - restoreTarget.hp) * 180
      : 0;
    return card.cost * 300 + proximity * 30 + restoreBonus;
  }

  if (action.kind === 'move') {
    const unit = findUnit(state, action.unitId);
    if (!unit) return -100_000;
    const enemyCommander = commander(state, opponent);
    const before = enemyCommander ? hexDistance(unit.coord, enemyCommander.coord) : 0;
    const after = enemyCommander ? hexDistance(action.destination, enemyCommander.coord) : 0;
    const siteBonus = state.sites.some((site) => site.owner !== actor
      && site.coord.q === action.destination.q
      && site.coord.r === action.destination.r) ? 1_100 : 0;
    const commanderSafety = unit.definitionId === 'commander'
      ? -approximateAttackPressure(state, opponent, action.destination) * 1_400
      : 0;
    return (before - after) * 260 + siteBonus + commanderSafety;
  }

  const targetId = actionTargetId(action);
  const target = targetId ? findUnit(state, targetId) : undefined;
  if (target) {
    const relationBonus = target.owner === actor ? 450 + target.hp * 35 : 950 + unitValue(target);
    const commanderBonus = target.definitionId === 'commander' ? 4_000 : 0;
    return 900 + relationBonus + commanderBonus;
  }

  // Untargeted active abilities and tile-target tactics stay near the front of exploration.
  return 1_100;
};

interface SearchNode {
  state: GameState;
  actions: AiAction[];
  score: number;
}

interface CompletedPlan extends SearchNode {
  endedState: GameState;
}

interface TurnSearchResult {
  plans: CompletedPlan[];
  searchedStates: number;
  timedOut: boolean;
}

interface SearchBudget {
  deadline: number;
  maxNodes: number;
  searchedStates: number;
  timedOut: boolean;
}

const budgetExhausted = (budget: SearchBudget): boolean => {
  if (budget.searchedStates >= budget.maxNodes || nowMs() >= budget.deadline) {
    budget.timedOut = true;
    return true;
  }
  return false;
};

const finishTurnForSearch = (state: GameState, playerId: PlayerId): GameState => {
  const ended = cloneState(state);
  if (!ended.winner && ended.currentPlayer === playerId) endTurn(ended, PLANNING_RANDOM);
  return ended;
};

const searchTurnPlans = (
  state: GameState,
  actor: PlayerId,
  perspective: PlayerId,
  includeCards: boolean,
  maximizePerspectiveScore: boolean,
  beamWidth: number,
  maxDepth: number,
  completedPlanCount: number,
  budget: SearchBudget,
): TurnSearchResult => {
  const root = cloneState(state);
  let beam: SearchNode[] = [{ state: root, actions: [], score: evaluatePosition(root, perspective) }];
  const completed: CompletedPlan[] = [];
  const visited = new Map<string, number>();
  visited.set(stateSignature(root, includeCards), beam[0].score);

  const addCompleted = (node: SearchNode): void => {
    if (budgetExhausted(budget)) return;
    const endedState = finishTurnForSearch(node.state, actor);
    budget.searchedStates += 1;
    const score = evaluatePosition(endedState, perspective);
    completed.push({ ...node, score, endedState });
  };

  for (let depth = 0; depth < maxDepth && beam.length > 0 && !budgetExhausted(budget); depth += 1) {
    const next: SearchNode[] = [];
    for (const node of beam) {
      if (budgetExhausted(budget)) break;
      addCompleted(node);

      const candidateActions = generateLegalActionsForPlayer(node.state, actor, includeCards)
        .sort((a, b) => actionPriority(node.state, b, actor) - actionPriority(node.state, a, actor))
        .slice(0, MAX_ACTIONS_PER_NODE);

      for (const action of candidateActions) {
        if (budgetExhausted(budget)) break;
        const childState = cloneState(node.state);
        const result = applyAiAction(childState, action);
        if (!result.ok) continue;
        budget.searchedStates += 1;
        const score = evaluatePosition(childState, perspective);
        const signature = stateSignature(childState, includeCards);
        const previousScore = visited.get(signature);
        const betterThanPrevious = previousScore === undefined
          || (maximizePerspectiveScore ? score > previousScore : score < previousScore);
        if (!betterThanPrevious) continue;
        visited.set(signature, score);
        next.push({ state: childState, actions: [...node.actions, action], score });
      }
    }

    next.sort((a, b) => maximizePerspectiveScore ? b.score - a.score : a.score - b.score);
    beam = next.slice(0, beamWidth);
  }

  for (const node of beam) {
    if (budgetExhausted(budget)) break;
    addCompleted(node);
  }

  completed.sort((a, b) => maximizePerspectiveScore ? b.score - a.score : a.score - b.score);
  return {
    plans: completed.slice(0, completedPlanCount),
    searchedStates: budget.searchedStates,
    timedOut: budget.timedOut,
  };
};

const responseWorstCaseScore = (
  actorEndedState: GameState,
  perspective: PlayerId,
  options: Required<AiSearchOptions>,
  budget: SearchBudget,
): { score: number; responseStates: number } => {
  const responder = opponentOf(perspective);
  if (actorEndedState.winner || actorEndedState.currentPlayer !== responder || budgetExhausted(budget)) {
    return { score: evaluatePosition(actorEndedState, perspective), responseStates: 0 };
  }

  const before = budget.searchedStates;
  const responseNodeLimit = Math.min(budget.maxNodes, budget.searchedStates + options.responseMaxNodes);
  const responseBudget: SearchBudget = {
    deadline: budget.deadline,
    maxNodes: responseNodeLimit,
    searchedStates: budget.searchedStates,
    timedOut: false,
  };
  const response = searchTurnPlans(
    actorEndedState,
    responder,
    perspective,
    false,
    false,
    options.responseBeamWidth,
    options.responseDepth,
    1,
    responseBudget,
  );
  budget.searchedStates = responseBudget.searchedStates;
  budget.timedOut ||= responseBudget.timedOut;
  const worst = response.plans[0];
  return {
    score: worst ? worst.score : evaluatePosition(actorEndedState, perspective),
    responseStates: Math.max(0, budget.searchedStates - before),
  };
};

/** Plan a complete turn for whichever player is currently active. */
export const planAiTurn = (state: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  const perspective = state.currentPlayer;
  if (state.winner) {
    return {
      actions: [],
      score: evaluatePosition(state, perspective),
      searchedStates: 0,
      responseStates: 0,
      timedOut: false,
    };
  }

  const options: Required<AiSearchOptions> = { ...COMMON_AI_OPTIONS, ...overrides };
  const budget: SearchBudget = {
    deadline: nowMs() + options.maxPlanningMs,
    maxNodes: options.maxNodes,
    searchedStates: 0,
    timedOut: false,
  };

  const initialSearch = searchTurnPlans(
    state,
    perspective,
    perspective,
    true,
    true,
    options.beamWidth,
    options.maxDepth,
    options.candidatePlans,
    budget,
  );
  let responseStates = 0;
  let bestActions: AiAction[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of initialSearch.plans) {
    if (budgetExhausted(budget)) break;
    const exactScore = candidate.score + exactCommanderThreatAdjustment(candidate.endedState, perspective);
    const response = responseWorstCaseScore(candidate.endedState, perspective, options, budget);
    responseStates += response.responseStates;
    const robustScore = Math.min(exactScore, response.score);
    if (robustScore > bestScore) {
      bestScore = robustScore;
      bestActions = candidate.actions;
    }
  }

  if (bestScore === Number.NEGATIVE_INFINITY) {
    const fallback = initialSearch.plans[0];
    bestActions = fallback?.actions ?? [];
    bestScore = fallback?.score ?? evaluatePosition(state, perspective);
  }

  return {
    actions: bestActions,
    score: bestScore,
    searchedStates: budget.searchedStates,
    responseStates,
    timedOut: budget.timedOut || initialSearch.timedOut,
  };
};

export const executeAiPlan = (
  state: GameState,
  plan: AiPlan,
  random: () => number = Math.random,
): AiTurnResult => {
  const actor = state.currentPlayer;
  const messages: string[] = [];
  for (const action of plan.actions) {
    if (state.winner || state.currentPlayer !== actor) break;
    const result = applyAiAction(state, action);
    if (!result.ok) {
      messages.push(`AI plan stopped: ${result.message}`);
      break;
    }
    messages.push(result.message);
  }

  if (!state.winner && state.currentPlayer === actor) {
    const result = endTurn(state, random);
    messages.push(result.message);
    return {
      actions: messages,
      endedTurn: result.ok,
      planScore: plan.score,
      searchedStates: plan.searchedStates,
      responseStates: plan.responseStates,
      timedOut: plan.timedOut,
    };
  }

  return {
    actions: messages,
    endedTurn: false,
    planScore: plan.score,
    searchedStates: plan.searchedStates,
    responseStates: plan.responseStates,
    timedOut: plan.timedOut,
  };
};

/** Run one complete AI turn for the currently active faction. */
export const runAiTurn = (
  state: GameState,
  random: () => number = Math.random,
  options: AiSearchOptions = {},
): AiTurnResult => executeAiPlan(state, planAiTurn(state, options), random);

/** Player-2 compatibility entry point used by the live Human-vs-Undead scene. */
export const planSmartAiTurn = (state: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  if (state.currentPlayer !== UNDEAD_PLAYER) {
    return {
      actions: [],
      score: evaluatePosition(state, UNDEAD_PLAYER),
      searchedStates: 0,
      responseStates: 0,
      timedOut: false,
    };
  }
  return planAiTurn(state, overrides);
};

export const runSmartAiTurn = (
  state: GameState,
  random: () => number = Math.random,
  options: AiSearchOptions = {},
): AiTurnResult => {
  if (state.currentPlayer !== UNDEAD_PLAYER) {
    return {
      actions: [],
      endedTurn: false,
      planScore: evaluatePosition(state, UNDEAD_PLAYER),
      searchedStates: 0,
      responseStates: 0,
      timedOut: false,
    };
  }
  return runAiTurn(state, random, options);
};

export const runSimpleAiTurn = runSmartAiTurn;
