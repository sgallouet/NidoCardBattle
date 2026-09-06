import type { Coord, GameState, UnitState } from '../data/types';
import {
  canTraverse,
  coordKey,
  findUnit,
  getReachableCoords,
  isGraveLocked,
  moveUnit,
  neighbors,
  sameCoord,
  unitAt,
} from './engine';

const shortestVisualPath = (
  state: GameState,
  unit: UnitState,
  start: Coord,
  destination: Coord,
): Coord[] | undefined => {
  const startKey = coordKey(start);
  const destinationKey = coordKey(destination);
  const queue: Coord[] = [{ ...start }];
  const visited = new Set<string>([startKey]);
  const previous = new Map<string, Coord>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (coordKey(current) === destinationKey) break;

    for (const next of neighbors(current)) {
      const key = coordKey(next);
      if (visited.has(key) || isGraveLocked(state, next) || !canTraverse(state, unit, next)) continue;
      const occupant = unitAt(state, next);
      if (occupant && occupant.id !== unit.id && occupant.owner !== unit.owner) continue;
      visited.add(key);
      previous.set(key, { ...current });
      queue.push({ ...next });
    }
  }

  if (!visited.has(destinationKey)) return undefined;
  const path: Coord[] = [{ ...destination }];
  while (coordKey(path[path.length - 1]) !== startKey) {
    const prior = previous.get(coordKey(path[path.length - 1]));
    if (!prior) return undefined;
    path.push({ ...prior });
  }
  path.reverse();
  return path;
};

/**
 * UNA1 makes a revised destination replace the first move logically. The engine
 * therefore resolves legality from the original movement origin. For presentation,
 * however, the already-rendered unit should walk directly from where the player last
 * placed it to the newly chosen destination instead of visibly undoing the old route.
 */
export const shortestReconsiderationPresentationPath = (
  state: GameState,
  unitId: string,
  committedPath: Coord[],
): Coord[] => {
  if (committedPath.length < 2) return committedPath;
  const unit = findUnit(state, unitId);
  const original = unit?.movementOrigin;
  if (!unit || !original || sameCoord(committedPath[0], original)) return committedPath;

  const destination = committedPath[committedPath.length - 1];
  return shortestVisualPath(state, unit, committedPath[0], destination) ?? committedPath;
};

/**
 * Keeps the grey reconsideration arrows rooted at the original UNA1 movement origin.
 * The returned destinations are still the engine-authorized live destinations; only
 * their preview path is reconstructed from the original position.
 */
export const reconsiderationPreviewCoordPaths = (
  state: GameState,
  unitId: string,
): Map<string, Coord[]> => {
  const unit = findUnit(state, unitId);
  if (!unit?.movementOrigin || unit.attacked) return new Map();

  const origin = { ...unit.movementOrigin };
  const destinations = getReachableCoords(state, unitId);
  const paths = new Map<string, Coord[]>();

  for (const key of destinations.keys()) {
    const [q, r] = key.split(',').map(Number);
    const destination = { q, r };
    if (sameCoord(destination, origin)) {
      paths.set(key, [origin]);
      continue;
    }

    const preview = structuredClone(state);
    const previewUnit = findUnit(preview, unitId);
    if (!previewUnit) continue;
    previewUnit.coord = { ...origin };
    previewUnit.moved = false;
    previewUnit.movementSpent = 0;
    delete previewUnit.movementOrigin;

    const result = moveUnit(preview, unitId, destination);
    if (result.ok && result.path) paths.set(key, result.path);
  }

  return paths;
};
