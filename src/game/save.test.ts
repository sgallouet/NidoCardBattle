import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from './engine';
import { loadSavedGameState, saveGameState } from './save';

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

  it('rejects matches from before the empty-Home-Keep setup', () => {
    installStorage({
      'nidocardbattle.match': JSON.stringify({
        version: 1,
        savedAt: new Date(0).toISOString(),
        state: createGameState(),
      }),
    });

    expect(loadSavedGameState()).toBeNull();
  });

  it('round-trips the current save version', () => {
    installStorage();
    const state = createGameState();

    expect(saveGameState(state)).toBe(true);
    expect(loadSavedGameState()).toEqual(state);
  });
});
