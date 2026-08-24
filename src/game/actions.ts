import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { Ability, ActionResult, Coord, GameState, PlayerId } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  curseUnit,
  displaceUnit,
  findUnit,
  getAttackTargets,
  getCurseTargets,
  getDisplaceDestinations,
  getDisplaceTargets,
  getInvokeDestinations,
  getRallyTargets,
  getReachableCoords,
  getSoulLinkTargets,
  getTacticTargetCoords,
  getTacticTargets,
  getValidSummonCoords,
  hexDistance,
  moveUnit,
  invokeBeast,
  playTacticCard,
  playTacticCardAtCoord,
  playUnitCard,
  rallyAdjacentAllies,
  restoreAdjacentAlly,
  soulLinkUnit,
  unitDefinition,
} from './engine';

/**
 * Complete gameplay action vocabulary consumed by AI, simulation and replay-style systems.
 * Passive traits never appear here: they resolve inside the engine when one of these actions is applied.
 * New active abilities should be added here, not in the AI planner.
 */
export type GameAction =
  | { kind: 'summon'; handIndex: number; cardId: CardDefinitionId; destination: Coord; restoreTargetId?: string }
  | { kind: 'tactic'; handIndex: number; cardId: CardDefinitionId; targetId: string }
  | { kind: 'tactic'; handIndex: number; cardId: CardDefinitionId; destination: Coord }
  | { kind: 'move'; unitId: string; destination: Coord }
  | { kind: 'attack'; unitId: string; targetId: string }
  | { kind: 'displace'; unitId: string; targetId: string; destination: Coord }
  | { kind: 'rally'; unitId: string }
  | { kind: 'soulLink'; unitId: string; targetId: string }
  | { kind: 'curse'; unitId: string; targetId: string }
  | { kind: 'invoke'; unitId: string; destination: Coord };

const GAME_ACTION_KIND_SET = {
  summon: true,
  tactic: true,
  move: true,
  attack: true,
  displace: true,
  rally: true,
  soulLink: true,
  curse: true,
  invoke: true,
} satisfies Record<GameAction['kind'], true>;

export const GAME_ACTION_KINDS = Object.keys(GAME_ACTION_KIND_SET) as GameAction['kind'][];

export interface LegalActionOptions {
  includeCards?: boolean;
}

const coordFromKey = (key: string): Coord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

const restoreTargetsForSummon = (state: GameState, playerId: PlayerId, destination: Coord): string[] =>
  state.units
    .filter((unit) => unit.owner === playerId
      && unit.hp < unitDefinition(unit).maxHp
      && hexDistance(destination, unit.coord) === 1)
    .map((unit) => unit.id);

const abilityActions = (state: GameState, unitId: string, ability: Ability | undefined): GameAction[] => {
  if (!ability) return [];

  switch (ability) {
    case 'Displace':
      return getDisplaceTargets(state, unitId).flatMap((target) =>
        getDisplaceDestinations(state, unitId, target.id).map((destination) => ({
          kind: 'displace' as const,
          unitId,
          targetId: target.id,
          destination,
        })));
    case 'Rally':
      return getRallyTargets(state, unitId).length > 0 ? [{ kind: 'rally', unitId }] : [];
    case 'SoulLink':
      return getSoulLinkTargets(state, unitId).map((target) => ({
        kind: 'soulLink' as const,
        unitId,
        targetId: target.id,
      }));
    case 'Curse':
      return getCurseTargets(state, unitId).map((target) => ({
        kind: 'curse' as const,
        unitId,
        targetId: target.id,
      }));
    case 'Restore':
    case 'BloodDrain':
    case 'Cleave':
      return [];
    default: {
      const unhandledAbility: never = ability;
      return unhandledAbility;
    }
  }
};

