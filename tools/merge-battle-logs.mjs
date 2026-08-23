import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BATTLE_LOG_SCHEMA_VERSION,
  analyzeBattleLogs,
} from '../src/game/battleLog.ts';

const outputIndex = process.argv.indexOf('--out');
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  throw new Error('Usage: merge-battle-logs <input...> --out <output>');
}

const inputPaths = process.argv.slice(2, outputIndex).map((path) => resolve(path));
if (inputPaths.length === 0) throw new Error('At least one input report is required.');
const outputPath = resolve(process.argv[outputIndex + 1]);
const reports = await Promise.all(inputPaths.map(async (path) =>
  JSON.parse(await readFile(path, 'utf8'))));
for (const report of reports) {
  if (report.schemaVersion !== BATTLE_LOG_SCHEMA_VERSION) {
    throw new Error(`Cannot merge battle-log schema ${report.schemaVersion}; expected ${BATTLE_LOG_SCHEMA_VERSION}.`);
  }
}

const logs = reports.flatMap((report) => report.logs);
const merged = {
  schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
  logs,
  analysis: analyzeBattleLogs(logs),
};
await writeFile(outputPath, `${JSON.stringify(merged)}\n`, 'utf8');
console.log(`MERGED_BATTLE_LOG_REPORT ${JSON.stringify({ outputPath, matches: logs.length })}`);
