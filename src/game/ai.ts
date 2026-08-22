import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import {
  attackUnit,
  endTurn,
  findUnit,
  getAttackTargets,
  getReachableCoords,
  getValidSummonCoords,
  hexDistance,
  moveUnit,
  playUnitCard,
  unitDefinition,
} from './engine';

const AI_PLAYER: PlayerId = 2;

export interface AiTurnResult {
  actions: string[];
  endedTurn: boolean;
}

const coordFromKey = (key: string): Coord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

const chooseAttackTarget = (targets: UnitState[]): UnitState | undefined =>
  [...targets].sort((a, b) => {
    const aCommander = a.definitionId === 'commander' ? 1 : 0;
    const bCommander = b.definitionId === 'commander' ? 1 : 0;
    if (aCommander !== bCommander) return bCommander - aCommander;
    if (a.hp !== b.hp) return a.hp - b.hp;
    return unitDefinition(b).attack - unitDefinition(a).attack;
  })[0];

const chooseStrategicTarget = (state: GameState, unit: UnitState): Coord | undefined => {
  const candidates: Array<{ coord: Coord; bonus: number }> = [];
  const enemyCommander = state.units.find(
    (candidate) => candidate.owner !== AI_PLAYER && candidate.definitionId === 'commander',
  );
  if (enemyCommander) candidates.push({ coord: enemyCommander.coord, bonus: -3 });

  for (const site of state.sites) {
    if (site.owner === AI_PLAYER || site.type === 'keep') continue;
    candidates.push({
      coord: site.coord,
      bonus: site.type === 'well' ? -2 : -1,
    });
  }

  for (const enemy of state.units) {
    if (enemy.owner === AI_PLAYER || enemy.definitionId === 'commander') continue;
    candidates.push({ coord: enemy.coord, bonus: 1 });
  }

  return candidates.sort((a, b) =>
    (hexDistance(unit.coord, a.coord) + a.bonus) - (hexDistance(unit.coord, b.coord) + b.bonus),
  )[0]?.coord;
};

const chooseSummonCoord = (state: GameState): Coord | undefined => {
  const coords = getValidSummonCoords(state, AI_PLAYER);
  const enemyCommander = state.units.find(
    (unit) => unit.owner !== AI_PLAYER && unit.definitionId === 'commander',
  );
  if (!enemyCommander) return coords[0];
  return [...coords].sort(
    (a, b) => hexDistance(a, enemyCommander.coord) - hexDistance(b, enemyCommander.coord),
  )[0];
};

const summonAffordableUnits = (state: GameState, actions: string[]): void => {
  for (let plays = 0; plays < 8; plays += 1) {
    const player = state.players[AI_PLAYER];
    const candidates = player.hand
      .map((cardId, handIndex) => ({
        handIndex,
        card: CARD_DEFINITIONS[cardId as CardDefinitionId],
      }))
      .filter(({ card }) => card?.type === 'unit' && card.faction === player.faction && card.cost <= player.mana)
      .sort((a, b) => b.card.cost - a.card.cost);

    const choice = candidates[0];
    const destination = choice ? chooseSummonCoord(state) : undefined;
    if (!choice || !destination) return;

    const result = playUnitCard(state, choice.handIndex, destination);
    if (!result.ok) return;
    actions.push(result.message);
  }
};

const attackIfPossible = (state: GameState, unitId: string, actions: string[]): boolean => {
  const target = chooseAttackTarget(getAttackTargets(state, unitId));
  if (!target) return false;
  const result = attackUnit(state, unitId, target.id);
  if (result.ok) actions.push(result.message);
  return result.ok;
};

const moveTowardObjective = (state: GameState, unitId: string, actions: string[]): void => {
  const unit = findUnit(state, unitId);
  if (!unit) return;
  const target = chooseStrategicTarget(state, unit);
  if (!target) return;

  const reachable = getReachableCoords(state, unitId);
  if (reachable.size === 0) return;

  const destination = [...reachable.entries()]
    .map(([key, cost]) => ({ coord: coordFromKey(key), cost }))
    .sort((a, b) => {
      const distanceDelta = hexDistance(a.coord, target) - hexDistance(b.coord, target);
      return distanceDelta !== 0 ? distanceDelta : a.cost - b.cost;
    })[0]?.coord;
  if (!destination) return;

  const result = moveUnit(state, unitId, destination);
  if (result.ok) actions.push(result.message);
};

export const runSimpleAiTurn = (
  state: GameState,
  random: () => number = Math.random,
): AiTurnResult => {
  const actions: string[] = [];
  if (state.winner || state.currentPlayer !== AI_PLAYER) return { actions, endedTurn: false };

  summonAffordableUnits(state, actions);

  const unitIds = state.units
    .filter((unit) => unit.owner === AI_PLAYER && !unit.exhausted)
    .map((unit) => unit.id);

  for (const unitId of unitIds) {
    if (state.winner) break;
    const unit = findUnit(state, unitId);
    if (!unit) continue;

    if (attackIfPossible(state, unitId, actions)) continue;
    moveTowardObjective(state, unitId, actions);
    attackIfPossible(state, unitId, actions);
  }

  if (!state.winner && state.currentPlayer === AI_PLAYER) {
    const result = endTurn(state, random);
    actions.push(result.message);
    return { actions, endedTurn: result.ok };
  }

  return { actions, endedTurn: false };
};
