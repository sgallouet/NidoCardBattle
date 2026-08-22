import type { CardDefinitionId } from '../data/cards';
import type { GameState, PlayerId, SiteType } from '../data/types';
import {
  SIMULATION_AI_OPTIONS,
  executeAiPlan,
  planAiTurn,
  type AiAction,
  type AiSearchOptions,
} from './ai';
import { createGameState } from './engine';

export type SimulationTermination = 'victory' | 'repetition' | 'turn-limit';

export interface SimulationActionCounts {
  summon: number;
  move: number;
  attack: number;
  displace: number;
}

export interface SimulationObjectiveTurns {
  well: number;
  fort: number;
}

export interface SimulationMatchResult {
  seed: number;
  winner: PlayerId | null;
  winnerFaction: 'human' | 'undead' | null;
  termination: SimulationTermination;
  halfTurns: number;
  rounds: number;
  commanderDeaths: Record<PlayerId, boolean>;
  actionCounts: Record<PlayerId, SimulationActionCounts>;
  summonsByCard: Partial<Record<CardDefinitionId, number>>;
  objectiveControlTurns: Record<PlayerId, SimulationObjectiveTurns>;
  finalObjectiveControl: Record<PlayerId, SimulationObjectiveTurns>;
  peakUnits: Record<PlayerId, number>;
  totalSearchStates: number;
  totalResponseStates: number;
  timedOutTurns: number;
  planReplayFailures: number;
}

export interface SimulationBatchResult {
  matches: number;
  humanWins: number;
  undeadWins: number;
  stalemates: number;
  humanWinRate: number;
  undeadWinRate: number;
  stalemateRate: number;
  averageRounds: number;
  averageHalfTurns: number;
  averageSearchStatesPerTurn: number;
  averageResponseStatesPerTurn: number;
  timedOutTurnRate: number;
  replayFailureRate: number;
  commanderDeathGames: Record<PlayerId, number>;
  objectiveControlShare: Record<PlayerId, { well: number; fort: number }>;
  summonsByCard: Partial<Record<CardDefinitionId, number>>;
  actionCounts: Record<PlayerId, SimulationActionCounts>;
  terminations: Record<SimulationTermination, number>;
  matchesDetail: SimulationMatchResult[];
}

export interface SimulationOptions {
  maxHalfTurns?: number;
  repetitionLimit?: number;
  aiOptions?: AiSearchOptions;
}

export interface SimulationBatchOptions extends SimulationOptions {
  matches?: number;
  seed?: number;
}

const emptyActionCounts = (): SimulationActionCounts => ({ summon: 0, move: 0, attack: 0, displace: 0 });
const emptyObjectives = (): SimulationObjectiveTurns => ({ well: 0, fort: 0 });

/** Small deterministic PRNG so simulation runs are reproducible from a seed. */
export const seededRandom = (seed: number): (() => number) => {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
};

const factionName = (state: GameState, player: PlayerId): 'human' | 'undead' => state.players[player].faction;

const commanderAlive = (state: GameState, player: PlayerId): boolean =>
  state.units.some((unit) => unit.owner === player && unit.definitionId === 'commander');

const countUnits = (state: GameState, player: PlayerId): number =>
  state.units.filter((unit) => unit.owner === player).length;

const objectiveCounts = (state: GameState, player: PlayerId): SimulationObjectiveTurns => {
  const counts = emptyObjectives();
  for (const site of state.sites) {
    if (site.owner !== player || site.type === 'keep') continue;
    counts[site.type as Exclude<SiteType, 'keep'>] += 1;
  }
  return counts;
};

const addObjectiveSnapshot = (
  totals: Record<PlayerId, SimulationObjectiveTurns>,
  state: GameState,
): void => {
  for (const player of [1, 2] as const) {
    const counts = objectiveCounts(state, player);
    totals[player].well += counts.well;
    totals[player].fort += counts.fort;
  }
};

