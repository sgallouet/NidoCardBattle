import { readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';

const [file, ...args] = process.argv.slice(2);
if (!file) throw new Error('Usage: node tools/inspect-battle.mjs <report-or-game.json> [--game 1] [--from 12 --count 2] [--step 1 --steps 20] [--state]');
const number = (flag, defaultValue, max = Infinity) => {
  const i = args.indexOf(flag);
  if (i < 0) return defaultValue;
  const n = Number(args[i + 1]);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`${flag} requires an integer from 1 to ${max}`);
  return n;
};
const nonzero = (counts) => Object.fromEntries(Object.entries(counts ?? {}).filter(([, n]) => n !== 0));
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
let data = read(file);
const game = number('--game', undefined);
if (data.gamesDetail) {
  if (game === undefined) {
    console.log(JSON.stringify({ games: data.games, wins: nonzero(data.winsByPlanner), draws: data.draws,
      captures: nonzero(data.capturesByPlanner), kills: nonzero(data.killsByPlanner),
      matches: args.includes('--list') ? data.gamesDetail.map((g, i) => ({ game: i + 1, seed: g.seed, assignment: g.assignment,
        winner: g.winnerPlanner, turns: g.halfTurns, captures: nonzero(g.capturesByPlanner), kills: nonzero(g.killsByPlanner), recorded: Boolean(g.logPath) })).slice(number('--offset', 1) - 1, number('--offset', 1) - 1 + number('--limit', 10, 20)) : undefined, hint: 'Use --list for match summaries, then --game N --from T for selected moves.' }));
    process.exit(0);
  }
  const selected = data.gamesDetail[game - 1];
  if (!selected?.logPath) throw new Error('Selected game has no saved move log. Older reports cannot reconstruct unrecorded moves.');
  data = read(isAbsolute(selected.logPath) ? selected.logPath : resolve(dirname(file), selected.logPath));
}
if (Array.isArray(data.logs)) {
  if (game === undefined) { console.log(JSON.stringify(data.analysis)); process.exit(0); }
  if (!data.logs[game - 1]) throw new Error('Game index is out of range.');
  data = data.logs[game - 1];
}
if (Array.isArray(data.events)) {
  const from = number('--from', undefined);
  if (from === undefined) {
    console.log(JSON.stringify({ winner: data.winner, complete: data.historyComplete, events: data.events.length,
      turns: data.final?.turnNumber, decisiveEvents: data.events.filter((e) => e.delta?.unitsRemoved?.some((u) => u.definitionId === 'commander'))
        .map((e) => ({ sequence: e.sequence, turn: e.turnNumber, message: e.message })) }));
  } else {
    const count = number('--count', 2, 5), step = number('--step', 1), steps = number('--steps', 20, 50);
    const events = data.events.filter((e) => e.turnNumber >= from && e.turnNumber < from + count && e.kind !== 'ai-plan');
    console.log(JSON.stringify({ totalEvents: events.length, nextStep: step - 1 + steps < events.length ? step + steps : null,
      events: events.slice(step - 1, step - 1 + steps) }));
  }
  process.exit(0);
}
if (!Array.isArray(data.turns)) throw new Error('Expected a match report or recorded battle.');
const from = number('--from', undefined);
if (from === undefined) {
  console.log(JSON.stringify({ result: { seed: data.result.seed ?? data.seed, winner: data.result.winnerPlanner ?? data.result.winnerPlayer, termination: data.result.termination, assignment: data.result.assignment }, turns: data.turns.length,
    decisiveTurns: data.turns.filter((t) => t.steps.some((s) => s.delta.unitsRemoved?.some((u) => u.definitionId === 'commander')
      || s.delta.state?.before.countdown?.player !== s.delta.state?.after.countdown?.player)).map((t) => t.halfTurn),
    hint: 'Use --from <half-turn> --count 2 to inspect moves; --state includes the starting board.' }));
} else {
  const count = number('--count', 2, 5), step = number('--step', 1), steps = number('--steps', 20, 50);
  const selected = data.turns.filter((t) => t.halfTurn >= from && t.halfTurn < from + count);
  if (!selected.length) throw new Error('No turns in the requested range.');
  console.log(JSON.stringify(selected.map((t) => ({ halfTurn: t.halfTurn, player: t.player ?? t.actor, planner: t.planner,
    ...(args.includes('--state') ? { start: t.start } : {}), totalSteps: t.steps.length,
    nextStep: step - 1 + steps < t.steps.length ? step + steps : null,
    steps: t.steps.slice(step - 1, step - 1 + steps).map((s, i) => ({ step: step + i, ...s })) }))));
}
