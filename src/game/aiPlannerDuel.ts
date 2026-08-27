import type { Faction, GameState, PlayerId } from '../data/types';
import { executeAiPlan, type AiPlan, type AiSearchOptions, type SearchStopReason } from './ai';
import { planAiTurnV2AnyPlayer } from './aiPlannerAdapters';
import { planAiTurnV3, type PlannerV3Doctrine } from './aiPlannerV3';
import { planAiTurnV4 } from './aiPlannerV4';
import { createGameState } from './engine';
import { seededRandom } from './simulation';

export type DuelPlannerId = 'v2' | 'v3' | 'v4';
export type DuelTermination = 'victory' | 'repetition' | 'turn-limit' | 'planner-failure';

export interface PlannerSearchTelemetry {
  plans: number;
  strategyNodes: number;
  tacticalNodes: number;
  strategyStopReasons: Record<SearchStopReason, number>;
  tacticalStopReasons: Record<SearchStopReason, number>;
  candidatesGenerated: number;
  candidatesAfterDeduplication: number;
  tacticalCandidatesAssessed: number;
  responseSequencesChecked: number;
}

type PlannerFunction = (state: GameState, options?: AiSearchOptions) => AiPlan;

const PLANNERS: Record<DuelPlannerId, PlannerFunction> = {
  v2: planAiTurnV2AnyPlayer,
  v3: planAiTurnV3,
  v4: planAiTurnV4,
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
  doctrineSelectionsByPlanner: Record<DuelPlannerId, Partial<Record<PlannerV3Doctrine, number>>>;
  searchTelemetryByPlanner: Record<DuelPlannerId, PlannerSearchTelemetry>;
}

export interface PlannerDuelBatchOptions {
  pairs?: number;
  seed?: number;
  maxHalfTurns?: number;
  repetitionLimit?: number;
  aiOptions?: AiSearchOptions;
  onPairComplete?: (progress: PlannerDuelProgress) => void;
}

export interface PlannerDuelProgress {
  pairsCompleted: number;
  totalPairs: number;
  gamesCompleted: number;
  v2Wins: number;
  v3Wins: number;
  draws: number;
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
  doctrineSelectionsByPlanner: Record<DuelPlannerId, Partial<Record<PlannerV3Doctrine, number>>>;
  searchTelemetryByPlanner: Record<DuelPlannerId, PlannerSearchTelemetry>;
  gamesDetail: PlannerDuelGameResult[];
}

export interface PlannerMatchupProgress {
  pairsCompleted: number;
  totalPairs: number;
  gamesCompleted: number;
  winsByPlanner: Record<DuelPlannerId, number>;
  draws: number;
}

export interface PlannerMatchupBatchResult {
  planners: readonly [DuelPlannerId, DuelPlannerId];
  pairs: number;
  games: number;
  winsByPlanner: Record<DuelPlannerId, number>;
  winRateByPlanner: Record<DuelPlannerId, number>;
  decisiveWinRateByPlanner: Record<DuelPlannerId, number>;
  draws: number;
  firstPlayerWins: number;
  firstPlayerWinRate: number;
  pairWinsByPlanner: Record<DuelPlannerId, number>;
  pairTies: number;
  averageHalfTurns: number;
  averageActionsPerTurn: Record<DuelPlannerId, number>;
  capturesByPlanner: Record<DuelPlannerId, number>;
  killsByPlanner: Record<DuelPlannerId, number>;
  replayFailuresByPlanner: Record<DuelPlannerId, number>;
  factionWinsByPlanner: Record<DuelPlannerId, Record<Faction, number>>;
  doctrineSelections: Partial<Record<PlannerV3Doctrine, number>>;
  doctrineSelectionsByPlanner: Record<DuelPlannerId, Partial<Record<PlannerV3Doctrine, number>>>;
  searchTelemetryByPlanner: Record<DuelPlannerId, PlannerSearchTelemetry>;
  gamesDetail: PlannerDuelGameResult[];
}

