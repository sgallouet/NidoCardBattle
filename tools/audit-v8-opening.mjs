import { simulatePlannerDuelGame } from '../src/game/aiPlannerDuel.ts';

const rawSeed = process.argv[2] ?? '20261221';
const seed = Number(rawSeed);
if (!Number.isSafeInteger(seed) || seed < 1) throw new Error('Opening audit seed must be a positive integer.');

for (const assignment of [
  { 1: 'v7', 2: 'v8' },
  { 1: 'v8', 2: 'v7' },
]) {
  const result = simulatePlannerDuelGame(seed, assignment, { maxHalfTurns: 6 });
  console.log(`AI_V8_OPENING_AUDIT ${JSON.stringify({
    seed,
    assignment,
    openingTurns: result.openingTurns,
    capturesByPlanner: result.capturesByPlanner,
    killsByPlanner: result.killsByPlanner,
    replayFailuresByPlanner: result.replayFailuresByPlanner,
  })}`);
}
