import { describe, expect, it } from 'vitest';
import {
  BATTLEFIELD_CODEX,
  SITE_CODEX_IDS,
  TERRAIN_CODEX_IDS,
} from './battlefieldCodex';

const ALL_IDS = [...TERRAIN_CODEX_IDS, ...SITE_CODEX_IDS];

describe('Battlefield Codex', () => {
  it('has one complete entry for every listed battlefield subject', () => {
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
    for (const id of ALL_IDS) {
      const entry = BATTLEFIELD_CODEX[id];
      expect(entry.id).toBe(id);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.tagline.length).toBeGreaterThan(0);
      expect(entry.rules.length).toBeGreaterThan(0);
      expect(entry.bestFor.length).toBeGreaterThan(0);
      expect(entry.beware.length).toBeGreaterThan(0);
      expect(entry.art.length > 0 || entry.glyph).toBeTruthy();
    }
  });

  it('keeps terrain and site navigation grouped correctly', () => {
    for (const id of TERRAIN_CODEX_IDS) expect(BATTLEFIELD_CODEX[id].group).toBe('terrain');
    for (const id of SITE_CODEX_IDS) expect(BATTLEFIELD_CODEX[id].group).toBe('sites');
  });

  it('documents the engine-defining forest, hill and mountain rules', () => {
    expect(BATTLEFIELD_CODEX.forest.rules.join(' ')).toContain('30%');
    expect(BATTLEFIELD_CODEX.hill.rules.join(' ')).toContain('+1 Range');
    expect(BATTLEFIELD_CODEX.mountain.rules.join(' ')).toContain('No unit');
  });
});
