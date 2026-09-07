import { describe, expect, it } from 'vitest';
import { createBirdFlights, stepBirdFlights } from './ambientBirdFlight';

describe('ambient bird flight', () => {
  it('stays on the board for ten minutes with bounded movement and turns', () => {
    const width = 1354, height = 828;
    const birds = createBirdFlights(width, height);
    for (let frame = 0; frame < 12000; frame++) {
      const before = birds.map(b => ({ ...b }));
      stepBirdFlights(birds, frame * 0.05, 0.05, width, height);
      birds.forEach((bird, i) => {
        expect(bird.x).toBeGreaterThan(0);
        expect(bird.x).toBeLessThan(width);
        expect(bird.y).toBeGreaterThan(0);
        expect(bird.y).toBeLessThan(height);
        expect(Math.hypot(bird.x - before[i].x, bird.y - before[i].y)).toBeLessThan(2);
        expect(Math.abs(bird.heading - before[i].heading)).toBeLessThanOrEqual(0.035001);
      });
    }
  });
});
