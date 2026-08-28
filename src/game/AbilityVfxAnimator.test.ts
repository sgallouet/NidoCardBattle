import { describe, expect, it } from 'vitest';
import { ABILITY_VFX_CONTRACT } from './AbilityVfxContract';

describe('dedicated ability VFX contracts', () => {
  it('covers every requested effect with a short bounded presentation', () => {
    expect(Object.keys(ABILITY_VFX_CONTRACT)).toEqual([
      'thunder',
      'invokeBeast',
      'healingAura',
      'curse',
      'soulLink',
      'rally',
      'displace',
    ]);

    for (const contract of Object.values(ABILITY_VFX_CONTRACT)) {
      expect(contract.durationMs).toBeGreaterThanOrEqual(300);
      expect(contract.durationMs).toBeLessThanOrEqual(550);
    }
  });
});
