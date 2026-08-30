import { MAP_DECORATIONS, MAP_GARRISONS } from '../data/map';
import type { Coord, GameState, PlayerId, SiteState, Terrain } from '../data/types';
import { effectiveTerrainAt, sameCoord, unitAt } from './engine';

export type TileInsightTone = 'friendly' | 'hostile' | 'neutral' | 'terrain';

export interface TileInsightRow {
  label: string;
  text: string;
}

export interface TileInsightModel {
  title: string;
  eyebrow: string;
  badge: string;
  tone: TileInsightTone;
  rows: TileInsightRow[];
}

const terrainNames: Record<Terrain, string> = {
  plain: 'Open Ground',
  forest: 'Forest',
  hill: 'Hill',
  water: 'Water',
  cliff: 'Cliff',
  mountain: 'Mountain',
  bridge: 'Bridge',
};

const terrainRows = (terrain: Terrain): TileInsightRow[] => {
  switch (terrain) {
    case 'forest':
      return [
        { label: 'Hold', text: 'Take 30% less damage from ranged attacks.' },
        { label: 'Move', text: 'Costs about 1.43 Move to enter.' },
      ];
    case 'hill':
      return [
        { label: 'Hold', text: 'Ranged units gain +1 Range.' },
        { label: 'Move', text: 'Costs 1 Move to enter.' },
      ];
    case 'water':
    case 'cliff':
      return [{ label: 'Move', text: 'Impassable except to Flying units.' }];
    case 'mountain':
      return [{ label: 'Move', text: 'Blocks every unit, including Flying.' }];
    case 'bridge':
      return [{ label: 'Move', text: 'Passable and costs 1 Move to enter.' }];
    case 'plain':
      return [
        { label: 'Hold', text: 'No terrain combat bonus.' },
        { label: 'Move', text: 'Costs 1 Move to enter.' },
      ];
  }
};

const siteName = (site: SiteState): string => {
  if (site.type === 'keep') return 'Home Keep';
  if (site.type === 'fort') return 'Fort';
  return 'Mana Well';
};

const siteReward = (site: SiteState): TileInsightRow => {
  if (site.type === 'keep') {
    return {
      label: 'Reward',
      text: 'Gain +1 mana each turn from turn 2. Deploy units here while empty.',
    };
  }
  if (site.type === 'fort') {
    return {
      label: 'Reward',
      text: 'Deploy units here and at its 3 linked Garrisons while empty.',
    };
  }
  return { label: 'Reward', text: 'Gain +2 mana every 3rd turn.' };
};

const ownership = (
  owner: PlayerId | null,
  viewer: PlayerId,
): Pick<TileInsightModel, 'badge' | 'tone'> => {
  if (owner === viewer) return { badge: 'Yours', tone: 'friendly' };
  if (owner === null) return { badge: 'Neutral', tone: 'neutral' };
  return { badge: 'Enemy', tone: 'hostile' };
};

const siteInsight = (state: GameState, site: SiteState, viewer: PlayerId): TileInsightModel => {
  const owner = ownership(site.owner, viewer);
  const friendlyOccupant = unitAt(state, site.coord)?.owner === viewer;
  const captureText = site.owner === viewer
    ? 'Control remains yours after your unit leaves.'
    : friendlyOccupant
      ? 'Ready — end your turn to capture it.'
      : 'End your turn with a unit here to capture it.';
  return {
    title: siteName(site),
    eyebrow: 'Capturable site',
    ...owner,
    rows: [
      { label: site.owner === viewer ? 'Control' : 'Capture', text: captureText },
      siteReward(site),
    ],
  };
};

export const tileInsightFor = (
  state: GameState,
  coord: Coord,
  viewer: PlayerId = 1,
): TileInsightModel => {
  const site = state.sites.find((candidate) => sameCoord(candidate.coord, coord));
  if (site) return siteInsight(state, site, viewer);

  const garrison = MAP_GARRISONS.find((candidate) => sameCoord(candidate.coord, coord));
  if (garrison) {
    const fort = state.sites.find((candidate) => candidate.id === garrison.fortId);
    const owner = ownership(fort?.owner ?? null, viewer);
    return {
      title: 'Garrison',
      eyebrow: 'Linked outpost',
      ...owner,
      rows: [
        {
          label: fort?.owner === viewer ? 'Control' : 'Unlock',
          text: fort?.owner === viewer
            ? 'Linked Fort controlled. This is an active deployment point.'
            : 'Capture its linked Fort to control this Garrison.',
        },
        { label: 'Reward', text: 'Deploy units here while the hex is empty.' },
      ],
    };
  }

  const decoration = MAP_DECORATIONS.find((candidate) => sameCoord(candidate.coord, coord));
  if (decoration?.type === 'village') {
    return {
      title: 'Village',
      eyebrow: 'Special location',
      badge: 'Occupy',
      tone: 'neutral',
      rows: [
        { label: 'Stay', text: 'Your unit restores +1 HP at the start of your turn.' },
        { label: 'Control', text: 'Not captured — the benefit lasts only while occupied.' },
      ],
    };
  }
  if (decoration?.type === 'ruin') {
    return {
      title: 'Ruin',
      eyebrow: 'Special location',
      badge: 'Occupy',
      tone: 'neutral',
      rows: [
        { label: 'Stay', text: 'Gain +1 mana when your turn starts with a unit here.' },
        { label: 'Control', text: 'Not captured — the benefit lasts only while occupied.' },
      ],
    };
  }

  const pendingWell = state.pendingManaWells.find((candidate) => sameCoord(candidate.coord, coord));
  if (pendingWell) {
    const owner = ownership(pendingWell.owner, viewer);
    return {
      title: 'Profaned Ground',
      eyebrow: 'Site forming',
      ...owner,
      rows: [
        {
          label: 'Progress',
          text: `Becomes a Mana Well after ${pendingWell.remainingTurns} more owner turn${pendingWell.remainingTurns === 1 ? '' : 's'}.`,
        },
        { label: 'Reward', text: 'The completed Well grants +2 mana every 3rd turn.' },
      ],
    };
  }

  const terrain = effectiveTerrainAt(state, coord);
  const rows = terrainRows(terrain);
  const graveLocked = state.tileEffects.some(
    (effect) => effect.kind === 'graveLock' && sameCoord(effect.coord, coord),
  );
  if (graveLocked) {
    rows.unshift({ label: 'Locked', text: 'Units cannot enter or leave this hex right now.' });
  }
  return {
    title: terrainNames[terrain],
    eyebrow: 'Terrain',
    badge: graveLocked ? 'Grave locked' : terrain === 'mountain' ? 'Blocked' : 'Tile',
    tone: graveLocked ? 'hostile' : 'terrain',
    rows,
  };
};
