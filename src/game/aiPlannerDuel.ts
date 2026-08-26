import type { Faction, GameState, PlayerId } from '../data/types';
import { GAME_ACTION_KINDS, type GameAction } from './actions';
import { executeAiPlan, type AiPlan, type AiSearchOptions } from './ai';
import { planAiTurnV2AnyPlayer } from './aiPlannerAdapters';
import { planAiTurnV3, type PlannerV3Doctrine } from './aiPlannerV3';
import { createGameState } from './engine';
import { seededRandom } from './simulation';

export type DuelPlannerId = 'v2' | 'v3';
export type DuelTermination = 'victory' | 'repetition' | 'turn-limit' | 'planner-failure';

type PlannerFunction = (state: GameState, options?: AiSearchOptions) => AiPlan;

const PLANNERS: Record<DuelPlannerId, PlannerFunction> = {
  v2: planAiTurnV2AnyPlayer,
  v3: planAiTurnV3,
};

export const FAIR_DUEL_AI_OPTIONS: AiSearchOptions = {
  strategyMaxNodes: 2_600,
  strategyMaxPlanningMs: 60_000,
  tacticalMaxNodes: 1_200,
  tacticalMaxPlanningMs: 60_000,
};

export interface PlannerDuelGameResult {
  seed: number;
  assignment: Record<PlayerId, DuelPlannerId>;
  playerFactions: Record<PlayerId, Faction>;
  winnerPlayer: PlayerId | null;
  winnerPlanner: DuelPlannerId | null;
  winnerFaction: Faction | null;
  termination: DuelTermination;
  halfTurns: number;
  actionsByPlanner: Record<DuelPlannerId, number>;
  capturesByPlanner: Record<DuelPlannerId, number>;
  killsByPlanner: Record<DuelPlannerId, number>;
  replayFailuresByPlanner: Record<DuelPlannerId, number>;
  doctrineSelections: Partial<Record<PlannerV3Doctrine, number>>;
}

export interface PlannerDuelBatchOptions {
  pairs?: number;
  seed?: number;
  maxHalfTurns?: number;
  repetitionLimit?: number;
  aiOptions?: AiSearchOptions;
}

export interface PlannerDuelBatchResult {
  pairs: number;
  games: number;
  v2Wins: number;
  v3Wins: number;
  draws: number;
  v2WinRate: number;
  v3WinRate: number;
  v3DecisiveWinRate: number;
  firstPlayerWins: number;
  firstPlayerWinRate: number;
  pairWinsV2: number;
  pairWinsV3: number;
  pairTies: number;
  averageHalfTurns: number;
  averageActionsPerTurn: Record<DuelPlannerId, number>;
  capturesByPlanner: Record<DuelPlannerId, number>;
  killsByPlanner: Record<DuelPlannerId, number>;
  replayFailuresByPlanner: Record<DuelPlannerId, number>;
  factionWinsByPlanner: Record<DuelPlannerId, Record<Faction, number>>;
  doctrineSelections: Partial<Record<PlannerV3Doctrine, number>>;
  gamesDetail: PlannerDuelGameResult[];
}

const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;
const emptyPlannerCounts = (): Record<DuelPlannerId, number> => ({ v2: 0, v3: 0 });

const duelFingerprint = (state: GameState): string => JSON.stringify({
  currentPlayer: state.currentPlayer,
  turnNumber: state.turnNumber,
  players: {
    1: state.players[1],
    2: state.players[2],
  },
  units: [...state.units].sort((left, right) => left.id.localeCompare(right.id)),
  sites: [...state.sites].sort((left, right) => left.id.localeCompare(right.id)),
  builtBridges: [...state.builtBridges].sort((left, right) => left.q - right.q || left.r - right.r),
  scorchedForests: [...state.scorchedForests].sort((left, right) => left.q - right.q || left.r - right.r),
  pendingManaWells: [...state.pendingManaWells].sort((left, right) => left.id.localeCompare(right.id)),
  tileEffects: [...state.tileEffects].sort((left, right) => left.coord.q - right.coord.q || left.coord.r - right.coord.r),
  countdown: state.countdown,
  winner: state.winner,
});

