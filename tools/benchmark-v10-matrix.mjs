import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'reports/ai-v10', `matrix-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(output, { recursive: true });
const jobs = ['standard', 'swapped'].flatMap(side => Array.from({ length: 4 }, (_, shard) => ({
  name: `${side}-${shard}`, side, seed: 20270823 + shard * 3 * 2654435761,
})));
const reports = [];
const run = async job => {
  const path = resolve(output, `${job.name}.json`);
  const fd = openSync(resolve(output, `${job.name}.log`), 'w');
  const child = spawn(process.execPath, ['tools/run-planner-simulation.mjs', '--planner-a', 'v9', '--planner-b', 'v10',
    '--pairs', '3', '--seed', String(job.seed), '--map-side', job.side, '--clock', 'nodes', '--out', path],
    { cwd: root, stdio: ['ignore', fd, fd], windowsHide: true });
  const code = await new Promise((done, fail) => { child.once('error', fail); child.once('exit', done); });
  closeSync(fd);
  if (code !== 0) throw new Error(`${job.name} failed; see ${path.replace('.json', '.log')}`);
  reports.push({ job, report: JSON.parse(readFileSync(path, 'utf8')) });
  writeFileSync(resolve(output, 'progress.json'), JSON.stringify({ games: reports.reduce((n, r) => n + r.report.games, 0),
    v10Wins: reports.reduce((n, r) => n + r.report.winsByPlanner.v10, 0), draws: reports.reduce((n, r) => n + r.report.draws, 0) }));
};
console.log(JSON.stringify({ output, games: 48, clock: 'fixed nodes', status: 'running' }));
for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(run));
const cells = {};
const weaknesses = { losses: 0, lostCommanderFirst: 0, lossesWithMoreCaptures: 0, lossesWithMoreKills: 0,
  commanderMovedBeforeDeath: 0, lossesWhileAheadOnSitesAtCommanderDeath: 0 };
let wins = 0, draws = 0, replayFailures = 0, timeLimits = 0;
const fingerprints = new Set();
for (const { job, report } of reports) {
  fingerprints.add(report.configuration.sourceFingerprint);
  replayFailures += report.replayFailuresByPlanner.v9 + report.replayFailuresByPlanner.v10;
  for (const planner of ['v9', 'v10']) timeLimits += report.searchTelemetryByPlanner[planner].strategyStopReasons['time-limit'] + report.searchTelemetryByPlanner[planner].tacticalStopReasons['time-limit'];
  for (const g of report.gamesDetail) {
    wins += Number(g.winnerPlanner === 'v10'); draws += Number(!g.winnerPlanner);
    for (const player of [1, 2]) {
      const planner = g.assignment[player], faction = g.playerFactions[player];
      const placement = (player === 1) === (job.side === 'standard') ? 'bottom-left' : 'upper-right';
      const key = `${planner}/${faction}/${placement}`;
      const cell = cells[key] ??= { games: 0, wins: 0, draws: 0 };
      cell.games++; cell.wins += Number(g.winnerPlayer === player); cell.draws += Number(!g.winnerPlayer);
    }
    if (g.winnerPlanner !== 'v9') continue;
    weaknesses.losses++;
    weaknesses.lossesWithMoreCaptures += Number(g.capturesByPlanner.v10 > g.capturesByPlanner.v9);
    weaknesses.lossesWithMoreKills += Number(g.killsByPlanner.v10 > g.killsByPlanner.v9);
    const log = JSON.parse(readFileSync(g.logPath, 'utf8'));
    const player = g.assignment[1] === 'v10' ? 1 : 2;
    const first = log.turns.flatMap(turn => turn.steps.flatMap(step => (step.delta.unitsRemoved ?? [])
      .filter(u => u.definitionId === 'commander').map(unit => ({ turn, unit })) ))[0];
    if (first?.unit.player === player) {
      weaknesses.lostCommanderFirst++;
      const prior = log.turns.filter(t => t.halfTurn < first.turn.halfTurn && t.player === player).at(-1);
      weaknesses.commanderMovedBeforeDeath += Number(prior?.steps.some(s => s.action.kind === 'move' && s.action.unitId === first.unit.id));
      const sites = first.turn.start.sites;
      weaknesses.lossesWhileAheadOnSitesAtCommanderDeath += Number(sites.filter(s => s.owner === player).length > sites.filter(s => s.owner && s.owner !== player).length);
    }
  }
}
if (fingerprints.size !== 1 || fingerprints.has(undefined)) throw new Error('Benchmark contains mixed or missing code fingerprints.');
for (const cell of Object.values(cells)) {
  cell.winPercent = Math.round(cell.wins / cell.games * 1000) / 10;
  cell.scorePercent = Math.round((cell.wins + cell.draws / 2) / cell.games * 1000) / 10;
}
const summary = { games: 48, v10: { wins, losses: 48 - wins - draws, draws }, cells, weaknesses,
  replayFailures, timeLimits, sourceFingerprint: [...fingerprints][0],
  caveat: 'Fixed-node comparison. Humans always act first: faction and turn-order effects are confounded.', output };
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
