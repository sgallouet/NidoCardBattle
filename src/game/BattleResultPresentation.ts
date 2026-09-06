import type { Coord, Faction, GameState, PlayerId, SiteState } from '../data/types';
import humanDefeatArt from '../../assets/game/ui/endgame/human-defeat.png?url';
import humanVictoryArt from '../../assets/game/ui/endgame/human-victory.png?url';
import undeadDefeatArt from '../../assets/game/ui/endgame/undead-defeat.png?url';
import undeadVictoryArt from '../../assets/game/ui/endgame/undead-victory.png?url';
import type { CompactSiteState } from './battleLog';

export const FINALE_ARMY_ART = {
  human: {
    victory: humanVictoryArt,
    defeat: humanDefeatArt,
  },
  undead: {
    victory: undeadVictoryArt,
    defeat: undeadDefeatArt,
  },
} as const;

export type BattleArmyOutcome = 'victory' | 'defeat';

export interface StartingKeepAnchor {
  coord: Coord;
  owner: PlayerId;
}

export interface ArmyResultPresentation {
  player: PlayerId;
  faction: Faction;
  outcome: BattleArmyOutcome;
  artwork: string;
}

export interface BattleResultPresentation {
  winner: PlayerId;
  loser: PlayerId;
  localVictory: boolean;
  title: string;
  subtitle: string;
  factionSubtitle: string;
  left: ArmyResultPresentation;
  right: ArmyResultPresentation;
}

const axialDisplayX = (coord: Coord): number => coord.q + (coord.r % 2) * 0.5;

const isPlayerId = (value: PlayerId | null): value is PlayerId => value === 1 || value === 2;

const factionLabel = (faction: Faction): string => (faction === 'undead' ? 'Undead' : 'Human');

export const describeBattleFinale = (
  winner: PlayerId,
  localPlayer: PlayerId,
  cause: 'elimination' | 'countdown',
): { localVictory: boolean; title: string; subtitle: string } => {
  const localVictory = winner === localPlayer;
  if (cause === 'elimination') {
    return {
      localVictory,
      title: localVictory ? 'Victory' : 'Defeat',
      subtitle: localVictory
        ? 'The opposing army was eliminated.'
        : 'Your army was eliminated.',
    };
  }
  return {
    localVictory,
    title: localVictory ? 'Victory' : 'Defeat',
    subtitle: localVictory
      ? 'The enemy commander fell and the three-turn survival hold is complete.'
      : 'Your commander fell. The enemy survived the three-turn hold.',
  };
};

export const keepAnchorsFromGameState = (state: Pick<GameState, 'sites'>): StartingKeepAnchor[] =>
  state.sites
    .filter((site): site is SiteState & { owner: PlayerId } => site.type === 'keep' && isPlayerId(site.owner))
    .map((site) => ({ coord: { ...site.coord }, owner: site.owner }));

export const keepAnchorsFromCompactSites = (sites: CompactSiteState[]): StartingKeepAnchor[] =>
  sites
    .filter((site): site is CompactSiteState & { owner: PlayerId } => (
      site.type === 'keep' && isPlayerId(site.owner)
    ))
    .map((site) => ({ coord: { q: site.at[0], r: site.at[1] }, owner: site.owner }));

const uniqueStartingKeeps = (keeps: StartingKeepAnchor[]): StartingKeepAnchor[] => {
  const seen = new Set<PlayerId>();
  const unique: StartingKeepAnchor[] = [];
  for (const keep of keeps) {
    if (seen.has(keep.owner)) continue;
    seen.add(keep.owner);
    unique.push(keep);
  }
  return unique;
};

export const buildBattleResultPresentation = (
  state: GameState,
  localPlayer: PlayerId,
  startingKeeps: StartingKeepAnchor[],
): BattleResultPresentation => {
  const winner = state.winner;
  if (!winner) throw new Error('Cannot present a battle result before a winner exists.');

  const loser: PlayerId = winner === 1 ? 2 : 1;
  const eliminated = state.units.every((unit) => unit.owner !== loser);
  const copy = describeBattleFinale(winner, localPlayer, eliminated ? 'elimination' : 'countdown');
  const localFaction = state.players[localPlayer].faction;
  const starting = uniqueStartingKeeps(startingKeeps);
  if (starting.length < 2) {
    throw new Error('Battle result presentation needs both starting Home Keeps.');
  }

  const ordered = [...starting].sort((left, right) => axialDisplayX(left.coord) - axialDisplayX(right.coord));
  const armyFor = (player: PlayerId): ArmyResultPresentation => {
    const faction = state.players[player].faction;
    const outcome: BattleArmyOutcome = player === winner ? 'victory' : 'defeat';
    return {
      player,
      faction,
      outcome,
      artwork: FINALE_ARMY_ART[faction][outcome],
    };
  };

  return {
    winner,
    loser,
    localVictory: copy.localVictory,
    title: copy.title,
    subtitle: copy.subtitle,
    factionSubtitle: `${factionLabel(localFaction)} ${copy.localVictory ? 'Triumph' : 'Fall'}`,
    left: armyFor(ordered[0].owner),
    right: armyFor(ordered[1].owner),
  };
};
