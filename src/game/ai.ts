import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { ActionResult, Coord, GameState, PlayerId, UnitState } from '../data/types';
import {
  attackUnit,
  coordKey,
  displaceUnit,
  endTurn,
  findUnit,
  getAttackTargets,
  getDisplaceDestinations,
  getDisplaceTargets,
  getReachableCoords,
  getValidSummonCoords,
  hexDistance,
  moveUnit,
  playUnitCard,
  terrainAt,
  unitDefinition,
} from './engine';

const AI_PLAYER: PlayerId = 2;
const HUMAN_PLAYER: PlayerId = 1;
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

export type AiAction =
  | { kind: 'summon'; handIndex: number; cardId: CardDefinitionId; destination: Coord }
  | { kind: 'move'; unitId: string; destination: Coord }
  | { kind: 'attack'; unitId: string; targetId: string }
  | { kind: 'displace'; unitId: string; targetId: string; destination: Coord };

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

/**
 * One common mobile-safe intelligence budget for every device.
 * Device speed may still affect whether the wall-clock safety cap is hit first,
 * but PC users never receive wider/deeper search settings.
 */
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

/** Backwards-compatible alias while existing tests/callers migrate to the common name. */
export const MOBILE_AI_OPTIONS = COMMON_AI_OPTIONS;

/** Backwards-compatible helper: all browsers now receive the exact same profile. */
export const getBrowserAiSearchOptions = (): Required<AiSearchOptions> => COMMON_AI_OPTIONS;

const nowMs = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Hot-path clone: faster and less allocation-heavy than structuredClone for this small state shape. */
const cloneState = (state: GameState): GameState => ({
  currentPlayer: state.currentPlayer,
  turnNumber: state.turnNumber,
  players: {
    1: {
      ...state.players[1],
      deck: [...state.players[1].deck],
      hand: [...state.players[1].hand],
      discard: [...state.players[1].discard],
    },
    2: {
      ...state.players[2],
      deck: [...state.players[2].deck],
      hand: [...state.players[2].hand],
      discard: [...state.players[2].discard],
    },
  },
  units: state.units.map((unit) => ({ ...unit, coord: { ...unit.coord } })),
  sites: state.sites.map((site) => ({ ...site, coord: { ...site.coord } })),
  countdown: state.countdown ? { ...state.countdown } : null,
  winner: state.winner,
  nextUnitId: state.nextUnitId,
});

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

