import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from './engine';
import { LiveBattleLogRecorder } from './liveBattleLog';
import { clearSavedGameState, loadSavedMatch, saveMatch } from './save';

const installStorage = (initial: Record<string, string> = {}): void => {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
};

describe('saved matches', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects matches from before persistent battle-log drafts', () => {
    installStorage({
      'nidocardbattle.match': JSON.stringify({
        version: 2,
        savedAt: new Date(0).toISOString(),
        state: createGameState(),
      }),
    });

    expect(loadSavedMatch()).toBeNull();
  });

  it('round-trips the current save version', () => {
    installStorage();
    const state = createGameState();
    const battleLog = new LiveBattleLogRecorder(state).createLog(state);

    expect(saveMatch(state, battleLog)).toBe(true);
    expect(loadSavedMatch()).toEqual({ state, battleLog });
  });

  it('clears the saved state and its battle-log draft together', () => {
    installStorage();
    const state = createGameState();
    const battleLog = new LiveBattleLogRecorder(state).createLog(state);
    saveMatch(state, battleLog);

    clearSavedGameState();

    expect(loadSavedMatch()).toBeNull();
  });
});
