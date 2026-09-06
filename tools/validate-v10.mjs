import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

const quick = process.argv.includes('--quick');
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'reports/ai-v10', quick ? 'revision-development' : 'revision-heldout');
mkdirSync(output, { recursive: true });
const jobs = quick ? [{ name: 'development', opponent: 'v9', pairs: 2, seed: 20260907, side: 'standard', clock: 'nodes' }] : [
  ...['standard', 'swapped'].flatMap((side) => [0, 1].map((shard) => ({
    name: `v9-${side}-${shard}`, opponent: 'v9', pairs: 4, seed: 20270413 + shard * 4 * 2654435761, side, clock: 'nodes',
  }))),
  { name: 'v7', opponent: 'v7', pairs: 4, seed: 20270516, side: 'standard', clock: 'nodes' },
  { name: 'live', opponent: 'v9', pairs: 4, seed: 20270619, side: 'swapped', clock: 'live' },
];
const results = [];
const run = async (job) => {
  const path = resolve(output, `${job.name}.json`);
  const log = openSync(resolve(output, `${job.name}.log`), 'w');
  const child = spawn(process.execPath, ['tools/run-planner-simulation.mjs', '--planner-a', job.opponent, '--planner-b', 'v10',
    '--pairs', String(job.pairs), '--seed', String(job.seed), '--map-side', job.side, '--clock', job.clock, '--out', path],
  { cwd: root, stdio: ['ignore', log, log], windowsHide: true });
  const code = await new Promise((done, fail) => { child.on('error', fail); child.on('exit', done); });
  closeSync(log);
  if (code !== 0) throw new Error(`${job.name} failed; inspect ${job.name}.log`);
  const report = JSON.parse(readFileSync(path, 'utf8'));
  results.push({ name: job.name, opponent: job.opponent, games: report.games, wins: report.winsByPlanner.v10,
    losses: report.winsByPlanner[job.opponent], draws: report.draws,
    replayFailures: report.replayFailuresByPlanner.v10 + report.replayFailuresByPlanner[job.opponent],
  });
  writeFileSync(resolve(output, 'progress.json'), JSON.stringify(results));
};
// Independent deterministic batches can share CPUs. Run the wall-clock check alone.
const deterministic = jobs.filter((job) => job.clock === 'nodes');
for (let i = 0; i < deterministic.length; i += 4) await Promise.all(deterministic.slice(i, i + 4).map(run));
for (const job of jobs.filter((job) => job.clock === 'live')) await run(job);
const total = results.reduce((sum, result) => ({ games: sum.games + result.games, wins: sum.wins + result.wins,
  losses: sum.losses + result.losses, draws: sum.draws + result.draws, replayFailures: sum.replayFailures + result.replayFailures }),
{ games: 0, wins: 0, losses: 0, draws: 0, replayFailures: 0 });
const v9 = results.filter((row) => row.opponent === 'v9' && row.name !== 'live');
const score = v9.reduce((sum, row) => sum + row.wins + row.draws / 2, 0) / v9.reduce((sum, row) => sum + row.games, 0);
const live = results.find((row) => row.name === 'live');
const summary = { ...total, results, promotionRecommended: !quick && score >= 0.65 && total.replayFailures === 0
  && Boolean(live && live.wins > live.losses) };
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