/** Exact visible-board threat map; intentionally never considers hidden cards. */
export const buildThreatMap = (state: GameState, attackerPlayer: PlayerId): Map<string, number> => {
  const planning = cloneState(state);
  planning.currentPlayer = attackerPlayer;
  for (const unit of planning.units) {
    if (unit.owner !== attackerPlayer) continue;
    unit.exhausted = false;
    unit.moved = false;
    unit.attacked = false;
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

/** Score is always from the Undead AI's point of view. */
export const evaluateAiPosition = (state: GameState): number => {
  if (state.winner === AI_PLAYER) return 1_000_000;
  if (state.winner === HUMAN_PLAYER) return -1_000_000;

  let score = 0;
  const aiCommander = commander(state, AI_PLAYER);
  const humanCommander = commander(state, HUMAN_PLAYER);

  if (!aiCommander) score -= 180_000;
  if (!humanCommander) score += 150_000;

  for (const unit of state.units) {
    const sign = unit.owner === AI_PLAYER ? 1 : -1;
    score += sign * unitValue(unit);
  }

  for (const site of state.sites) {
    const sign = site.owner === AI_PLAYER ? 1 : site.owner === HUMAN_PLAYER ? -1 : 0;
    if (site.type === 'well') score += sign * 360;
    if (site.type === 'fort') score += sign * 250;
  }

  if (state.countdown?.player === AI_PLAYER) score += 32_000 + state.countdown.checkpoints * 18_000;
  if (state.countdown?.player === HUMAN_PLAYER) score -= 45_000 + state.countdown.checkpoints * 24_000;

  if (aiCommander) {
    const pressure = approximateAttackPressure(state, HUMAN_PLAYER, aiCommander.coord);
    score -= pressure * 5_500;
    score += countAdjacentBlockers(state, aiCommander) * 180;
    score += Math.min(8, nearestEnemyDistance(state, aiCommander, HUMAN_PLAYER)) * 85;
  }

  if (humanCommander) {
    const pressure = approximateAttackPressure(state, AI_PLAYER, humanCommander.coord);
    score += pressure * 3_700;
    score -= countAdjacentBlockers(state, humanCommander) * 120;
    const aiDistances = state.units
      .filter((unit) => unit.owner === AI_PLAYER && unit.definitionId !== 'commander')
      .map((unit) => hexDistance(unit.coord, humanCommander.coord));
    if (aiDistances.length > 0) score += Math.max(0, 9 - Math.min(...aiDistances)) * 105;
  }

  score += state.players[AI_PLAYER].hand.length * 28;
  score += state.players[AI_PLAYER].deck.length * 8;
  score += state.players[AI_PLAYER].mana * 18;
  return score;
};

const exactCommanderThreatAdjustment = (state: GameState): number => {
  let adjustment = 0;
  const aiCommander = commander(state, AI_PLAYER);
  const humanCommander = commander(state, HUMAN_PLAYER);
  if (aiCommander) {
    const humanThreats = buildThreatMap(state, HUMAN_PLAYER);
    adjustment -= (humanThreats.get(coordKey(aiCommander.coord)) ?? 0) * 1_800;
  }
  if (humanCommander) {
    const aiThreats = buildThreatMap(state, AI_PLAYER);
    adjustment += (aiThreats.get(coordKey(humanCommander.coord)) ?? 0) * 1_200;
  }
  return adjustment;
};

const stateSignature = (state: GameState, includeCurrentHand: boolean): string => {
  const units = [...state.units]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((unit) => [
      unit.id, unit.definitionId, unit.owner, unit.hp, unit.coord.q, unit.coord.r,
      unit.exhausted ? 1 : 0, unit.moved ? 1 : 0, unit.attacked ? 1 : 0,
    ].join(':'))
    .join('|');
  const sites = state.sites.map((site) => `${site.id}:${site.owner ?? 0}`).join('|');
  const current = state.players[state.currentPlayer];
  const hand = includeCurrentHand ? `;${current.hand.join(',')}` : '';
  return `${state.currentPlayer};${current.mana}${hand};${units};${sites};${state.countdown?.player ?? 0}:${state.countdown?.checkpoints ?? 0}`;
};

const generateLegalActionsForPlayer = (
  state: GameState,
  playerId: PlayerId,
  includeCards: boolean,
): AiAction[] => {
  if (state.winner || state.currentPlayer !== playerId) return [];
  const actions: AiAction[] = [];
  const player = state.players[playerId];

  if (includeCards) {
    const seenCards = new Set<CardDefinitionId>();
    player.hand.forEach((rawCardId, handIndex) => {
      const cardId = rawCardId as CardDefinitionId;
      const card = CARD_DEFINITIONS[cardId];
      if (!card || seenCards.has(cardId) || card.type !== 'unit' || card.faction !== player.faction || card.cost > player.mana) return;
      seenCards.add(cardId);
      for (const destination of getValidSummonCoords(state, playerId)) {
        actions.push({ kind: 'summon', handIndex, cardId, destination });
      }
    });
  }

  for (const unit of state.units.filter((candidate) => candidate.owner === playerId && !candidate.exhausted)) {
    for (const target of getAttackTargets(state, unit.id)) {
      actions.push({ kind: 'attack', unitId: unit.id, targetId: target.id });
    }
    for (const key of getReachableCoords(state, unit.id).keys()) {
      actions.push({ kind: 'move', unitId: unit.id, destination: coordFromKey(key) });
    }
    if (unitDefinition(unit).ability === 'Displace' && !unit.attacked) {
      for (const target of getDisplaceTargets(state, unit.id)) {
        for (const destination of getDisplaceDestinations(state, unit.id, target.id)) {
          actions.push({ kind: 'displace', unitId: unit.id, targetId: target.id, destination });
        }
      }
    }
  }
  return actions;
};

export const generateLegalAiActions = (state: GameState): AiAction[] =>
  generateLegalActionsForPlayer(state, AI_PLAYER, true);

export const applyAiAction = (state: GameState, action: AiAction): ActionResult => {
  switch (action.kind) {
    case 'summon': {
      if (state.players[state.currentPlayer].hand[action.handIndex] !== action.cardId) {
        return { ok: false, message: 'Planned summon card is no longer at that hand index.' };
      }
      return playUnitCard(state, action.handIndex, action.destination);
    }
    case 'move':
      return moveUnit(state, action.unitId, action.destination);
    case 'attack':
      return attackUnit(state, action.unitId, action.targetId);
    case 'displace':
      return displaceUnit(state, action.unitId, action.targetId, action.destination);
  }
};

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
    return card.cost * 300 + proximity * 30;
  }

  if (action.kind === 'displace') {
    const target = findUnit(state, action.targetId);
    const enemyCommander = commander(state, opponent);
    const enemyBonus = target?.owner === opponent ? 1_200 : -150;
    const commanderBonus = target?.definitionId === 'commander' ? 6_000 : 0;
    const proximity = enemyCommander ? 10 - hexDistance(action.destination, enemyCommander.coord) : 0;
    return enemyBonus + commanderBonus + proximity * 80;
  }

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
  includeCards: boolean,
  maximizeAiScore: boolean,
  beamWidth: number,
  maxDepth: number,
  completedPlanCount: number,
  budget: SearchBudget,
): TurnSearchResult => {
  const root = cloneState(state);
  let beam: SearchNode[] = [{ state: root, actions: [], score: evaluateAiPosition(root) }];
  const completed: CompletedPlan[] = [];
  const visited = new Map<string, number>();
  visited.set(stateSignature(root, includeCards), beam[0].score);

  const addCompleted = (node: SearchNode): void => {
    const endedState = finishTurnForSearch(node.state, actor);
    budget.searchedStates += 1;
    const score = evaluateAiPosition(endedState);
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
        const score = evaluateAiPosition(childState);
        const signature = stateSignature(childState, includeCards);
        const previousScore = visited.get(signature);
        const betterThanPrevious = previousScore === undefined
          || (maximizeAiScore ? score > previousScore : score < previousScore);
        if (!betterThanPrevious) continue;
        visited.set(signature, score);
        next.push({ state: childState, actions: [...node.actions, action], score });
      }
    }

    next.sort((a, b) => maximizeAiScore ? b.score - a.score : a.score - b.score);
    beam = next.slice(0, beamWidth);
  }

  for (const node of beam) {
    if (budgetExhausted(budget)) break;
    addCompleted(node);
  }

  completed.sort((a, b) => maximizeAiScore ? b.score - a.score : a.score - b.score);
  return {
    plans: completed.slice(0, completedPlanCount),
    searchedStates: budget.searchedStates,
    timedOut: budget.timedOut,
  };
};

