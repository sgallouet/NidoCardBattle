import type { GameState, PlayerId } from '../data/types';
import { BATTLE_LOG_SCHEMA_VERSION } from './battleLog';
import {
  LIVE_BATTLE_LOG_SCHEMA_VERSION,
  type LiveBattleLog,
} from './liveBattleLog';

const SAVE_KEY = 'nidocardbattle.match';
const SAVE_VERSION = 3 as const;

interface SaveEnvelope {
  version: typeof SAVE_VERSION;
  savedAt: string;
  state: GameState;
  battleLog: LiveBattleLog;
}

export interface SavedMatch {
  state: GameState;
  battleLog: LiveBattleLog;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPlayerId = (value: unknown): value is PlayerId => value === 1 || value === 2;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isCurrentGameState = (value: unknown): value is GameState => {
  if (!isRecord(value)) return false;
  if (!isPlayerId(value.currentPlayer)) return false;
  if (!isPositiveInteger(value.turnNumber)) return false;
  if (!isRecord(value.players) || !isRecord(value.players['1']) || !isRecord(value.players['2'])) return false;
  if (!Array.isArray(value.units) || !Array.isArray(value.sites)) return false;
  if (!Array.isArray(value.builtBridges) || !Array.isArray(value.scorchedForests)) return false;
  if (!Array.isArray(value.pendingManaWells) || !Array.isArray(value.tileEffects)) return false;
  if (!isPositiveInteger(value.nextUnitId) || !isPositiveInteger(value.nextSiteId)) return false;
  if (value.winner !== null && !isPlayerId(value.winner)) return false;

  for (const playerId of ['1', '2'] as const) {
    const player = value.players[playerId];
    if (!isRecord(player)
      || !Array.isArray(player.deck)
      || !Array.isArray(player.hand)
      || !Array.isArray(player.discard)
      || typeof player.mana !== 'number') return false;
  }
  return true;
};

const isLiveBattleLogDraft = (value: unknown): value is LiveBattleLog => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === LIVE_BATTLE_LOG_SCHEMA_VERSION
    && value.stateSchemaVersion === BATTLE_LOG_SCHEMA_VERSION
    && value.source === 'live-human-vs-ai'
    && typeof value.startedAt === 'string'
    && isPositiveInteger(value.initialTurnNumber)
    && typeof value.historyComplete === 'boolean'
    && typeof value.resumeCount === 'number'
    && Number.isInteger(value.resumeCount)
    && value.resumeCount >= 0
    && Array.isArray(value.resumedAt)
    && value.resumedAt.every((entry) => typeof entry === 'string')
    && value.resumedAt.length === value.resumeCount
    && value.completed === false
    && value.completedAt === null
    && value.winner === null
    && isRecord(value.initial)
    && value.initial.turnNumber === value.initialTurnNumber
    && isRecord(value.final)
    && Array.isArray(value.events);
};

export const loadSavedMatch = (): SavedMatch | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)
      || parsed.version !== SAVE_VERSION
      || !isCurrentGameState(parsed.state)
      || !isLiveBattleLogDraft(parsed.battleLog)) return null;
    return { state: parsed.state, battleLog: parsed.battleLog };
  } catch {
    return null;
  }
};

export const saveMatch = (state: GameState, battleLog: LiveBattleLog): boolean => {
  if (typeof localStorage === 'undefined') return false;
  if (battleLog.completed) throw new Error('Completed matches must not be persisted as resumable matches.');
  try {
    const envelope: SaveEnvelope = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      state,
      battleLog,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
};

export const clearSavedGameState = (): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
  }
};
