import { describe, expect, it, vi } from 'vitest';
import { acknowledgeBetaWelcome, isBetaWelcomeAcknowledged } from './BetaWelcome';

describe('beta welcome acknowledgement', () => {
  it('is shown until the player acknowledges it', () => {
    const getItem = vi.fn(() => null);

    expect(isBetaWelcomeAcknowledged({ getItem })).toBe(false);
  });

  it('is skipped after the player starts playing', () => {
    const setItem = vi.fn();
    acknowledgeBetaWelcome({ setItem });

    expect(setItem).toHaveBeenCalledWith('nidocardbattle.betaWelcomeAcknowledged', 'true');
    expect(isBetaWelcomeAcknowledged({ getItem: () => 'true' })).toBe(true);
  });
});
