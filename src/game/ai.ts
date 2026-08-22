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
const DEFAULT_BEAM_WIDTH = 18;
const DEFAULT_MAX_DEPTH = 10;
const MAX_ACTIONS_PER_NODE = 96;
const PLANNING_RANDOM = () => 0.5;

export interface AiTurnResult {
  actions: string[];
  endedTurn: boolean;
  planScore: number;
  searchedStates: number;
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
}

export interface AiSearchOptions {
  beamWidth?: number;
  maxDepth?: number;
}

const cloneState = (state: GameState): GameState => structuredClone(state);

const coordFromKey = (key: string): Coord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

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

/**
 * Counts how many units from attackerPlayer could attack each hex on their next ready turn.
 * This deliberately ignores hidden cards and only reasons from visible board pieces.
 */
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

const stateSignature = (state: GameState): string => {
  const units = [...state.units]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((unit) => [
      unit.id, unit.definitionId, unit.owner, unit.hp, unit.coord.q, unit.coord.r,
      unit.exhausted ? 1 : 0, unit.moved ? 1 : 0, unit.attacked ? 1 : 0,
    ].join(':'))
    .join('|');
  const sites = state.sites.map((site) => `${site.id}:${site.owner ?? 0}`).join('|');
  const ai = state.players[AI_PLAYER];
  return `${state.currentPlayer};${ai.mana};${ai.hand.join(',')};${units};${sites};${state.countdown?.player ?? 0}:${state.countdown?.checkpoints ?? 0}`;
};

export const generateLegalAiActions = (state: GameState): AiAction[] => {
  if (state.winner || state.currentPlayer !== AI_PLAYER) return [];
  const actions: AiAction[] = [];
  const player = state.players[AI_PLAYER];

  const seenCards = new Set<CardDefinitionId>();
  player.hand.forEach((rawCardId, handIndex) => {
    const cardId = rawCardId as CardDefinitionId;
    const card = CARD_DEFINITIONS[cardId];
    if (!card || seenCards.has(cardId) || card.type !== 'unit' || card.faction !== player.faction || card.cost > player.mana) return;
    seenCards.add(cardId);
    for (const destination of getValidSummonCoords(state, AI_PLAYER)) {
      actions.push({ kind: 'summon', handIndex, cardId, destination });
    }
  });

  for (const unit of state.units.filter((candidate) => candidate.owner === AI_PLAYER && !candidate.exhausted)) {
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

export const applyAiAction = (state: GameState, action: AiAction): ActionResult => {
  switch (action.kind) {
    case 'summon': {
      if (state.players[AI_PLAYER].hand[action.handIndex] !== action.cardId) {
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

const actionPriority = (state: GameState, action: AiAction, humanThreats: Map<string, number>): number => {
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
    const humanCommander = commander(state, HUMAN_PLAYER);
    const proximity = humanCommander ? 12 - hexDistance(action.destination, humanCommander.coord) : 0;
    return card.cost * 300 + proximity * 30;
  }

  if (action.kind === 'displace') {
    const target = findUnit(state, action.targetId);
    const humanCommander = commander(state, HUMAN_PLAYER);
    const enemyBonus = target?.owner === HUMAN_PLAYER ? 1_200 : -150;
    const commanderBonus = target?.definitionId === 'commander' ? 6_000 : 0;
    const proximity = humanCommander ? 10 - hexDistance(action.destination, humanCommander.coord) : 0;
    return enemyBonus + commanderBonus + proximity * 80;
  }

  const unit = findUnit(state, action.unitId);
  if (!unit) return -100_000;
  const humanCommander = commander(state, HUMAN_PLAYER);
  const before = humanCommander ? hexDistance(unit.coord, humanCommander.coord) : 0;
  const after = humanCommander ? hexDistance(action.destination, humanCommander.coord) : 0;
  const siteBonus = state.sites.some((site) => site.owner !== AI_PLAYER
    && site.coord.q === action.destination.q
    && site.coord.r === action.destination.r) ? 1_100 : 0;
  const safetyBonus = unit.definitionId === 'commander'
    ? (humanThreats.get(coordKey(action.destination)) ?? 0) === 0 ? 3_000 : -4_000
    : 0;
  return (before - after) * 260 + siteBonus + safetyBonus;
};

interface SearchNode {
  state: GameState;
  actions: AiAction[];
  score: number;
}

const scoreIfTurnEnds = (state: GameState): number => {
  const ended = cloneState(state);
  if (!ended.winner && ended.currentPlayer === AI_PLAYER) endTurn(ended, PLANNING_RANDOM);
  return evaluateAiPosition(ended);
};

export const planSmartAiTurn = (state: GameState, options: AiSearchOptions = {}): AiPlan => {
  if (state.winner || state.currentPlayer !== AI_PLAYER) {
    return { actions: [], score: evaluateAiPosition(state), searchedStates: 0 };
  }

  const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const root = cloneState(state);
  let beam: SearchNode[] = [{ state: root, actions: [], score: evaluateAiPosition(root) }];
  let best: AiPlan = { actions: [], score: scoreIfTurnEnds(root), searchedStates: 1 };
  let searchedStates = 1;
  const visited = new Map<string, number>();
  visited.set(stateSignature(root), beam[0].score);

  for (let depth = 0; depth < maxDepth && beam.length > 0; depth += 1) {
    const next: SearchNode[] = [];

    for (const node of beam) {
      const endScore = scoreIfTurnEnds(node.state);
      searchedStates += 1;
      if (endScore > best.score) best = { actions: node.actions, score: endScore, searchedStates };

      const humanThreats = buildThreatMap(node.state, HUMAN_PLAYER);
      const candidateActions = generateLegalAiActions(node.state)
        .sort((a, b) => actionPriority(node.state, b, humanThreats) - actionPriority(node.state, a, humanThreats))
        .slice(0, MAX_ACTIONS_PER_NODE);

      for (const action of candidateActions) {
        const childState = cloneState(node.state);
        const result = applyAiAction(childState, action);
        if (!result.ok) continue;
        searchedStates += 1;

        const score = evaluateAiPosition(childState);
        const signature = stateSignature(childState);
        const previousScore = visited.get(signature);
        if (previousScore !== undefined && previousScore >= score) continue;
        visited.set(signature, score);
        next.push({ state: childState, actions: [...node.actions, action], score });
      }
    }

    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, beamWidth);
  }

  best.searchedStates = searchedStates;
  return best;
};

export const runSmartAiTurn = (
  state: GameState,
  random: () => number = Math.random,
): AiTurnResult => {
  if (state.winner || state.currentPlayer !== AI_PLAYER) {
    return { actions: [], endedTurn: false, planScore: evaluateAiPosition(state), searchedStates: 0 };
  }

  const plan = planSmartAiTurn(state);
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
    };
  }

  return {
    actions,
    endedTurn: false,
    planScore: plan.score,
    searchedStates: plan.searchedStates,
  };
};

/** Backwards-compatible name for older callers while the prototype transitions to the smart planner. */
export const runSimpleAiTurn = runSmartAiTurn;
