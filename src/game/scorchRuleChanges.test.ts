import { describe, expect, it } from 'vitest';
import { MAP_DECORATIONS, MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { Coord, GameState, Terrain } from '../data/types';
import {
  createGameState,
  effectiveTerrainAt,
  endTurn,
  getTacticTargetCoords,
  playTacticCardAtCoord,
  sameCoord,
  terrainAt,
} from './engine';

const fixedRandom = () => 0.25;

const stateWithScorch = (): GameState => {
  const state = createGameState(fixedRandom);
  state.players[1].hand = ['scorch'];
  state.players[1].mana = 10;
  return state;
};

const openTerrain = (state: GameState, terrain: Terrain): Coord => {
  for (let r = 0; r < MAP_HEIGHT; r += 1) {
    for (let q = 0; q < MAP_WIDTH; q += 1) {
      const coord = { q, r };
      if (terrainAt(coord) !== terrain) continue;
      if (state.units.some((unit) => sameCoord(unit.coord, coord))) continue;
      if (state.sites.some((site) => sameCoord(site.coord, coord))) continue;
      if (MAP_DECORATIONS.some((decoration) => sameCoord(decoration.coord, coord))) continue;
      return coord;
    }
  }
  throw new Error(`No open ${terrain} terrain found for Scorch test.`);
};

const tickBurn = (state: GameState, count: number): void => {
  for (let tick = 0; tick < count; tick += 1) endTurn(state, fixedRandom);
};

describe('Scorch persistent fire', () => {
  it('can target Plain, Hill, and Forest but cannot target an already-burning hex', () => {
    const state = stateWithScorch();
    const targets = getTacticTargetCoords(state, 'scorch');
    expect(targets.some((coord) => terrainAt(coord) === 'plain')).toBe(true);
    expect(targets.some((coord) => terrainAt(coord) === 'hill')).toBe(true);
    expect(targets.some((coord) => terrainAt(coord) === 'forest')).toBe(true);

    const plain = openTerrain(state, 'plain');
    expect(playTacticCardAtCoord(state, 0, plain).ok).toBe(true);
    expect(getTacticTargetCoords(state, 'scorch').some((coord) => sameCoord(coord, plain))).toBe(false);
  });

  it('deals exactly 1 damage to an occupant on each of its three end-turn ticks', () => {
    const state = stateWithScorch();
    const plain = openTerrain(state, 'plain');
    const victim = state.units.find((unit) => unit.owner === 2 && unit.definitionId === 'commander');
    expect(victim).toBeDefined();
    if (!victim) return;

    victim.coord = { ...plain };
    victim.hp = 10;
    expect(playTacticCardAtCoord(state, 0, plain).ok).toBe(true);

    endTurn(state, fixedRandom);
    expect(victim.hp).toBe(9);
    endTurn(state, fixedRandom);
    expect(victim.hp).toBe(8);
    endTurn(state, fixedRandom);
    expect(victim.hp).toBe(7);
    expect((state.burningTiles ?? []).some((effect) => sameCoord(effect.coord, plain))).toBe(false);
  });

  it('keeps Forest rules while burning, then converts Forest to Plain after tick three', () => {
    const state = stateWithScorch();
    const forest = openTerrain(state, 'forest');
    expect(playTacticCardAtCoord(state, 0, forest).ok).toBe(true);

    expect(effectiveTerrainAt(state, forest)).toBe('forest');
    tickBurn(state, 1);
    expect(effectiveTerrainAt(state, forest)).toBe('forest');
    tickBurn(state, 1);
    expect(effectiveTerrainAt(state, forest)).toBe('forest');
    tickBurn(state, 1);
    expect(effectiveTerrainAt(state, forest)).toBe('plain');
  });

  it('leaves Hill terrain unchanged after the three-turn burn ends', () => {
    const state = stateWithScorch();
    const hill = openTerrain(state, 'hill');
    expect(playTacticCardAtCoord(state, 0, hill).ok).toBe(true);
    tickBurn(state, 3);
    expect(effectiveTerrainAt(state, hill)).toBe('hill');
  });
});
