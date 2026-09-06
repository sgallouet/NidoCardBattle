import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { simulatePlannerDuelBatch, simulatePlannerMatchupBatch } from '../src/game/aiPlannerDuel.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const supportedArguments = new Set([
  '--pairs',
  '--seed',
  '--max-half-turns',
  '--repetition-limit',
  '--planner-a',
  '--planner-b',
  '--out',
  '--strategy-nodes',
  '--tactical-nodes',
  '--clock',
  '--map-side',
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
  if (!['v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10'].includes(value)) throw new Error(`${name} must be v2 through v10.`);
  return value;
};

const pairs = positiveInteger('--pairs', 40);
const seed = positiveInteger('--seed', 20260826);
const maxHalfTurns = positiveInteger('--max-half-turns', 140);
const repetitionLimit = positiveInteger('--repetition-limit', 4);
const plannerA = plannerId('--planner-a', 'v2');
const plannerB = plannerId('--planner-b', 'v3');
const clock = valueAfter('--clock') ?? 'nodes';
if (!['nodes', 'live'].includes(clock)) throw new Error('--clock must be nodes or live.');
const mapSide = valueAfter('--map-side') ?? 'standard';
if (!['standard', 'swapped'].includes(mapSide)) throw new Error('--map-side must be standard or swapped.');
if (plannerA === plannerB) throw new Error('Planner matchup requires two different planners.');
const startedAt = Date.now();
const sourceFingerprint = createHash('sha256').update(['src/game/aiPlannerV9.ts', 'src/game/aiPlannerV10.ts', 'src/game/aiV10Evaluation.ts', 'src/game/engine.ts'].map((p) => readFileSync(p, 'utf8')).join('\n')).digest('hex').slice(0, 16);

const output = valueAfter('--out');
const logDirectory = output ? resolve(output.replace(/\.json$/, '') + '-games') : undefined;
if (logDirectory) mkdirSync(logDirectory, { recursive: true });
const options = {
  recordGame: logDirectory ? (log) => {
    const path = resolve(logDirectory, `${log.result.seed}-${log.result.assignment[1]}-${log.result.assignment[2]}.json`);
    writeFileSync(path, JSON.stringify(log));
    return path;
  } : undefined,
  pairs,
  seed,
  maxHalfTurns,
  repetitionLimit,
  swapStarts: mapSide === 'swapped',
  aiOptionsByPlanner: clock === 'live' ? { v10: { strategyMaxPlanningMs: 650, tacticalMaxPlanningMs: 350 } } : {},
  aiOptions: {
    strategyMaxNodes: positiveInteger('--strategy-nodes', 7_200),
    tacticalMaxNodes: positiveInteger('--tactical-nodes', 3_000),
    strategyMaxPlanningMs: clock === 'live' ? 650 : 60_000,
    tacticalMaxPlanningMs: clock === 'live' ? 350 : 60_000,
  },
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
if (output) {
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...report, configuration: { ...options, plannerA, plannerB, clock, sourceFingerprint }, elapsedSeconds: (Date.now() - startedAt) / 1000 }, null, 2) + '\n');
}

if (report.games !== pairs * 2) {
  throw new Error(`Planner duel produced ${report.games} games; expected ${pairs * 2}.`);
}
if (report.replayFailuresByPlanner[plannerA] !== 0 || report.replayFailuresByPlanner[plannerB] !== 0) {
  throw new Error(`Planner duel replay failures: ${JSON.stringify(report.replayFailuresByPlanner)}.`);
}