const plannerDiagnostics = (plan: AiPlan): { planner?: string; selectedDoctrine?: PlannerV3Doctrine } =>
  plan.diagnostics as AiPlan['diagnostics'] & { planner?: string; selectedDoctrine?: PlannerV3Doctrine };

const ownerMap = (state: GameState): Map<string, PlayerId | null> =>
  new Map(state.sites.map((site) => [site.id, site.owner]));

const enemyUnitCount = (state: GameState, actor: PlayerId): number =>
  state.units.filter((unit) => unit.owner !== actor).length;

export const simulatePlannerDuelGame = (
  seed: number,
  assignment: Record<PlayerId, DuelPlannerId>,
  options: PlannerDuelBatchOptions = {},
): PlannerDuelGameResult => {
  const random = seededRandom(seed);
  const state = createGameState(random);
  const playerFactions: Record<PlayerId, Faction> = {
    1: state.players[1].faction,
    2: state.players[2].faction,
  };
  const aiOptions: AiSearchOptions = { ...FAIR_DUEL_AI_OPTIONS, ...options.aiOptions };
  const maxHalfTurns = options.maxHalfTurns ?? 140;
  const repetitionLimit = options.repetitionLimit ?? 4;
  const actionsByPlanner = emptyPlannerCounts();
  const capturesByPlanner = emptyPlannerCounts();
  const killsByPlanner = emptyPlannerCounts();
  const replayFailuresByPlanner = emptyPlannerCounts();
  const doctrineSelections: Partial<Record<PlannerV3Doctrine, number>> = {};
  const seen = new Map<string, number>();
  let halfTurns = 0;
  let termination: DuelTermination = 'turn-limit';

  while (!state.winner && halfTurns < maxHalfTurns) {
    const fingerprint = duelFingerprint(state);
    const repetitions = (seen.get(fingerprint) ?? 0) + 1;
    seen.set(fingerprint, repetitions);
    if (repetitions >= repetitionLimit) {
      termination = 'repetition';
      break;
    }

    const actor = state.currentPlayer;
    const plannerId = assignment[actor];
    const planner = PLANNERS[plannerId];
    const beforeSites = ownerMap(state);
    const enemyUnitsBefore = enemyUnitCount(state, actor);
    const plan = planner(state, aiOptions);
    actionsByPlanner[plannerId] += plan.actions.length;

    const diagnostics = plannerDiagnostics(plan);
    if (diagnostics.planner === 'v3-portfolio' && diagnostics.selectedDoctrine) {
      doctrineSelections[diagnostics.selectedDoctrine] = (doctrineSelections[diagnostics.selectedDoctrine] ?? 0) + 1;
    }

    const turn = executeAiPlan(state, plan, random);
    if (turn.actions.some((message) => message.startsWith('AI plan stopped:'))) {
      replayFailuresByPlanner[plannerId] += 1;
    }
    capturesByPlanner[plannerId] += state.sites.filter((site) =>
      site.owner === actor && beforeSites.get(site.id) !== actor).length;
    killsByPlanner[plannerId] += Math.max(0, enemyUnitsBefore - enemyUnitCount(state, actor));
    halfTurns += 1;

    if (!state.winner && !turn.endedTurn) {
      termination = 'planner-failure';
      replayFailuresByPlanner[plannerId] += 1;
      break;
    }
  }

  if (state.winner) termination = 'victory';
  const winnerPlayer = state.winner;
  return {
    seed,
    assignment: { ...assignment },
    playerFactions,
    winnerPlayer,
    winnerPlanner: winnerPlayer ? assignment[winnerPlayer] : null,
    winnerFaction: winnerPlayer ? playerFactions[winnerPlayer] : null,
    termination,
    halfTurns,
    actionsByPlanner,
    capturesByPlanner,
    killsByPlanner,
    replayFailuresByPlanner,
    doctrineSelections,
  };
};