const responseWorstCaseScore = (
  aiEndedState: GameState,
  options: Required<AiSearchOptions>,
  budget: SearchBudget,
): { score: number; responseStates: number } => {
  if (aiEndedState.winner || aiEndedState.currentPlayer !== HUMAN_PLAYER || budgetExhausted(budget)) {
    return { score: evaluateAiPosition(aiEndedState), responseStates: 0 };
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
    aiEndedState,
    HUMAN_PLAYER,
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
    score: worst ? worst.score : evaluateAiPosition(aiEndedState),
    responseStates: Math.max(0, budget.searchedStates - before),
  };
};

export const planSmartAiTurn = (state: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  if (state.winner || state.currentPlayer !== AI_PLAYER) {
    return {
      actions: [],
      score: evaluateAiPosition(state),
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
    AI_PLAYER,
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
    const exactScore = candidate.score + exactCommanderThreatAdjustment(candidate.endedState);
    const response = responseWorstCaseScore(candidate.endedState, options, budget);
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
    bestScore = fallback?.score ?? evaluateAiPosition(state);
  }

  return {
    actions: bestActions,
    score: bestScore,
    searchedStates: budget.searchedStates,
    responseStates,
    timedOut: budget.timedOut || initialSearch.timedOut,
  };
};

export const runSmartAiTurn = (
  state: GameState,
  random: () => number = Math.random,
  options: AiSearchOptions = {},
): AiTurnResult => {
  if (state.winner || state.currentPlayer !== AI_PLAYER) {
    return {
      actions: [],
      endedTurn: false,
      planScore: evaluateAiPosition(state),
      searchedStates: 0,
      responseStates: 0,
      timedOut: false,
    };
  }

  const plan = planSmartAiTurn(state, options);
  const actions: string[] = [];
  for (const action of plan.actions) {
    if (state.winner || state.currentPlayer !== AI_PLAYER) break;
    const result = applyAiAction(state, action);
    if (!result.ok) {
      actions.push(`AI plan stopped: ${result.message}`);
      break;
    }
    actions.push(result.message);
  }

  if (!state.winner && state.currentPlayer === AI_PLAYER) {
    const result = endTurn(state, random);
    actions.push(result.message);
    return {
      actions,
      endedTurn: result.ok,
      planScore: plan.score,
      searchedStates: plan.searchedStates,
      responseStates: plan.responseStates,
      timedOut: plan.timedOut,
    };
  }

  return {
    actions,
    endedTurn: false,
    planScore: plan.score,
    searchedStates: plan.searchedStates,
    responseStates: plan.responseStates,
    timedOut: plan.timedOut,
  };
};

/** Backwards-compatible name for older callers while the prototype transitions to the smart planner. */
export const runSimpleAiTurn = runSmartAiTurn;
