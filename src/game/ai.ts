import { CARD_DEFINITIONS } from '../data/cards';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { ActionResult, Coord, GameState, PlayerId, UnitState } from '../data/types';
import {
  GAME_ACTION_KINDS,
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
import {
  evaluateStrategicPosition,
  strategicUnitValue,
  type StrategicEvaluation,
} from './aiEvaluation';

const UNDEAD_PLAYER: PlayerId = 2;
const PLANNING_RANDOM = () => 0.5;
const MAX_ACTIONS_PER_NODE = 72;

export interface AiTurnResult {
  actions: string[];
  endedTurn: boolean;
  strategic: StrategicEvaluation;
  tactical: TacticalAssessment;
  diagnostics: AiPlanDiagnostics;
}

/** AI actions are exactly the engine's legal gameplay actions. */
export type AiAction = GameAction;

export interface AiPlan {
  actions: AiAction[];
  strategic: StrategicEvaluation;
  tactical: TacticalAssessment;
  diagnostics: AiPlanDiagnostics;
}

export type SearchStopReason = 'complete' | 'node-limit' | 'time-limit';
export type TacticalTier = 'forced-win' | 'safe' | 'unsafe' | 'forced-loss';

export interface TacticalComponents {
  commanderSurvival: number;
  commanderHealth: number;
  incomingDamage: number;
  threatenedUnits: number;
  threatReduction: number;
  friendlyMaterialPreserved: number;
  enemyMaterialRemoved: number;
}

export interface TacticalAssessment {
  tier: TacticalTier;
  score: number;
  incomingCommanderDamage: number;
  threatenedFriendlyUnits: number;
  visibleThreatsRemoved: number;
  components: TacticalComponents;
  worstResponse: AiAction[];
  worstResponseStrategicOutlook: number;
}

export interface ActionKindCounts {
  summon: number;
  tactic: number;
  move: number;
  attack: number;
  displace: number;
  rally: number;
  soulLink: number;
  curse: number;
}

export interface SearchPhaseDiagnostics {
  nodes: number;
  stopReason: SearchStopReason;
  legalActions: number;
  retainedActions: number;
  legalByKind: ActionKindCounts;
  retainedByKind: ActionKindCounts;
}

export interface AiPlanDiagnostics {
  strategy: SearchPhaseDiagnostics;
  tactical: SearchPhaseDiagnostics;
}

export interface AiExecutionObserver {
  onActionResolved?: (event: {
    actor: PlayerId;
    action: AiAction;
    result: ActionResult;
    state: GameState;
  }) => void;
  onTurnEnded?: (event: {
    actor: PlayerId;
    result: ActionResult;
    state: GameState;
  }) => void;
}

export interface AiSearchOptions {
  beamWidth?: number;
  maxDepth?: number;
  strategyMaxNodes?: number;
  strategyMaxPlanningMs?: number;
  candidatePlans?: number;
  responseBeamWidth?: number;
  responseDepth?: number;
  tacticalMaxNodes?: number;
  tacticalMaxPlanningMs?: number;
}

/** One common mobile-safe intelligence budget for every live-game device. */
export const COMMON_AI_OPTIONS: Required<AiSearchOptions> = {
  beamWidth: 9,
  maxDepth: 7,
  strategyMaxNodes: 1_800,
  strategyMaxPlanningMs: 35,
  candidatePlans: 4,
  responseBeamWidth: 4,
  responseDepth: 4,
  tacticalMaxNodes: 1_000,
  tacticalMaxPlanningMs: 20,
};

/** Same intelligence/node limits for headless simulation; relaxed clock only removes device-speed noise. */
export const SIMULATION_AI_OPTIONS: Required<AiSearchOptions> = {
  ...COMMON_AI_OPTIONS,
  strategyMaxPlanningMs: 60_000,
  tacticalMaxPlanningMs: 60_000,
};

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
  const scorchedForests = [...state.scorchedForests].map(coordKey).sort().join(',');
  const pendingManaWells = [...state.pendingManaWells]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((pending) => JSON.stringify(pending))
    .join('|');
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
    scorchedForests,
    pendingManaWells,
    tileEffects,
    `${state.countdown?.player ?? 0}:${state.countdown?.checkpoints ?? 0}`,
    state.winner ?? 0,
    state.nextUnitId,
    state.nextSiteId,
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
      + strategicUnitValue(target);
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
    const commanderDamage = enemyCommander
      ? unitDefinition(enemyCommander).maxHp - enemyCommander.hp
      : 0;
    const pursuitValue = unit.definitionId === 'commander' ? 220 : 420 + commanderDamage * 70;
    const siteBonus = state.sites.some((site) => site.owner !== actor
      && site.coord.q === action.destination.q
      && site.coord.r === action.destination.r) ? 1_100 : 0;
    const commanderSafety = unit.definitionId === 'commander'
      ? -approximateAttackPressure(state, opponent, action.destination) * 1_400
      : 0;
    return (before - after) * pursuitValue + siteBonus + commanderSafety;
  }

  if (action.kind === 'tactic' && 'destination' in action) {
    const occupant = state.units.find((unit) => unit.coord.q === action.destination.q
      && unit.coord.r === action.destination.r);
    const occupantBonus = occupant
      ? occupant.owner === actor ? 350 : 2_200 + strategicUnitValue(occupant)
      : 0;
    const nearestUnitDistance = Math.min(12, ...state.units.map((unit) =>
      hexDistance(unit.coord, action.destination)));
    const siteBonus = state.sites.some((site) =>
      hexDistance(site.coord, action.destination) <= 1) ? 650 : 0;
    const enemyCommander = commander(state, opponent);
    const commanderProximity = enemyCommander
      ? Math.max(0, 8 - hexDistance(action.destination, enemyCommander.coord)) * 90
      : 0;
    return occupantBonus + siteBonus + commanderProximity + Math.max(0, 8 - nearestUnitDistance) * 130;
  }

  const targetId = actionTargetId(action);
  const target = targetId ? findUnit(state, targetId) : undefined;
  if (target) {
    const relationBonus = target.owner === actor ? 450 + target.hp * 35 : 950 + strategicUnitValue(target);
    const commanderBonus = target.definitionId === 'commander' ? 4_000 : 0;
    return 900 + relationBonus + commanderBonus;
  }

  // Untargeted active abilities and tile-target tactics stay near the front of exploration.
  return 1_100;
};

