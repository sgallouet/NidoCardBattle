import { mkdirSync, writeFileSync } from 'node:fs';
import { executeAiPlan } from '../src/game/ai.ts';
import { FAIR_DUEL_AI_OPTIONS } from '../src/game/aiPlannerDuel.ts';
import { planAiTurnV5 } from '../src/game/aiPlannerV5.ts';
import { planAiTurnV6 } from '../src/game/aiPlannerV6.ts';
import { planAiTurnV7 } from '../src/game/aiPlannerV7.ts';
import { planAiTurnV8 } from '../src/game/aiPlannerV8.ts';
import { createGameState } from '../src/game/engine.ts';
import { seededRandom } from '../src/game/simulation.ts';

const rawSeed = process.argv[2] ?? '20260830';
const seed = Number(rawSeed);
if (!Number.isSafeInteger(seed) || seed < 1) throw new Error('Battle audit seed must be a positive integer.');

const planners = {
  v5: planAiTurnV5,
  v6: planAiTurnV6,
  v7: planAiTurnV7,
  v8: planAiTurnV8,
};

const clone = (value) => structuredClone(value);
const summarizeState = (state) => ({
  currentPlayer: state.currentPlayer,
  turnNumber: state.turnNumber,
  mana: { 1: state.players[1].mana, 2: state.players[2].mana },
  hands: { 1: [...state.players[1].hand], 2: [...state.players[2].hand] },
  countdown: state.countdown,
  sites: state.sites.map((site) => ({ id: site.id, type: site.type, coord: site.coord, owner: site.owner })),
  units: state.units.map((unit) => ({
    id: unit.id,
    definitionId: unit.definitionId,
    owner: unit.owner,
    hp: unit.hp,
    coord: unit.coord,
    exhausted: unit.exhausted,
    moved: unit.moved,
    attacked: unit.attacked,
  })),
});

const summarizePlan = (plan) => ({
  actions: plan.actions,
  strategicOutlook: plan.strategic.outlook,
  tacticalTier: plan.tactical.tier,
  tacticalScore: plan.tactical.score,
  worstResponseOutlook: plan.tactical.worstResponseStrategicOutlook,
  selectedDoctrine: plan.diagnostics.selectedDoctrine,
  strategyNodes: plan.diagnostics.strategy.nodes,
  tacticalNodes: plan.diagnostics.tactical.nodes,
});

const random = seededRandom(seed);
const state = createGameState(random);
const turns = [];
const actionCounts = { 1: 0, 2: 0 };
const captures = { 1: 0, 2: 0 };
const kills = { 1: 0, 2: 0 };
const maxHalfTurns = 140;

for (let halfTurn = 1; !state.winner && halfTurn <= maxHalfTurns; halfTurn += 1) {
  const actor = state.currentPlayer;
  const before = clone(state);
  const alternatives = Object.fromEntries(Object.entries(planners).map(([id, planner]) => [
    id,
    summarizePlan(planner(clone(state), FAIR_DUEL_AI_OPTIONS)),
  ]));
  const chosen = planners.v7(clone(state), FAIR_DUEL_AI_OPTIONS);
  const enemyBefore = state.units.filter((unit) => unit.owner !== actor).length;
  const siteOwnersBefore = new Map(state.sites.map((site) => [site.id, site.owner]));
  const execution = executeAiPlan(state, chosen, random);
  actionCounts[actor] += chosen.actions.length;
  captures[actor] += state.sites.filter((site) => site.owner === actor && siteOwnersBefore.get(site.id) !== actor).length;
  kills[actor] += Math.max(0, enemyBefore - state.units.filter((unit) => unit.owner !== actor).length);
  turns.push({
    halfTurn,
    actor,
    before: summarizeState(before),
    alternatives,
    chosenExecutionMessages: execution.actions,
    after: summarizeState(state),
  });
  if (!execution.endedTurn && !state.winner) throw new Error(`V7 failed to end half-turn ${halfTurn}.`);
}

const report = {
  seed,
  planner: 'v7-vs-v7',
  winner: state.winner,
  halfTurns: turns.length,
  actionCounts,
  captures,
  kills,
  turns,
};
const outputDirectory = 'reports/ai-audits';
mkdirSync(outputDirectory, { recursive: true });
const outputPath = `${outputDirectory}/v7-benchmark-${seed}.json`;
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`AI_BATTLE_AUDIT ${JSON.stringify({ outputPath, seed, winner: state.winner, halfTurns: turns.length, actionCounts, captures, kills })}`);