const recordActions = (
  player: PlayerId,
  actions: AiAction[],
  counts: Record<PlayerId, SimulationActionCounts>,
  summonsByCard: Partial<Record<CardDefinitionId, number>>,
): void => {
  for (const action of actions) {
    counts[player][action.kind] += 1;
    if (action.kind === 'summon') {
      summonsByCard[action.cardId] = (summonsByCard[action.cardId] ?? 0) + 1;
    }
  }
};

/** Includes hidden zones because this is only for simulator loop detection, never AI decision making. */
const repetitionFingerprint = (state: GameState): string => {
  const players = ([1, 2] as const).map((player) => {
    const data = state.players[player];
    return `${player}:${data.mana}:${data.deck.join(',')}:${data.hand.join(',')}:${data.discard.join(',')}`;
  }).join('|');
  const units = [...state.units]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((unit) => `${unit.id}:${unit.definitionId}:${unit.owner}:${unit.hp}:${unit.coord.q},${unit.coord.r}`)
    .join('|');
  const sites = state.sites.map((site) => `${site.id}:${site.owner ?? 0}`).join('|');
  return `${state.currentPlayer};${players};${units};${sites};${state.countdown?.player ?? 0}:${state.countdown?.checkpoints ?? 0}`;
};

export const simulateAiMatch = (seed: number, options: SimulationOptions = {}): SimulationMatchResult => {
  const maxHalfTurns = options.maxHalfTurns ?? 160;
  const repetitionLimit = options.repetitionLimit ?? 4;
  const aiOptions: AiSearchOptions = { ...SIMULATION_AI_OPTIONS, ...options.aiOptions };
  const random = seededRandom(seed);
  const state = createGameState(random);
  const actionCounts: Record<PlayerId, SimulationActionCounts> = {
    1: emptyActionCounts(),
    2: emptyActionCounts(),
  };
  const objectiveControlTurns: Record<PlayerId, SimulationObjectiveTurns> = {
    1: emptyObjectives(),
    2: emptyObjectives(),
  };
  const peakUnits: Record<PlayerId, number> = {
    1: countUnits(state, 1),
    2: countUnits(state, 2),
  };
  const commanderDeaths: Record<PlayerId, boolean> = { 1: false, 2: false };
  const summonsByCard: Partial<Record<CardDefinitionId, number>> = {};
  const seenStates = new Map<string, number>();
  let halfTurns = 0;
  let totalSearchStates = 0;
  let totalResponseStates = 0;
  let timedOutTurns = 0;
  let planReplayFailures = 0;
  let termination: SimulationTermination = 'turn-limit';

  while (!state.winner && halfTurns < maxHalfTurns) {
    const fingerprint = repetitionFingerprint(state);
    const repeats = (seenStates.get(fingerprint) ?? 0) + 1;
    seenStates.set(fingerprint, repeats);
    if (repeats >= repetitionLimit) {
      termination = 'repetition';
      break;
    }

    const actor = state.currentPlayer;
    const plan = planAiTurn(state, aiOptions);
    recordActions(actor, plan.actions, actionCounts, summonsByCard);
    totalSearchStates += plan.searchedStates;
    totalResponseStates += plan.responseStates;
    if (plan.timedOut) timedOutTurns += 1;

    const turn = executeAiPlan(state, plan, random);
    if (turn.actions.some((message) => message.startsWith('AI plan stopped:'))) planReplayFailures += 1;
    halfTurns += 1;

    for (const player of [1, 2] as const) {
      if (!commanderAlive(state, player)) commanderDeaths[player] = true;
      peakUnits[player] = Math.max(peakUnits[player], countUnits(state, player));
    }
    addObjectiveSnapshot(objectiveControlTurns, state);
  }

  if (state.winner) termination = 'victory';
  const finalObjectiveControl: Record<PlayerId, SimulationObjectiveTurns> = {
    1: objectiveCounts(state, 1),
    2: objectiveCounts(state, 2),
  };

  return {
    seed,
    winner: state.winner,
    winnerFaction: state.winner ? factionName(state, state.winner) : null,
    termination,
    halfTurns,
    rounds: halfTurns / 2,
    commanderDeaths,
    actionCounts,
    summonsByCard,
    objectiveControlTurns,
    finalObjectiveControl,
    peakUnits,
    totalSearchStates,
    totalResponseStates,
    timedOutTurns,
    planReplayFailures,
  };
};