const emptyActionKindCounts = (): ActionKindCounts => ({
  summon: 0,
  tactic: 0,
  move: 0,
  attack: 0,
  displace: 0,
  rally: 0,
  soulLink: 0,
  curse: 0,
});

const abilityKinds = new Set<AiAction['kind']>(['displace', 'rally', 'soulLink', 'curse']);
type ActionFamily = 'attacks' | 'abilities' | 'summons' | 'tactics' | 'moves';
const actionFamily = (action: AiAction): ActionFamily => {
  if (action.kind === 'attack') return 'attacks';
  if (abilityKinds.has(action.kind)) return 'abilities';
  if (action.kind === 'summon') return 'summons';
  if (action.kind === 'tactic') return 'tactics';
  return 'moves';
};

const roundRobinBy = (
  actions: AiAction[],
  groupKey: (action: AiAction) => string,
  limit: number,
  perGroupLimit: number,
): AiAction[] => {
  const groups = new Map<string, AiAction[]>();
  for (const action of actions) {
    const key = groupKey(action);
    const group = groups.get(key) ?? [];
    group.push(action);
    groups.set(key, group);
  }
  const selected: AiAction[] = [];
  for (let index = 0; index < perGroupLimit && selected.length < limit; index += 1) {
    for (const group of groups.values()) {
      const action = group[index];
      if (action) selected.push(action);
      if (selected.length >= limit) break;
    }
  }
  return selected;
};

interface CandidateSelectionStats {
  legalActions: number;
  retainedActions: number;
  legalByKind: ActionKindCounts;
  retainedByKind: ActionKindCounts;
}

interface CandidateSelectionAccumulator extends CandidateSelectionStats {}

const emptyCandidateSelectionStats = (): CandidateSelectionAccumulator => ({
  legalActions: 0,
  retainedActions: 0,
  legalByKind: emptyActionKindCounts(),
  retainedByKind: emptyActionKindCounts(),
});

