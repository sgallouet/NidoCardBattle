import { describe, expect, it } from 'vitest';
import type { GameState } from '../data/types';
import { buildBattleFinaleStats, describeBattleFinale } from './BattlePresentation';

describe('battle finale copy', () => {
  it('reports a local army-elimination victory', () => {
    expect(describeBattleFinale(1, 1, 'elimination')).toEqual({
      localVictory: true,
      title: 'Victory',
      subtitle: 'The opposing army was eliminated.',
    });
  });

  it('reports a local countdown victory', () => {
    expect(describeBattleFinale(1, 1, 'countdown')).toEqual({
      localVictory: true,
      title: 'Victory',
      subtitle: 'The enemy commander fell and the three-turn survival hold is complete.',
    });
  });

  it('reports a local defeat after the enemy survives the hold', () => {
    expect(describeBattleFinale(2, 1, 'countdown')).toEqual({
      localVictory: false,
      title: 'Defeat',
      subtitle: 'Your commander fell. The enemy survived the three-turn hold.',
    });
  });
});

describe('battle finale stats', () => {
  it('summarizes an elimination finish for the winning army', () => {
    const state = {
      turnNumber: 13,
      units: [{ owner: 1 }, { owner: 1 }],
      sites: [{ owner: 1 }, { owner: 2 }, { owner: 1 }],
    } as unknown as GameState;

    expect(buildBattleFinaleStats(state, 1)).toEqual({
      round: 7,
      survivors: 2,
      sitesHeld: 2,
      finish: 'Army Eliminated',
    });
  });

  it('summarizes a completed hold when defeated units remain', () => {
    const state = {
      turnNumber: 8,
      units: [{ owner: 1 }, { owner: 2 }, { owner: 1 }],
      sites: [{ owner: 1 }, { owner: 2 }, { owner: 2 }],
    } as unknown as GameState;

    expect(buildBattleFinaleStats(state, 1)).toEqual({
      round: 4,
      survivors: 2,
      sitesHeld: 1,
      finish: 'Hold Complete',
    });
  });
});
