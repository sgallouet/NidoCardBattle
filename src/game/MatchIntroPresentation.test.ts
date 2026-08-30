import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import { createGameState } from './engine';
import { buildMapRevealPlan, introRingDelay, ownedKeepCoord } from './MatchIntroPlan';
import { configureFreshGameState } from './NewGameSetup';

describe('match intro presentation plan', () => {
  it('starts at the local Keep and covers every logical hex once', () => {
    const origin = { q: 2, r: 9 };
    const plan = buildMapRevealPlan(origin);

    expect(plan).toHaveLength(MAP_WIDTH * MAP_HEIGHT);
    expect(plan[0]).toEqual({ coord: origin, delay: 0 });
    expect(new Set(plan.map((step) => `${step.coord.q},${step.coord.r}`)).size).toBe(MAP_WIDTH * MAP_HEIGHT);
  });

  it('accelerates the outward ring cadence over time', () => {
    const maxDistance = 12;
    const earlyGap = introRingDelay(2, maxDistance) - introRingDelay(1, maxDistance);
    const lateGap = introRingDelay(12, maxDistance) - introRingDelay(11, maxDistance);

    expect(earlyGap).toBeGreaterThan(lateGap);
  });

  it('anchors an upper-right local start to the local keep', () => {
    const state = createGameState(() => 0.25);
    configureFreshGameState(state, { faction: 'human', side: 'upperRight' });

    expect(ownedKeepCoord(state, 1)).toEqual({ q: 15, r: 3 });
  });
});