const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;
const emptyPlannerCounts = (): Record<DuelPlannerId, number> => ({ v2: 0, v3: 0, v4: 0 });
const emptyDoctrineSelections = (): Record<DuelPlannerId, Partial<Record<PlannerV3Doctrine, number>>> => ({
  v2: {},
  v3: {},
  v4: {},
});
const emptySearchTelemetry = (): PlannerSearchTelemetry => ({
  plans: 0,
  strategyNodes: 0,
  tacticalNodes: 0,
  strategyStopReasons: { complete: 0, 'node-limit': 0, 'time-limit': 0 },
  tacticalStopReasons: { complete: 0, 'node-limit': 0, 'time-limit': 0 },
  candidatesGenerated: 0,
  candidatesAfterDeduplication: 0,
  tacticalCandidatesAssessed: 0,
  responseSequencesChecked: 0,
});
const emptySearchTelemetryByPlanner = (): Record<DuelPlannerId, PlannerSearchTelemetry> => ({
  v2: emptySearchTelemetry(),
  v3: emptySearchTelemetry(),
  v4: emptySearchTelemetry(),
});
const mergeSearchTelemetry = (target: PlannerSearchTelemetry, source: PlannerSearchTelemetry): void => {
  target.plans += source.plans;
  target.strategyNodes += source.strategyNodes;
  target.tacticalNodes += source.tacticalNodes;
  target.candidatesGenerated += source.candidatesGenerated;
  target.candidatesAfterDeduplication += source.candidatesAfterDeduplication;
  target.tacticalCandidatesAssessed += source.tacticalCandidatesAssessed;
  target.responseSequencesChecked += source.responseSequencesChecked;
  for (const reason of ['complete', 'node-limit', 'time-limit'] as const) {
    target.strategyStopReasons[reason] += source.strategyStopReasons[reason];
    target.tacticalStopReasons[reason] += source.tacticalStopReasons[reason];
  }
};

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

type ExtendedPlannerDiagnostics = AiPlan['diagnostics'] & {
  planner?: string;
  selectedDoctrine?: PlannerV3Doctrine;
  candidatesGenerated?: number;
  candidatesAfterDeduplication?: number;
  tacticalCandidatesAssessed?: number;
  responseSequencesChecked?: number;
};

const plannerDiagnostics = (plan: AiPlan): ExtendedPlannerDiagnostics =>
  plan.diagnostics as ExtendedPlannerDiagnostics;

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
  const doctrineSelectionsByPlanner = emptyDoctrineSelections();
  const searchTelemetryByPlanner = emptySearchTelemetryByPlanner();
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
    const telemetry = searchTelemetryByPlanner[plannerId];
    telemetry.plans += 1;
    telemetry.strategyNodes += diagnostics.strategy.nodes;
    telemetry.tacticalNodes += diagnostics.tactical.nodes;
    telemetry.strategyStopReasons[diagnostics.strategy.stopReason] += 1;
    telemetry.tacticalStopReasons[diagnostics.tactical.stopReason] += 1;
    telemetry.candidatesGenerated += diagnostics.candidatesGenerated ?? 0;
    telemetry.candidatesAfterDeduplication += diagnostics.candidatesAfterDeduplication ?? 0;
    telemetry.tacticalCandidatesAssessed += diagnostics.tacticalCandidatesAssessed ?? 0;
    telemetry.responseSequencesChecked += diagnostics.responseSequencesChecked ?? 0;
    if ((diagnostics.planner === 'v3-portfolio' || diagnostics.planner === 'v4-portfolio')
      && diagnostics.selectedDoctrine) {
      doctrineSelections[diagnostics.selectedDoctrine] = (doctrineSelections[diagnostics.selectedDoctrine] ?? 0) + 1;
      const plannerDoctrines = doctrineSelectionsByPlanner[plannerId];
      plannerDoctrines[diagnostics.selectedDoctrine] = (plannerDoctrines[diagnostics.selectedDoctrine] ?? 0) + 1;
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
    doctrineSelectionsByPlanner,
    searchTelemetryByPlanner,
  };
};