export const simulatePlannerDuelBatch = (
  options: PlannerDuelBatchOptions = {},
): PlannerDuelBatchResult => {
  const pairs = Math.max(1, Math.floor(options.pairs ?? 50));
  const baseSeed = Math.floor(options.seed ?? 20260826);
  const details: PlannerDuelGameResult[] = [];

  for (let index = 0; index < pairs; index += 1) {
    const seed = baseSeed + index * 0x9e3779b1;
    details.push(simulatePlannerDuelGame(seed, { 1: 'v2', 2: 'v3' }, options));
    details.push(simulatePlannerDuelGame(seed, { 1: 'v3', 2: 'v2' }, options));
  }

  const games = details.length;
  const v2Wins = details.filter((game) => game.winnerPlanner === 'v2').length;
  const v3Wins = details.filter((game) => game.winnerPlanner === 'v3').length;
  const draws = games - v2Wins - v3Wins;
  const firstPlayerWins = details.filter((game) => game.winnerPlayer === 1).length;
  const capturesByPlanner = emptyPlannerCounts();
  const killsByPlanner = emptyPlannerCounts();
  const replayFailuresByPlanner = emptyPlannerCounts();
  const actionsByPlanner = emptyPlannerCounts();
  const turnsByPlanner = emptyPlannerCounts();
  const factionWinsByPlanner: Record<DuelPlannerId, Record<Faction, number>> = {
    v2: { human: 0, undead: 0 },
    v3: { human: 0, undead: 0 },
  };
  const doctrineSelections: Partial<Record<PlannerV3Doctrine, number>> = {};
  let totalHalfTurns = 0;
  let pairWinsV2 = 0;
  let pairWinsV3 = 0;
  let pairTies = 0;

  for (const game of details) {
    totalHalfTurns += game.halfTurns;
    for (const planner of ['v2', 'v3'] as const) {
      capturesByPlanner[planner] += game.capturesByPlanner[planner];
      killsByPlanner[planner] += game.killsByPlanner[planner];
      replayFailuresByPlanner[planner] += game.replayFailuresByPlanner[planner];
      actionsByPlanner[planner] += game.actionsByPlanner[planner];
    }
    for (const player of [1, 2] as const) {
      turnsByPlanner[game.assignment[player]] += Math.ceil((game.halfTurns - (player === 2 ? 1 : 0)) / 2);
    }
    if (game.winnerPlanner && game.winnerFaction) {
      factionWinsByPlanner[game.winnerPlanner][game.winnerFaction] += 1;
    }
    for (const [doctrine, count] of Object.entries(game.doctrineSelections)) {
      const key = doctrine as PlannerV3Doctrine;
      doctrineSelections[key] = (doctrineSelections[key] ?? 0) + (count ?? 0);
    }
  }

  for (let index = 0; index < details.length; index += 2) {
    const pair = details.slice(index, index + 2);
    const v2 = pair.filter((game) => game.winnerPlanner === 'v2').length;
    const v3 = pair.filter((game) => game.winnerPlanner === 'v3').length;
    if (v2 > v3) pairWinsV2 += 1;
    else if (v3 > v2) pairWinsV3 += 1;
    else pairTies += 1;
  }

  return {
    pairs,
    games,
    v2Wins,
    v3Wins,
    draws,
    v2WinRate: ratio(v2Wins, games),
    v3WinRate: ratio(v3Wins, games),
    v3DecisiveWinRate: ratio(v3Wins, v2Wins + v3Wins),
    firstPlayerWins,
    firstPlayerWinRate: ratio(firstPlayerWins, v2Wins + v3Wins),
    pairWinsV2,
    pairWinsV3,
    pairTies,
    averageHalfTurns: ratio(totalHalfTurns, games),
    averageActionsPerTurn: {
      v2: ratio(actionsByPlanner.v2, turnsByPlanner.v2),
      v3: ratio(actionsByPlanner.v3, turnsByPlanner.v3),
    },
    capturesByPlanner,
    killsByPlanner,
    replayFailuresByPlanner,
    factionWinsByPlanner,
    doctrineSelections,
    gamesDetail: details,
  };
};
