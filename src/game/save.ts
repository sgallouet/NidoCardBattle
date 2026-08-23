import type { GameState, PlayerId } from '../data/types';

const SAVE_KEY = 'nidocardbattle.match';
const SAVE_VERSION = 2 as const;

interface SaveEnvelope {
  version: typeof SAVE_VERSION;
  savedAt: string;
  state: GameState;
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

export const loadSavedGameState = (): GameState | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVE_VERSION || !isCurrentGameState(parsed.state)) return null;
    return parsed.state;
  } catch {
    return null;
  }
};

export const saveGameState = (state: GameState): boolean => {
  if (typeof localStorage === 'undefined') return false;
  try {
    const envelope: SaveEnvelope = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      state,
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
