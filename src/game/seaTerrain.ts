import type { Coord, Terrain } from '../data/types';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import { isInsideMap, terrainAt } from './engine';

export const SEA_HEX_SIZE = 46;
export const SEA_HEX_WIDTH = Math.sqrt(3) * SEA_HEX_SIZE;

export type SeaWaveFamily = 'calm' | 'double' | 'glint';

export interface SeaWaveSpec {
  family: SeaWaveFamily;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
  scale: number;
  alpha: number;
  startFrame: number;
  delayMs: number;
}

export interface SeaCoastMark {
  kind: 'edge' | 'cap';
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
}

const EDGE_DIRS: Array<{ even: Coord; odd: Coord }> = [
  { even: { q: 1, r: 0 }, odd: { q: 1, r: 0 } },
  { even: { q: 0, r: 1 }, odd: { q: 1, r: 1 } },
  { even: { q: -1, r: 1 }, odd: { q: 0, r: 1 } },
  { even: { q: -1, r: 0 }, odd: { q: -1, r: 0 } },
  { even: { q: -1, r: -1 }, odd: { q: 0, r: -1 } },
  { even: { q: 0, r: -1 }, odd: { q: 1, r: -1 } },
];

export const isSeaTerrain = (terrain: Terrain): boolean =>
  terrain === 'water' || terrain === 'bridge';

export const seaTileHash = (q: number, r: number, salt = 0): number => {
  let n = Math.imul(q, 374761393) + Math.imul(r, 668265263) + Math.imul(salt, 144737);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
};

export const seaBaseVariant = (coord: Coord): 0 | 1 | 2 | 3 =>
  (seaTileHash(coord.q, coord.r, 11) % 4) as 0 | 1 | 2 | 3;

const unit = (hash: number, shift: number): number => ((hash >>> shift) & 1023) / 1023;

export const seaWaveSpec = (coord: Coord): SeaWaveSpec | null => {
  const hash = seaTileHash(coord.q, coord.r, 29);
  if (hash % 100 >= 60) return null;
  const familyRoll = hash % 60;
  const family: SeaWaveFamily = familyRoll < 38 ? 'calm' : familyRoll < 52 ? 'double' : 'glint';
  const radius = SEA_HEX_SIZE * 0.22;
  const angle = unit(hash, 4) * Math.PI * 2;
  const glint = family === 'glint';
  return {
    family,
    offsetX: Math.cos(angle) * radius * (0.35 + unit(hash, 14) * 0.65),
    offsetY: Math.sin(angle) * radius * 0.55,
    flipX: ((hash >>> 8) & 1) === 1,
    scale: 0.82 + unit(hash, 18) * 0.26,
    alpha: glint ? 0.22 + unit(hash, 22) * 0.08 : 0.13 + unit(hash, 22) * 0.1,
    startFrame: hash % 8,
    delayMs: Math.round(unit(hash, 6) * 720),
  };
};

const neighborCoord = (coord: Coord, dir: number): Coord => {
  const step = coord.r % 2 === 0 ? EDGE_DIRS[dir].even : EDGE_DIRS[dir].odd;
  return { q: coord.q + step.q, r: coord.r + step.r };
};

const isLandNeighbor = (coord: Coord): boolean => {
  if (!isInsideMap(coord)) return true;
  return !isSeaTerrain(terrainAt(coord));
};

export const seaCoastMarks = (coord: Coord): SeaCoastMark[] => {
  const land = EDGE_DIRS.map((_, dir) => isLandNeighbor(neighborCoord(coord, dir)));
  const marks: SeaCoastMark[] = [];
  const reach = SEA_HEX_SIZE * 0.4;
  for (let dir = 0; dir < 6; dir += 1) {
    const next = (dir + 1) % 6;
    const outwardDeg = dir * 60 + 30;
    const outward = outwardDeg * (Math.PI / 180);
    if (land[dir] && land[next]) {
      marks.push({
        kind: dir === 4 ? 'cap' : 'edge',
        rotationDeg: dir === 4 ? 0 : (dir - 1) * 60,
        offsetX: Math.cos(outward) * reach,
        offsetY: Math.sin(outward) * reach,
      });
      continue;
    }
    if (land[dir] && !land[(dir + 5) % 6] && !land[next]) {
      const single = dir * 60;
      marks.push({
        kind: 'cap',
        rotationDeg: single + 90,
        offsetX: Math.cos(single * Math.PI / 180) * reach,
        offsetY: Math.sin(single * Math.PI / 180) * reach,
      });
    }
  }
  return marks;
};

export const seaCoords = (): Coord[] => {
  const coords: Coord[] = [];
  for (let r = 0; r < MAP_HEIGHT; r += 1) {
    for (let q = 0; q < MAP_WIDTH; q += 1) {
      const coord = { q, r };
      if (isSeaTerrain(terrainAt(coord))) coords.push(coord);
    }
  }
  return coords;
};
