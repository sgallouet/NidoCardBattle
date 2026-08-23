import humanGauntlet from '../../assets/game/ui/cursors/human-gauntlet.png?url';
import humanGauntletPressed from '../../assets/game/ui/cursors/human-gauntlet-pressed.png?url';
import undeadGauntlet from '../../assets/game/ui/cursors/undead-gauntlet.png?url';
import undeadGauntletPressed from '../../assets/game/ui/cursors/undead-gauntlet-pressed.png?url';
import type { Faction } from './types';

interface CursorPoseDefinition {
  url: string;
  hotspot: readonly [x: number, y: number];
}

interface CursorArtDefinition {
  idle: CursorPoseDefinition;
  pressed: CursorPoseDefinition;
  fx: readonly [primary: string, secondary: string];
}

export const FACTION_CURSOR_ART: Record<Faction, CursorArtDefinition> = {
  human: {
    idle: {
      url: humanGauntlet,
      hotspot: [5, 2],
    },
    pressed: {
      url: humanGauntletPressed,
      hotspot: [12, 11],
    },
    fx: ['#69d8ff', '#ffd46b'],
  },
  undead: {
    idle: {
      url: undeadGauntlet,
      hotspot: [2, 1],
    },
    pressed: {
      url: undeadGauntletPressed,
      hotspot: [15, 17],
    },
    fx: ['#d55cff', '#8d5cff'],
  },
};
