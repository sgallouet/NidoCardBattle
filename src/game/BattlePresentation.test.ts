import { describe, expect, it } from 'vitest';
import { describeBattleFinale } from './BattlePresentation';

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
