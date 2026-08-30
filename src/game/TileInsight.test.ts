import { describe, expect, it } from 'vitest';
import { MAP_DECORATIONS, MAP_GARRISONS } from '../data/map';
import { createGameState } from './engine';
import { tileInsightFor } from './TileInsight';

describe('tileInsightFor', () => {
  it('presents MPC1-MPC3 and ECM3 for a capturable Well', () => {
    const state = createGameState();
    const well = state.sites.find((site) => site.type === 'well')!;

    const insight = tileInsightFor(state, well.coord);

    expect(insight.title).toBe('Mana Well');
    expect(insight.badge).toBe('Neutral');
    expect(insight.rows.map((row) => row.label)).toEqual(['Capture', 'Reward']);
    expect(insight.rows[1].text).toContain('+2 mana');
  });

  it('presents MPC4 and CRU3 for a linked Garrison', () => {
    const state = createGameState();
    const garrison = MAP_GARRISONS[0];
    state.sites.find((site) => site.id === garrison.fortId)!.owner = 1;

    const insight = tileInsightFor(state, garrison.coord);

    expect(insight.title).toBe('Garrison');
    expect(insight.badge).toBe('Yours');
    expect(insight.rows[0].text).toContain('active deployment point');
  });

  it('presents MPL8 and MPL9 occupation benefits', () => {
    const state = createGameState();
    const village = MAP_DECORATIONS.find((decoration) => decoration.type === 'village')!;
    const ruin = MAP_DECORATIONS.find((decoration) => decoration.type === 'ruin')!;

    expect(tileInsightFor(state, village.coord).rows[0].text).toContain('+1 HP');
    expect(tileInsightFor(state, ruin.coord).rows[0].text).toContain('+1 mana');
  });

  it('presents MPT2-MPT4 terrain benefits', () => {
    const state = createGameState();

    expect(tileInsightFor(state, { q: 1, r: 0 }).rows[0].text).toContain('30%');
    expect(tileInsightFor(state, { q: 6, r: 0 }).rows[0].text).toContain('+1 Range');
  });
});
