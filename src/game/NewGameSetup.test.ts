import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_SIDE_SLOTS } from '../data/map';
import { siteArtFor } from '../data/siteArt';
import { createGameState, getValidSummonCoords, playUnitCard, sameCoord } from './engine';
import {
  alignCommanderRuntimeForLocalFaction,
  configureFreshGameState,
  type StartSide,
} from './NewGameSetup';

const fixedRandom = () => 0.25;

afterEach(() => {
  alignCommanderRuntimeForLocalFaction('human');
});

describe('CRU3 configurable new-game spawn sources', () => {
  for (const side of ['bottomLeft', 'upperRight'] as StartSide[]) {
    it(`keeps the local Undead Home Keep usable from ${side}`, () => {
      const state = createGameState(fixedRandom);
      configureFreshGameState(state, { faction: 'undead', side });

      const slot = STARTING_SIDE_SLOTS[side];
      const keep = state.sites.find((site) => site.id === slot.keepId);
      expect(keep).toBeDefined();
      if (!keep) throw new Error(`Missing configured Home Keep ${slot.keepId}.`);

      expect(state.players[1].faction).toBe('undead');
      expect(keep.owner).toBe(1);
      expect(getValidSummonCoords(state, 1).some((coord) => sameCoord(coord, keep.coord))).toBe(true);
      expect(siteArtFor('keep', 1).textureKey).toBe('site-keep-undead');

      state.players[1].hand = ['skeletalInfantry'];
      state.players[1].mana = 3;
      const result = playUnitCard(state, 0, keep.coord);
      expect(result.ok).toBe(true);
    });
  }
});