const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;

export const simulateAiBatch = (options: SimulationBatchOptions = {}): SimulationBatchResult => {
  const matches = Math.max(1, Math.floor(options.matches ?? 100));
  const seed = Math.floor(options.seed ?? 1);
  const details = Array.from({ length: matches }, (_, index) =>
    simulateAiMatch(seed + index * 0x9e3779b1, options));

  const humanWins = details.filter((match) => match.winnerFaction === 'human').length;
  const undeadWins = details.filter((match) => match.winnerFaction === 'undead').length;
  const stalemates = matches - humanWins - undeadWins;
  const totalHalfTurns = details.reduce((sum, match) => sum + match.halfTurns, 0);
  const totalSearchStates = details.reduce((sum, match) => sum + match.totalSearchStates, 0);
  const totalResponseStates = details.reduce((sum, match) => sum + match.totalResponseStates, 0);
  const totalTimedOutTurns = details.reduce((sum, match) => sum + match.timedOutTurns, 0);
  const totalReplayFailures = details.reduce((sum, match) => sum + match.planReplayFailures, 0);
  const commanderDeathGames: Record<PlayerId, number> = {
    1: details.filter((match) => match.commanderDeaths[1]).length,
    2: details.filter((match) => match.commanderDeaths[2]).length,
  };
  const actionCounts: Record<PlayerId, SimulationActionCounts> = {
    1: emptyActionCounts(),
    2: emptyActionCounts(),
  };
  const objectiveTotals: Record<PlayerId, SimulationObjectiveTurns> = {
    1: emptyObjectives(),
    2: emptyObjectives(),
  };
  const summonsByCard: Partial<Record<CardDefinitionId, number>> = {};
  const terminations: Record<SimulationTermination, number> = {
    victory: 0,
    repetition: 0,
    'turn-limit': 0,
  };

  for (const match of details) {
    terminations[match.termination] += 1;
    for (const player of [1, 2] as const) {
      for (const kind of ['summon', 'move', 'attack', 'displace'] as const) {
        actionCounts[player][kind] += match.actionCounts[player][kind];
      }
      objectiveTotals[player].well += match.objectiveControlTurns[player].well;
      objectiveTotals[player].fort += match.objectiveControlTurns[player].fort;
    }
    for (const [cardId, count] of Object.entries(match.summonsByCard)) {
      const id = cardId as CardDefinitionId;
      summonsByCard[id] = (summonsByCard[id] ?? 0) + (count ?? 0);
    }
  }

  const totalWellControl = objectiveTotals[1].well + objectiveTotals[2].well;
  const totalFortControl = objectiveTotals[1].fort + objectiveTotals[2].fort;

  return {
    matches,
    humanWins,
    undeadWins,
    stalemates,
    humanWinRate: ratio(humanWins, matches),
    undeadWinRate: ratio(undeadWins, matches),
    stalemateRate: ratio(stalemates, matches),
    averageRounds: ratio(totalHalfTurns, matches * 2),
    averageHalfTurns: ratio(totalHalfTurns, matches),
    averageSearchStatesPerTurn: ratio(totalSearchStates, totalHalfTurns),
    averageResponseStatesPerTurn: ratio(totalResponseStates, totalHalfTurns),
    timedOutTurnRate: ratio(totalTimedOutTurns, totalHalfTurns),
    replayFailureRate: ratio(totalReplayFailures, totalHalfTurns),
    commanderDeathGames,
    objectiveControlShare: {
      1: {
        well: ratio(objectiveTotals[1].well, totalWellControl),
        fort: ratio(objectiveTotals[1].fort, totalFortControl),
      },
      2: {
        well: ratio(objectiveTotals[2].well, totalWellControl),
        fort: ratio(objectiveTotals[2].fort, totalFortControl),
      },
    },
    summonsByCard,
    actionCounts,
    terminations,
    matchesDetail: details,
  };
};
