import { describe, expect, it } from 'vitest';
import { snapshotBattleState } from './battleLog';
import { createGameState } from './engine';
import { configureFreshGameState } from './NewGameSetup';
import {
  FINALE_ARMY_ART,
  buildBattleResultPresentation,
  keepAnchorsFromCompactSites,
  keepAnchorsFromGameState,
} from './BattleResultPresentation';

const localPlayer = 1 as const;

describe('battle result presentation', () => {
  it('places default Human start on the left with victory art when Humans win', () => {
    const state = createGameState(() => 0.25);
    state.winner = 1;

    const result = buildBattleResultPresentation(state, localPlayer, keepAnchorsFromGameState(state));

    expect(result.left).toMatchObject({
      faction: 'human',
      outcome: 'victory',
      artwork: FINALE_ARMY_ART.human.victory,
    });
    expect(result.right).toMatchObject({
      faction: 'undead',
      outcome: 'defeat',
      artwork: FINALE_ARMY_ART.undead.defeat,
    });
    expect(result.localVictory).toBe(true);
    expect(result.title).toBe('Victory');
    expect(result.factionSubtitle).toBe('Human Triumph');
  });

  it('uses Undead victory art and Human defeat art when Undead win', () => {
    const state = createGameState(() => 0.25);
    state.winner = 2;

    const result = buildBattleResultPresentation(state, localPlayer, keepAnchorsFromGameState(state));

    expect(result.left.faction).toBe('human');
    expect(result.left.outcome).toBe('defeat');
    expect(result.left.artwork).toBe(FINALE_ARMY_ART.human.defeat);
    expect(result.right.faction).toBe('undead');
    expect(result.right.outcome).toBe('victory');
    expect(result.right.artwork).toBe(FINALE_ARMY_ART.undead.victory);
    expect(result.localVictory).toBe(false);
    expect(result.title).toBe('Defeat');
    expect(result.factionSubtitle).toBe('Human Fall');
  });

  it('keeps artwork on the match start sides after a local upper-right Undead deployment', () => {
    const state = createGameState(() => 0.25);
    configureFreshGameState(state, { faction: 'undead', side: 'upperRight' });
    const startAnchors = keepAnchorsFromGameState(state);
    state.winner = 1;

    const capturedKeep = state.sites.find((site) => site.type === 'keep' && site.owner === 1);
    const otherKeep = state.sites.find((site) => site.type === 'keep' && site.owner === 2);
    if (capturedKeep) capturedKeep.owner = 2;
    if (otherKeep) otherKeep.owner = 1;

    const result = buildBattleResultPresentation(state, localPlayer, startAnchors);

    expect(state.players[1].faction).toBe('undead');
    expect(result.right).toMatchObject({
      faction: 'undead',
      outcome: 'victory',
      artwork: FINALE_ARMY_ART.undead.victory,
    });
    expect(result.left).toMatchObject({
      faction: 'human',
      outcome: 'defeat',
      artwork: FINALE_ARMY_ART.human.defeat,
    });
  });

  it('reads starting keep sides from the live battle-log initial snapshot', () => {
    const state = createGameState(() => 0.25);
    configureFreshGameState(state, { faction: 'human', side: 'upperRight' });
    const initial = snapshotBattleState(state);
    state.winner = 2;

    const result = buildBattleResultPresentation(
      state,
      localPlayer,
      keepAnchorsFromCompactSites(initial.sites),
    );

    expect(result.right.faction).toBe('human');
    expect(result.right.outcome).toBe('defeat');
    expect(result.left.faction).toBe('undead');
    expect(result.left.outcome).toBe('victory');
  });
});
