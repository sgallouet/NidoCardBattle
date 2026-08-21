import type { Coord, MapSite, Terrain } from './types';

export const MAP_WIDTH = 13;
export const MAP_HEIGHT = 9;

const terrainOverrides: Array<[Terrain, Coord[]]> = [
  ['forest', [
    { q: 2, r: 1 }, { q: 3, r: 1 }, { q: 9, r: 1 }, { q: 10, r: 1 },
    { q: 2, r: 7 }, { q: 3, r: 7 }, { q: 9, r: 7 }, { q: 10, r: 7 },
    { q: 1, r: 2 }, { q: 11, r: 6 },
  ]],
  ['hill', [
    { q: 5, r: 1 }, { q: 7, r: 1 }, { q: 5, r: 7 }, { q: 7, r: 7 },
    { q: 4, r: 4 }, { q: 8, r: 4 },
  ]],
  ['water', [
    { q: 6, r: 0 }, { q: 0, r: 3 }, { q: 12, r: 5 }, { q: 6, r: 8 },
  ]],
  ['cliff', [
    { q: 5, r: 3 }, { q: 7, r: 3 }, { q: 5, r: 5 }, { q: 7, r: 5 },
  ]],
];

export const TERRAIN: Terrain[][] = Array.from({ length: MAP_HEIGHT }, () =>
  Array.from({ length: MAP_WIDTH }, () => 'plain' as Terrain),
);

for (const [terrain, coords] of terrainOverrides) {
  for (const coord of coords) TERRAIN[coord.r][coord.q] = terrain;
}

export const MAP_SITES: MapSite[] = [
  { id: 'keep-1', type: 'keep', coord: { q: 1, r: 4 }, initialOwner: 1 },
  { id: 'keep-2', type: 'keep', coord: { q: 11, r: 4 }, initialOwner: 2 },
  { id: 'fort-north', type: 'fort', coord: { q: 6, r: 2 }, initialOwner: null },
  { id: 'fort-south', type: 'fort', coord: { q: 6, r: 6 }, initialOwner: null },
  { id: 'well-northwest', type: 'well', coord: { q: 3, r: 2 }, initialOwner: null },
  { id: 'well-northeast', type: 'well', coord: { q: 9, r: 2 }, initialOwner: null },
  { id: 'well-southwest', type: 'well', coord: { q: 3, r: 6 }, initialOwner: null },
  { id: 'well-southeast', type: 'well', coord: { q: 9, r: 6 }, initialOwner: null },
];

export const STARTING_UNITS = [
  { definitionId: 'commander', owner: 1 as const, coord: { q: 1, r: 4 } },
  { definitionId: 'skeletonGuard', owner: 1 as const, coord: { q: 2, r: 3 } },
  { definitionId: 'boneArcher', owner: 1 as const, coord: { q: 2, r: 5 } },
  { definitionId: 'commander', owner: 2 as const, coord: { q: 11, r: 4 } },
  { definitionId: 'skeletonGuard', owner: 2 as const, coord: { q: 10, r: 5 } },
  { definitionId: 'boneArcher', owner: 2 as const, coord: { q: 10, r: 3 } },
];
