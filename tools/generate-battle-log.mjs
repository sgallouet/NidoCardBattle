import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generateBattleLogReport } from '../src/game/battleLog.ts';

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

const seed = positiveInteger('--seed', 20260823);
const matches = positiveInteger('--matches', 1);
const maxHalfTurns = positiveInteger('--max-half-turns', 160);
const repetitionLimit = positiveInteger('--repetition-limit', 4);
const outputPath = resolve(valueAfter('--out') ?? `reports/battle-logs/battle-log-${seed}-${matches}.json`);
const pretty = process.argv.includes('--pretty');

const report = generateBattleLogReport({
  seed,
  matches,
  maxHalfTurns,
  repetitionLimit,
  alternateFirstPlayer: true,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, pretty ? 2 : undefined)}\n`, 'utf8');

const compactSummary = {
  outputPath,
  matches: report.analysis.matches,
  wins: report.analysis.wins,
  terminations: report.analysis.terminations,
  averageRounds: report.analysis.averageRounds,
  findings: report.analysis.findings,
};
console.log(`BATTLE_LOG_REPORT ${JSON.stringify(compactSummary)}`);