const recordCandidateSelection = (
  accumulator: CandidateSelectionAccumulator,
  legal: AiAction[],
  retained: AiAction[],
): void => {
  accumulator.legalActions += legal.length;
  accumulator.retainedActions += retained.length;
  for (const action of legal) accumulator.legalByKind[action.kind] += 1;
  for (const action of retained) accumulator.retainedByKind[action.kind] += 1;
};

/** Keeps every action family represented before bounded search applies its global cap. */
export const selectCandidateActions = (
  state: GameState,
  actor: PlayerId,
  includeCards: boolean,
): { actions: AiAction[]; stats: CandidateSelectionStats } => {
  const legal = generateLegalActionsForPlayer(state, actor, includeCards);
  const ranked = [...legal].sort((a, b) => actionPriority(state, b, actor) - actionPriority(state, a, actor));
  const attacks = ranked.filter((action) => action.kind === 'attack').slice(0, 16);
  const abilities = roundRobinBy(
    ranked.filter((action) => abilityKinds.has(action.kind)),
    (action) => 'unitId' in action ? action.unitId : action.kind,
    8,
    2,
  );
  const summons = roundRobinBy(
    ranked.filter((action) => action.kind === 'summon'),
    (action) => action.kind === 'summon' ? action.cardId : action.kind,
    12,
    3,
  );
  const tactics = roundRobinBy(
    ranked.filter((action) => action.kind === 'tactic'),
    (action) => action.kind === 'tactic' ? action.cardId : action.kind,
    16,
    4,
  );
  const moves = roundRobinBy(
    ranked.filter((action) => action.kind === 'move'),
    (action) => action.kind === 'move' ? action.unitId : action.kind,
    20,
    4,
  );
  const selected = [...attacks, ...abilities, ...summons, ...tactics, ...moves];
  const selectedKeys = new Set(selected.map((action) => JSON.stringify(action)));
  const familyCaps: Record<ActionFamily, number> = {
    attacks: 24,
    abilities: 12,
    summons: 18,
    tactics: 16,
    moves: 28,
  };
  const familyCounts: Record<ActionFamily, number> = {
    attacks: attacks.length,
    abilities: abilities.length,
    summons: summons.length,
    tactics: tactics.length,
    moves: moves.length,
  };
  for (const action of ranked) {
    if (selected.length >= MAX_ACTIONS_PER_NODE) break;
    const key = JSON.stringify(action);
    const family = actionFamily(action);
    if (selectedKeys.has(key) || familyCounts[family] >= familyCaps[family]) continue;
    selected.push(action);
    selectedKeys.add(key);
    familyCounts[family] += 1;
  }
  const stats = emptyCandidateSelectionStats();
  recordCandidateSelection(stats, legal, selected);
  return { actions: selected, stats };
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
  diagnostics: SearchPhaseDiagnostics;
}

interface SearchBudget {
  deadline: number;
  maxNodes: number;
  nodes: number;
  stopReason: SearchStopReason;
  selection: CandidateSelectionAccumulator;
}

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

const createSearchBudget = (maxNodes: number, deadline: number): SearchBudget => ({
  deadline,
  maxNodes,
  nodes: 0,
  stopReason: 'complete',
  selection: emptyCandidateSelectionStats(),
});

const diagnosticsFromBudget = (budget: SearchBudget): SearchPhaseDiagnostics => ({
  nodes: budget.nodes,
  stopReason: budget.stopReason,
  legalActions: budget.selection.legalActions,
  retainedActions: budget.selection.retainedActions,
  legalByKind: { ...budget.selection.legalByKind },
  retainedByKind: { ...budget.selection.retainedByKind },
});

const mergeCandidateStats = (
  accumulator: CandidateSelectionAccumulator,
  stats: CandidateSelectionStats,
): void => {
  accumulator.legalActions += stats.legalActions;
  accumulator.retainedActions += stats.retainedActions;
  for (const kind of GAME_ACTION_KINDS) {
    accumulator.legalByKind[kind] += stats.legalByKind[kind];
    accumulator.retainedByKind[kind] += stats.retainedByKind[kind];
  }
};

