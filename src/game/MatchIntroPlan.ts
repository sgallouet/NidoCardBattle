import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { Coord, GameState, PlayerId } from '../data/types';
import { hexDistance } from './engine';

export const MAP_REVEAL_DURATION = 1_550;

export interface MapRevealStep {
  coord: Coord;
  delay: number;
}

export const ownedKeepCoord = (
  state: Pick<GameState, 'sites'>,
  playerId: PlayerId,
): Coord | null => {
  const keep = state.sites.find((site) => site.type === 'keep' && site.owner === playerId);
  return keep ? { ...keep.coord } : null;
};

export const introRingDelay = (distance: number, maxDistance: number): number => {
  if (distance <= 0 || maxDistance <= 0) return 0;
  const progress = Math.min(1, Math.max(0, distance / maxDistance));
  return Math.round(MAP_REVEAL_DURATION * (1 - ((1 - progress) ** 1.8)));
};

export const buildMapRevealPlan = (origin: Coord): MapRevealStep[] => {
  const coords: Coord[] = [];
  for (let r = 0; r < MAP_HEIGHT; r += 1) {
    for (let q = 0; q < MAP_WIDTH; q += 1) coords.push({ q, r });
  }
  const maxDistance = Math.max(...coords.map((coord) => hexDistance(origin, coord)));
  return coords
    .map((coord) => {
      const distance = hexDistance(origin, coord);
      const shimmer = distance === 0 ? 0 : ((coord.q * 17 + coord.r * 31) % 5) * 14;
      return { coord, delay: introRingDelay(distance, maxDistance) + shimmer };
    })
    .sort((left, right) => left.delay - right.delay || left.coord.r - right.coord.r || left.coord.q - right.coord.q);
};
