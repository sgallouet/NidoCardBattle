import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_RENDER_MODE, resolveMapRenderMode } from './mapRenderMode';

describe('map render mode', () => {
  it('defaults to authored for the current prototype evaluation', () => {
    expect(resolveMapRenderMode('')).toBe(DEFAULT_MAP_RENDER_MODE);
    expect(DEFAULT_MAP_RENDER_MODE).toBe('authored');
  });

  it('accepts an explicit tiled renderer override', () => {
    expect(resolveMapRenderMode('?map=tiled')).toBe('tiled');
  });

  it('accepts an explicit authored renderer override', () => {
    expect(resolveMapRenderMode('?map=authored')).toBe('authored');
  });

  it('ignores unknown renderer values', () => {
    expect(resolveMapRenderMode('?map=unknown')).toBe(DEFAULT_MAP_RENDER_MODE);
  });
});