export const simulatePlannerMatchupBatch = (
  plannerA: DuelPlannerId,
  plannerB: DuelPlannerId,
  options: PlannerDuelBatchOptions = {},
  onPairComplete?: (progress: PlannerMatchupProgress) => void,
): PlannerMatchupBatchResult => {
  if (plannerA === plannerB) throw new Error('Planner matchup requires two different planners.');
  const pairs = Math.max(1, Math.floor(options.pairs ?? 50));
  const baseSeed = Math.floor(options.seed ?? 20260826);
  const details: PlannerDuelGameResult[] = [];

  for (let index = 0; index < pairs; index += 1) {
    const seed = baseSeed + index * 0x9e3779b1;
    details.push(simulatePlannerDuelGame(seed, { 1: plannerA, 2: plannerB }, options));
    details.push(simulatePlannerDuelGame(seed, { 1: plannerB, 2: plannerA }, options));
    const winsByPlanner = emptyPlannerCounts();
    for (const game of details) {
      if (game.winnerPlanner) winsByPlanner[game.winnerPlanner] += 1;
    }
    onPairComplete?.({
      pairsCompleted: index + 1,
      totalPairs: pairs,
      gamesCompleted: details.length,
      winsByPlanner,
      draws: details.length - winsByPlanner[plannerA] - winsByPlanner[plannerB],
    });
  }

  const games = details.length;
  const winsByPlanner = emptyPlannerCounts();
  for (const game of details) {
    if (game.winnerPlanner) winsByPlanner[game.winnerPlanner] += 1;
  }
  const draws = games - winsByPlanner[plannerA] - winsByPlanner[plannerB];
  const firstPlayerWins = details.filter((game) => game.winnerPlayer === 1).length;
  const capturesByPlanner = emptyPlannerCounts();
  const killsByPlanner = emptyPlannerCounts();
  const replayFailuresByPlanner = emptyPlannerCounts();
  const actionsByPlanner = emptyPlannerCounts();
  const turnsByPlanner = emptyPlannerCounts();
  const factionWinsByPlanner: Record<DuelPlannerId, Record<Faction, number>> = {
    v2: { human: 0, undead: 0 },
    v3: { human: 0, undead: 0 },
    v4: { human: 0, undead: 0 },
  };
  const doctrineSelections: Partial<Record<PlannerV3Doctrine, number>> = {};
  const doctrineSelectionsByPlanner = emptyDoctrineSelections();
  const searchTelemetryByPlanner = emptySearchTelemetryByPlanner();
  let totalHalfTurns = 0;
  const pairWinsByPlanner = emptyPlannerCounts();
  let pairTies = 0;

  for (const game of details) {
    totalHalfTurns += game.halfTurns;
    for (const planner of [plannerA, plannerB]) {
      capturesByPlanner[planner] += game.capturesByPlanner[planner];
      killsByPlanner[planner] += game.killsByPlanner[planner];
      replayFailuresByPlanner[planner] += game.replayFailuresByPlanner[planner];
      actionsByPlanner[planner] += game.actionsByPlanner[planner];
      mergeSearchTelemetry(searchTelemetryByPlanner[planner], game.searchTelemetryByPlanner[planner]);
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
    for (const planner of [plannerA, plannerB]) {
      for (const [doctrine, count] of Object.entries(game.doctrineSelectionsByPlanner[planner])) {
        const key = doctrine as PlannerV3Doctrine;
        const plannerDoctrines = doctrineSelectionsByPlanner[planner];
        plannerDoctrines[key] = (plannerDoctrines[key] ?? 0) + (count ?? 0);
      }
    }
  }

  for (let index = 0; index < details.length; index += 2) {
    const pair = details.slice(index, index + 2);
    const winsA = pair.filter((game) => game.winnerPlanner === plannerA).length;
    const winsB = pair.filter((game) => game.winnerPlanner === plannerB).length;
    if (winsA > winsB) pairWinsByPlanner[plannerA] += 1;
    else if (winsB > winsA) pairWinsByPlanner[plannerB] += 1;
    else pairTies += 1;
  }

  const decisiveGames = winsByPlanner[plannerA] + winsByPlanner[plannerB];
  return {
    planners: [plannerA, plannerB],
    pairs,
    games,
    winsByPlanner,
    winRateByPlanner: {
      v2: ratio(winsByPlanner.v2, games),
      v3: ratio(winsByPlanner.v3, games),
      v4: ratio(winsByPlanner.v4, games),
    },
    decisiveWinRateByPlanner: {
      v2: ratio(winsByPlanner.v2, decisiveGames),
      v3: ratio(winsByPlanner.v3, decisiveGames),
      v4: ratio(winsByPlanner.v4, decisiveGames),
    },
    draws,
    firstPlayerWins,
    firstPlayerWinRate: ratio(firstPlayerWins, decisiveGames),
    pairWinsByPlanner,
    pairTies,
    averageHalfTurns: ratio(totalHalfTurns, games),
    averageActionsPerTurn: {
      v2: ratio(actionsByPlanner.v2, turnsByPlanner.v2),
      v3: ratio(actionsByPlanner.v3, turnsByPlanner.v3),
      v4: ratio(actionsByPlanner.v4, turnsByPlanner.v4),
    },
    capturesByPlanner,
    killsByPlanner,
    replayFailuresByPlanner,
    factionWinsByPlanner,
    doctrineSelections,
    doctrineSelectionsByPlanner,
    searchTelemetryByPlanner,
    gamesDetail: details,
  };
};

export const simulatePlannerDuelBatch = (
  options: PlannerDuelBatchOptions = {},
): PlannerDuelBatchResult => {
  const matchup = simulatePlannerMatchupBatch('v2', 'v3', options, (progress) => {
    options.onPairComplete?.({
      pairsCompleted: progress.pairsCompleted,
      totalPairs: progress.totalPairs,
      gamesCompleted: progress.gamesCompleted,
      v2Wins: progress.winsByPlanner.v2,
      v3Wins: progress.winsByPlanner.v3,
      draws: progress.draws,
    });
  });
  return {
    pairs: matchup.pairs,
    games: matchup.games,
    v2Wins: matchup.winsByPlanner.v2,
    v3Wins: matchup.winsByPlanner.v3,
    draws: matchup.draws,
    v2WinRate: matchup.winRateByPlanner.v2,
    v3WinRate: matchup.winRateByPlanner.v3,
    v3DecisiveWinRate: matchup.decisiveWinRateByPlanner.v3,
    firstPlayerWins: matchup.firstPlayerWins,
    firstPlayerWinRate: matchup.firstPlayerWinRate,
    pairWinsV2: matchup.pairWinsByPlanner.v2,
    pairWinsV3: matchup.pairWinsByPlanner.v3,
    pairTies: matchup.pairTies,
    averageHalfTurns: matchup.averageHalfTurns,
    averageActionsPerTurn: matchup.averageActionsPerTurn,
    capturesByPlanner: matchup.capturesByPlanner,
    killsByPlanner: matchup.killsByPlanner,
    replayFailuresByPlanner: matchup.replayFailuresByPlanner,
    factionWinsByPlanner: matchup.factionWinsByPlanner,
    doctrineSelections: matchup.doctrineSelections,
    doctrineSelectionsByPlanner: matchup.doctrineSelectionsByPlanner,
    searchTelemetryByPlanner: matchup.searchTelemetryByPlanner,
    gamesDetail: matchup.gamesDetail,
  };
};
