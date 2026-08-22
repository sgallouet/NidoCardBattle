import type { Coord, MapSite, Terrain } from './types';

export const MAP_WIDTH = 18;
export const MAP_HEIGHT = 13;

const terrainOverrides: Array<[Terrain, Coord[]]> = [
  ['forest', [
    { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 },
    { q: 1, r: 1 }, { q: 2, r: 1 }, { q: 3, r: 1 }, { q: 4, r: 1 }, { q: 5, r: 1 },
    { q: 0, r: 2 }, { q: 1, r: 2 }, { q: 2, r: 2 }, { q: 4, r: 2 },
    { q: 1, r: 3 }, { q: 2, r: 3 }, { q: 3, r: 3 }, { q: 4, r: 3 },
    { q: 2, r: 4 }, { q: 3, r: 4 },
    { q: 13, r: 0 }, { q: 14, r: 0 }, { q: 15, r: 0 }, { q: 16, r: 0 },
    { q: 12, r: 1 }, { q: 13, r: 1 }, { q: 14, r: 1 }, { q: 15, r: 1 }, { q: 16, r: 1 },
    { q: 13, r: 2 }, { q: 16, r: 2 }, { q: 17, r: 2 },
    { q: 0, r: 9 }, { q: 1, r: 9 }, { q: 0, r: 10 }, { q: 1, r: 10 },
    { q: 0, r: 11 }, { q: 1, r: 11 }, { q: 2, r: 11 }, { q: 3, r: 11 },
    { q: 0, r: 12 }, { q: 1, r: 12 }, { q: 2, r: 12 }, { q: 3, r: 12 }, { q: 4, r: 12 },
    { q: 13, r: 8 }, { q: 14, r: 8 }, { q: 15, r: 8 },
    { q: 12, r: 9 }, { q: 13, r: 9 }, { q: 14, r: 9 }, { q: 15, r: 9 }, { q: 16, r: 9 },
    { q: 12, r: 10 }, { q: 13, r: 10 }, { q: 15, r: 10 }, { q: 16, r: 10 }, { q: 17, r: 10 },
    { q: 11, r: 11 }, { q: 12, r: 11 }, { q: 13, r: 11 }, { q: 14, r: 11 }, { q: 15, r: 11 },
    { q: 12, r: 12 }, { q: 13, r: 12 }, { q: 14, r: 12 }, { q: 15, r: 12 }, { q: 16, r: 12 },
  ]],
  ['hill', [
    { q: 6, r: 0 }, { q: 7, r: 1 }, { q: 6, r: 3 }, { q: 4, r: 5 },
    { q: 3, r: 6 }, { q: 5, r: 7 }, { q: 4, r: 10 }, { q: 5, r: 11 },
    { q: 11, r: 1 }, { q: 12, r: 3 }, { q: 14, r: 5 }, { q: 13, r: 6 },
    { q: 10, r: 8 }, { q: 11, r: 9 }, { q: 9, r: 11 }, { q: 10, r: 12 },
  ]],
  ['mountain', [
    { q: 5, r: 5 }, { q: 6, r: 5 }, { q: 5, r: 6 }, { q: 6, r: 7 },
    { q: 11, r: 5 }, { q: 12, r: 6 }, { q: 11, r: 7 }, { q: 12, r: 7 },
    { q: 4, r: 11 }, { q: 11, r: 2 },
  ]],
  ['water', [
    { q: 9, r: 0 }, { q: 10, r: 0 },
    { q: 9, r: 1 }, { q: 10, r: 1 },
    { q: 8, r: 2 }, { q: 9, r: 2 },
    { q: 8, r: 3 }, { q: 9, r: 3 },
    { q: 8, r: 5 }, { q: 9, r: 5 },
    { q: 7, r: 6 }, { q: 8, r: 6 },
    { q: 7, r: 7 }, { q: 8, r: 7 },
    { q: 7, r: 8 }, { q: 8, r: 8 },
    { q: 7, r: 10 }, { q: 8, r: 10 },
    { q: 6, r: 11 }, { q: 7, r: 11 },
    { q: 6, r: 12 }, { q: 7, r: 12 },
    { q: 16, r: 4 }, { q: 17, r: 4 }, { q: 16, r: 5 }, { q: 17, r: 5 },
  ]],
  ['bridge', [
    { q: 8, r: 4 }, { q: 9, r: 4 },
    { q: 7, r: 9 }, { q: 8, r: 9 },
  ]],
];

export const TERRAIN: Terrain[][] = Array.from({ length: MAP_HEIGHT }, () =>
  Array.from({ length: MAP_WIDTH }, () => 'plain' as Terrain),
);

for (const [terrain, coords] of terrainOverrides) {
  for (const coord of coords) TERRAIN[coord.r][coord.q] = terrain;
}

export type MapDecorationType = 'village' | 'ruin';

export interface MapDecoration {
  type: MapDecorationType;
  coord: Coord;
}

export const MAP_DECORATIONS: MapDecoration[] = [
  { type: 'village', coord: { q: 5, r: 10 } },
  { type: 'village', coord: { q: 12, r: 2 } },
  { type: 'village', coord: { q: 14, r: 7 } },
  { type: 'ruin', coord: { q: 5, r: 3 } },
  { type: 'ruin', coord: { q: 10, r: 7 } },
];

export const MAP_SITES: MapSite[] = [
  { id: 'keep-1', type: 'keep', coord: { q: 2, r: 9 }, initialOwner: 1 },
  { id: 'keep-2', type: 'keep', coord: { q: 15, r: 3 }, initialOwner: 2 },
  { id: 'fort-north', type: 'fort', coord: { q: 7, r: 4 }, initialOwner: null },
  { id: 'fort-south', type: 'fort', coord: { q: 9, r: 9 }, initialOwner: null },
  { id: 'well-northwest', type: 'well', coord: { q: 6, r: 2 }, initialOwner: null },
  { id: 'well-northeast', type: 'well', coord: { q: 13, r: 4 }, initialOwner: null },
  { id: 'well-southwest', type: 'well', coord: { q: 4, r: 8 }, initialOwner: null },
  { id: 'well-southeast', type: 'well', coord: { q: 11, r: 10 }, initialOwner: null },
];

export const STARTING_UNITS = [
  { definitionId: 'commander', owner: 1 as const, coord: { q: 2, r: 8 } },
  { definitionId: 'royalGuard', owner: 1 as const, coord: { q: 3, r: 8 } },
  { definitionId: 'longbowRanger', owner: 1 as const, coord: { q: 3, r: 10 } },
  { definitionId: 'commander', owner: 2 as const, coord: { q: 15, r: 4 } },
  { definitionId: 'skeletalInfantry', owner: 2 as const, coord: { q: 14, r: 4 } },
  { definitionId: 'necromancer', owner: 2 as const, coord: { q: 14, r: 2 } },
];
