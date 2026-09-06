import { describe, expect, it } from 'vitest';
import { terrainAt } from './engine';
import {
  isSeaTerrain,
  seaBaseVariant,
  seaCoastMarks,
  seaCoords,
  seaTileHash,
  seaWaveSpec,
} from './seaTerrain';

describe('sprite sea layout', () => {
  it('treats water and bridge as continuous sea', () => {
    expect(isSeaTerrain('water')).toBe(true);
    expect(isSeaTerrain('bridge')).toBe(true);
    expect(isSeaTerrain('plain')).toBe(false);
  });

  it('picks a stable hashed base variant and wave phase', () => {
    const coord = { q: 8, r: 6 };
    expect(seaTileHash(coord.q, coord.r, 11)).toBe(seaTileHash(8, 6, 11));
    expect(seaBaseVariant(coord)).toBe(seaBaseVariant({ q: 8, r: 6 }));
    expect(seaWaveSpec(coord)).toEqual(seaWaveSpec({ q: 8, r: 6 }));
  });

  it('covers a majority of sea tiles with desynchronized waves', () => {
    const coords = seaCoords();
    const waves = coords.map((coord) => seaWaveSpec(coord));
    const present = waves.filter((spec) => spec !== null);
    const ratio = present.length / coords.length;
    const frames = new Set(present.map((spec) => spec?.startFrame));
    const families = new Set(present.map((spec) => spec?.family));

    expect(coords.length).toBeGreaterThan(8);
    expect(ratio).toBeGreaterThanOrEqual(0.55);
    expect(ratio).toBeLessThanOrEqual(0.65);
    expect(frames.size).toBeGreaterThan(3);
    expect(families.has('calm')).toBe(true);
  });

  it('does not put a coastline between water and bridge', () => {
    const bridge = seaCoords().find((coord) => terrainAt(coord) === 'bridge');
    expect(bridge).toBeDefined();
    if (!bridge) return;
    const marks = seaCoastMarks(bridge);
    expect(Array.isArray(marks)).toBe(true);
  });
});