const mergeDiagnostics = (
  accumulator: SearchPhaseDiagnostics,
  diagnostics: SearchPhaseDiagnostics,
): void => {
  accumulator.nodes += diagnostics.nodes;
  accumulator.legalActions += diagnostics.legalActions;
  accumulator.retainedActions += diagnostics.retainedActions;
  for (const kind of GAME_ACTION_KINDS) {
    accumulator.legalByKind[kind] += diagnostics.legalByKind[kind];
    accumulator.retainedByKind[kind] += diagnostics.retainedByKind[kind];
  }
  if (diagnostics.stopReason === 'time-limit') accumulator.stopReason = 'time-limit';
  else if (diagnostics.stopReason === 'node-limit' && accumulator.stopReason === 'complete') {
    accumulator.stopReason = 'node-limit';
  }
};

const emptyPhaseDiagnostics = (): SearchPhaseDiagnostics => ({
  nodes: 0,
  stopReason: 'complete',
  legalActions: 0,
  retainedActions: 0,
  legalByKind: emptyActionKindCounts(),
  retainedByKind: emptyActionKindCounts(),
});

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
  let beam: SearchNode[] = [{
    state: root,
    actions: [],
    score: evaluateStrategicPosition(root, perspective).outlook,
  }];
  const completed: CompletedPlan[] = [];
  const visited = new Map<string, number>();
  visited.set(stateSignature(root, includeCards), beam[0].score);

  const addCompleted = (node: SearchNode): void => {
    if (budgetExhausted(budget)) return;
    const endedState = finishTurnForSearch(node.state, actor);
    budget.nodes += 1;
    const score = evaluateStrategicPosition(endedState, perspective).outlook;
    completed.push({ ...node, score, endedState });
  };

  for (let depth = 0; depth < maxDepth && beam.length > 0 && !budgetExhausted(budget); depth += 1) {
    const next: SearchNode[] = [];
    for (const node of beam) {
      if (budgetExhausted(budget)) break;
      addCompleted(node);

      const selection = selectCandidateActions(node.state, actor, includeCards);
      mergeCandidateStats(budget.selection, selection.stats);

      for (const action of selection.actions) {
        if (budgetExhausted(budget)) break;
        const childState = cloneState(node.state);
        const result = applyAiAction(childState, action);
        if (!result.ok) continue;
        budget.nodes += 1;
        const score = evaluateStrategicPosition(childState, perspective).outlook;
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
    diagnostics: diagnosticsFromBudget(budget),
  };
};

const totalMaterial = (state: GameState, player: PlayerId): number =>
  state.units
    .filter((unit) => unit.owner === player)
    .reduce((total, unit) => total + strategicUnitValue(unit), 0);

const visibleCommanderThreats = (
  state: GameState,
  attacker: PlayerId,
  target: UnitState | undefined,
): UnitState[] => {
  if (!target) return [];
  return state.units.filter((unit) => {
    if (unit.owner !== attacker || unit.exhausted) return false;
    const definition = unitDefinition(unit);
    const hillRange = definition.range > 1 && terrainAt(unit.coord) === 'hill' ? 1 : 0;
    return hexDistance(unit.coord, target.coord) <= definition.move + definition.range + hillRange;
  });
};

const incomingCommanderDamage = (
  state: GameState,
  attacker: PlayerId,
  target: UnitState | undefined,
): number => visibleCommanderThreats(state, attacker, target)
  .reduce((damage, unit) => damage + unitDefinition(unit).attack, 0);

const clampTacticalComponent = (value: number): number => {
  const clamped = Math.max(-100, Math.min(100, Math.round(value)));
  return clamped === 0 ? 0 : clamped;
};

/** Visible one-response tactical safety. Hidden cards are intentionally excluded from this assessment. */
export const assessTacticalOutcome = (
  before: GameState,
  worstState: GameState,
  perspective: PlayerId,
  worstResponse: AiAction[] = [],
): TacticalAssessment => {
  const opponent = opponentOf(perspective);
  const beforeCommander = commander(before, perspective);
  const afterCommander = commander(worstState, perspective);
  const beforeThreats = visibleCommanderThreats(before, opponent, beforeCommander).length;
  const afterThreats = visibleCommanderThreats(worstState, opponent, afterCommander).length;
  const incoming = incomingCommanderDamage(worstState, opponent, afterCommander);
  const threatenedFriendlyUnits = worstState.units.filter((unit) =>
    unit.owner === perspective
    && unit.definitionId !== 'commander'
    && visibleCommanderThreats(worstState, opponent, unit).length > 0).length;
  const ownMaterialDelta = totalMaterial(worstState, perspective) - totalMaterial(before, perspective);
  const enemyMaterialRemoved = totalMaterial(before, opponent) - totalMaterial(worstState, opponent);

  let tier: TacticalTier;
  if (worstState.winner === perspective || !commander(worstState, opponent)) tier = 'forced-win';
  else if (worstState.winner === opponent || !afterCommander) tier = 'forced-loss';
  else if (incoming >= afterCommander.hp) tier = 'unsafe';
  else tier = 'safe';

  const components: TacticalComponents = {
    commanderSurvival: tier === 'forced-loss' ? -100 : tier === 'unsafe' ? -55 : tier === 'forced-win' ? 100 : 55,
    commanderHealth: clampTacticalComponent(afterCommander
      ? (afterCommander.hp - (beforeCommander?.hp ?? afterCommander.hp)) * 14
        + afterCommander.hp * 4
      : -100),
    incomingDamage: clampTacticalComponent(-incoming * 18),
    threatenedUnits: clampTacticalComponent(-threatenedFriendlyUnits * 18),
    threatReduction: clampTacticalComponent((beforeThreats - afterThreats) * 28 - incoming * 8),
    friendlyMaterialPreserved: clampTacticalComponent(ownMaterialDelta / 12),
    enemyMaterialRemoved: clampTacticalComponent(enemyMaterialRemoved / 12),
  };
  const rawScore = Object.values(components).reduce((sum, value) => sum + value, 0) / 5;
  return {
    tier,
    score: Math.max(-100, Math.min(100, Math.round(rawScore))),
    incomingCommanderDamage: incoming,
    threatenedFriendlyUnits,
    visibleThreatsRemoved: Math.max(0, beforeThreats - afterThreats),
    components,
    worstResponse,
    worstResponseStrategicOutlook: evaluateStrategicPosition(worstState, perspective).outlook,
  };
};

const tacticalTierRank = (tier: TacticalTier): number => {
  if (tier === 'forced-win') return 3;
  if (tier === 'safe') return 2;
  if (tier === 'unsafe') return 1;
  return 0;
};

interface AssessedPlan {
  candidate: CompletedPlan;
  strategic: StrategicEvaluation;
  tactical: TacticalAssessment;
}

const compareAssessedPlans = (left: AssessedPlan, right: AssessedPlan): number => {
  const tierDifference = tacticalTierRank(right.tactical.tier) - tacticalTierRank(left.tactical.tier);
  if (tierDifference !== 0) return tierDifference;
  const responseDifference = right.tactical.worstResponseStrategicOutlook
    - left.tactical.worstResponseStrategicOutlook;
  if (responseDifference !== 0) return responseDifference;
  const tacticalDifference = right.tactical.score - left.tactical.score;
  if (tacticalDifference !== 0) return tacticalDifference;
  return right.strategic.outlook - left.strategic.outlook;
};

const assessCandidateResponses = (
  initialState: GameState,
  candidates: CompletedPlan[],
  perspective: PlayerId,
  options: Required<AiSearchOptions>,
): { assessed: AssessedPlan[]; diagnostics: SearchPhaseDiagnostics } => {
  const diagnostics = emptyPhaseDiagnostics();
  const assessed: AssessedPlan[] = [];
  const tacticalDeadline = nowMs() + options.tacticalMaxPlanningMs;
  const perCandidateNodes = Math.max(1, Math.floor(options.tacticalMaxNodes / Math.max(1, candidates.length)));
  const responder = opponentOf(perspective);

  for (const candidate of candidates) {
    let worstState = candidate.endedState;
    let worstResponse: AiAction[] = [];
    if (!worstState.winner && worstState.currentPlayer === responder) {
      const responseBudget = createSearchBudget(perCandidateNodes, tacticalDeadline);
      const response = searchTurnPlans(
        worstState,
        responder,
        perspective,
        false,
        false,
        options.responseBeamWidth,
        options.responseDepth,
        Math.min(3, options.candidatePlans),
        responseBudget,
      );
      mergeDiagnostics(diagnostics, response.diagnostics);
      if (response.plans.length > 0) {
        const responses = response.plans.map((plan) => ({
          plan,
          tactical: assessTacticalOutcome(initialState, plan.endedState, perspective, plan.actions),
        }));
        responses.sort((left, right) => {
          const tierDifference = tacticalTierRank(left.tactical.tier) - tacticalTierRank(right.tactical.tier);
          if (tierDifference !== 0) return tierDifference;
          return left.tactical.worstResponseStrategicOutlook
            - right.tactical.worstResponseStrategicOutlook;
        });
        worstState = responses[0].plan.endedState;
        worstResponse = responses[0].plan.actions;
      }
    }
    assessed.push({
      candidate,
      strategic: evaluateStrategicPosition(candidate.endedState, perspective),
      tactical: assessTacticalOutcome(initialState, worstState, perspective, worstResponse),
    });
  }
  return { assessed, diagnostics };
};

/** Plan a complete turn for whichever player is currently active. */
export const planAiTurn = (state: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  const perspective = state.currentPlayer;
  if (state.winner) {
    const strategic = evaluateStrategicPosition(state, perspective);
    return {
      actions: [],
      strategic,
      tactical: assessTacticalOutcome(state, state, perspective),
      diagnostics: { strategy: emptyPhaseDiagnostics(), tactical: emptyPhaseDiagnostics() },
    };
  }

  const options: Required<AiSearchOptions> = { ...COMMON_AI_OPTIONS, ...overrides };
  const budget = createSearchBudget(
    options.strategyMaxNodes,
    nowMs() + options.strategyMaxPlanningMs,
  );

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
  const candidates = initialSearch.plans.length > 0
    ? initialSearch.plans
    : [{
      state: cloneState(state),
      actions: [],
      score: evaluateStrategicPosition(state, perspective).outlook,
      endedState: finishTurnForSearch(state, perspective),
    }];
  const responseAssessment = assessCandidateResponses(state, candidates, perspective, options);
  responseAssessment.assessed.sort(compareAssessedPlans);
  const best = responseAssessment.assessed[0];

  return {
    actions: best.candidate.actions,
    strategic: best.strategic,
    tactical: best.tactical,
    diagnostics: {
      strategy: initialSearch.diagnostics,
      tactical: responseAssessment.diagnostics,
    },
  };
};

export const executeAiPlan = (
  state: GameState,
  plan: AiPlan,
  random: () => number = Math.random,
  observer?: AiExecutionObserver,
): AiTurnResult => {
  const actor = state.currentPlayer;
  const messages: string[] = [];
  for (const action of plan.actions) {
    if (state.winner || state.currentPlayer !== actor) break;
    const result = applyAiAction(state, action);
    observer?.onActionResolved?.({ actor, action, result, state });
    if (!result.ok) {
      messages.push(`AI plan stopped: ${result.message}`);
      break;
    }
    messages.push(result.message);
  }

  if (!state.winner && state.currentPlayer === actor) {
    const result = endTurn(state, random);
    observer?.onTurnEnded?.({ actor, result, state });
    messages.push(result.message);
    return {
      actions: messages,
      endedTurn: result.ok,
      strategic: plan.strategic,
      tactical: plan.tactical,
      diagnostics: plan.diagnostics,
    };
  }

  return {
    actions: messages,
    endedTurn: false,
    strategic: plan.strategic,
    tactical: plan.tactical,
    diagnostics: plan.diagnostics,
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
    const strategic = evaluateStrategicPosition(state, UNDEAD_PLAYER);
    return {
      actions: [],
      strategic,
      tactical: assessTacticalOutcome(state, state, UNDEAD_PLAYER),
      diagnostics: { strategy: emptyPhaseDiagnostics(), tactical: emptyPhaseDiagnostics() },
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
    const plan = planSmartAiTurn(state, options);
    return {
      actions: [],
      endedTurn: false,
      strategic: plan.strategic,
      tactical: plan.tactical,
      diagnostics: plan.diagnostics,
    };
  }
  return runAiTurn(state, random, options);
};

export const runSimpleAiTurn = runSmartAiTurn;
