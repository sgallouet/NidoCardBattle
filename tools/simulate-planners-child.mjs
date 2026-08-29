import { simulatePlannerDuelBatch, simulatePlannerMatchupBatch } from '../src/game/aiPlannerDuel.ts';

const supportedArguments = new Set([
  '--pairs',
  '--seed',
  '--max-half-turns',
  '--repetition-limit',
  '--planner-a',
  '--planner-b',
]);
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!supportedArguments.has(name)) throw new Error(`Unknown planner simulation argument: ${name}.`);
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
}

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
};

const positiveInteger = (name, fallback) => {
  const raw = valueAfter(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
};

const plannerId = (name, fallback) => {
  const value = valueAfter(name) ?? fallback;
  if (!['v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'].includes(value)) throw new Error(`${name} must be v2, v3, v4, v5, v6, v7, or v8.`);
  return value;
};

const pairs = positiveInteger('--pairs', 40);
const seed = positiveInteger('--seed', 20260826);
const maxHalfTurns = positiveInteger('--max-half-turns', 140);
const repetitionLimit = positiveInteger('--repetition-limit', 4);
const plannerA = plannerId('--planner-a', 'v2');
const plannerB = plannerId('--planner-b', 'v3');
if (plannerA === plannerB) throw new Error('Planner matchup requires two different planners.');
const startedAt = Date.now();

const options = {
  pairs,
  seed,
  maxHalfTurns,
  repetitionLimit,
};
const printProgress = (progress) => {
    console.log(`AI_PLANNER_DUEL_PROGRESS ${JSON.stringify({
      ...progress,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    })}`);
};
const report = plannerA === 'v2' && plannerB === 'v3'
  ? simulatePlannerDuelBatch({ ...options, onPairComplete: printProgress })
  : simulatePlannerMatchupBatch(plannerA, plannerB, options, printProgress);

const { gamesDetail: _gamesDetail, firstPlayerWins: _firstPlayerWins, ...summary } = report;
console.log(`AI_PLANNER_DUEL_REPORT ${JSON.stringify(summary)}`);

if (report.games !== pairs * 2) {
  throw new Error(`Planner duel produced ${report.games} games; expected ${pairs * 2}.`);
}
if (report.replayFailuresByPlanner[plannerA] !== 0 || report.replayFailuresByPlanner[plannerB] !== 0) {
  throw new Error(`Planner duel replay failures: ${JSON.stringify(report.replayFailuresByPlanner)}.`);
}