/** Engine-owned legal action generation. The AI must never recreate unit/card rules itself. */
export const getLegalGameActions = (
  state: GameState,
  playerId: PlayerId = state.currentPlayer,
  options: LegalActionOptions = {},
): GameAction[] => {
  if (state.winner || state.currentPlayer !== playerId) return [];
  const includeCards = options.includeCards ?? true;
  const actions: GameAction[] = [];
  const player = state.players[playerId];

  if (includeCards) {
    const seenCards = new Set<CardDefinitionId>();
    player.hand.forEach((rawCardId, handIndex) => {
      const cardId = rawCardId as CardDefinitionId;
      const card = CARD_DEFINITIONS[cardId];
      if (!card
        || seenCards.has(cardId)
        || (card.faction !== 'shared' && card.faction !== player.faction)
        || card.cost > player.mana) return;
      seenCards.add(cardId);

      if (card.type === 'unit') {
        const definition = UNIT_DEFINITIONS[card.unitId as UnitDefinitionId];
        for (const destination of getValidSummonCoords(state, playerId)) {
          if (definition.ability === 'Restore') {
            const restoreTargets = restoreTargetsForSummon(state, playerId, destination);
            if (restoreTargets.length > 0) {
              for (const restoreTargetId of restoreTargets) {
                actions.push({ kind: 'summon', handIndex, cardId, destination, restoreTargetId });
              }
              continue;
            }
          }
          actions.push({ kind: 'summon', handIndex, cardId, destination });
        }
      } else {
        for (const target of getTacticTargets(state, cardId)) {
          actions.push({ kind: 'tactic', handIndex, cardId, targetId: target.id });
        }
        for (const destination of getTacticTargetCoords(state, cardId)) {
          actions.push({ kind: 'tactic', handIndex, cardId, destination });
        }
      }
    });
  }

  for (const unit of state.units) {
    if (unit.owner !== playerId || unit.exhausted) continue;

    for (const target of getAttackTargets(state, unit.id)) {
      actions.push({ kind: 'attack', unitId: unit.id, targetId: target.id });
    }
    for (const key of getReachableCoords(state, unit.id).keys()) {
      actions.push({ kind: 'move', unitId: unit.id, destination: coordFromKey(key) });
    }
    actions.push(...abilityActions(state, unit.id, unitDefinition(unit).ability));
    for (const destination of getInvokeDestinations(state, unit.id)) {
      actions.push({ kind: 'invoke', unitId: unit.id, destination });
    }
  }

  return actions;
};

/** Engine-owned action application. Search, AI, replays and future networking can all use the same resolver. */
export const applyGameAction = (state: GameState, action: GameAction): ActionResult => {
  switch (action.kind) {
    case 'summon': {
      if (state.players[state.currentPlayer].hand[action.handIndex] !== action.cardId) {
        return { ok: false, message: 'Planned summon card is no longer at that hand index.' };
      }
      const result = playUnitCard(state, action.handIndex, action.destination);
      if (!result.ok || !action.restoreTargetId || !result.summonedUnitId) return result;
      const restore = restoreAdjacentAlly(state, result.summonedUnitId, action.restoreTargetId);
      return restore.ok
        ? { ...result, message: `${result.message} ${restore.message}` }
        : { ok: false, message: restore.message };
    }
    case 'tactic': {
      if (state.players[state.currentPlayer].hand[action.handIndex] !== action.cardId) {
        return { ok: false, message: 'Planned tactic card is no longer at that hand index.' };
      }
      if ('destination' in action) return playTacticCardAtCoord(state, action.handIndex, action.destination);
      return playTacticCard(state, action.handIndex, action.targetId);
    }
    case 'move':
      return moveUnit(state, action.unitId, action.destination);
    case 'attack':
      return attackUnit(state, action.unitId, action.targetId);
    case 'displace':
      return displaceUnit(state, action.unitId, action.targetId, action.destination);
    case 'rally':
      return rallyAdjacentAllies(state, action.unitId);
    case 'soulLink':
      return soulLinkUnit(state, action.unitId, action.targetId);
    case 'curse':
      return curseUnit(state, action.unitId, action.targetId);
    case 'invoke':
      return invokeBeast(state, action.unitId, action.destination);
    default: {
      const unhandledAction: never = action;
      return unhandledAction;
    }
  }
};

export const actionActorId = (action: GameAction): string | undefined =>
  'unitId' in action ? action.unitId : undefined;

export const actionTargetId = (action: GameAction): string | undefined =>
  'targetId' in action ? action.targetId : 'restoreTargetId' in action ? action.restoreTargetId : undefined;

export const isLegalGameAction = (state: GameState, action: GameAction): boolean => {
  const legal = getLegalGameActions(state);
  return legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action));
};

export const actionUnit = (state: GameState, action: GameAction) => {
  const id = actionActorId(action);
  return id ? findUnit(state, id) : undefined;
};
