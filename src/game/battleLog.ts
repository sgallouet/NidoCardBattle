import type { Faction, GameState, PlayerId, UnitState } from '../data/types';
import { GAME_ACTION_KINDS, getLegalGameActions, type GameAction } from './actions';
import type { AiPlan } from './ai';
import {
  simulateAiMatch,
  type SimulationActionCounts,
  type SimulationBatchOptions,
  type SimulationMatchResult,
  type SimulationTermination,
} from './simulation';

export const BATTLE_LOG_SCHEMA_VERSION = 1 as const;

type CoordTuple = [q: number, r: number];

export interface CompactPlayerState {
  faction: Faction;
  mana: number;
  hand: string[];
  deckSize: number;
  discardSize: number;
}

export interface CompactUnitState {
  id: string;
  definitionId: string;
  player: PlayerId;
  hp: number;
  at: CoordTuple;
  exhausted?: true;
  moved?: true;
  attacked?: true;
  movementSpent?: number;
  postAttackMoved?: true;
  moveBonus?: number;
  soulLinkTargetId?: string;
  curses?: Array<{ sourcePlayer: PlayerId; remainingTurns: number }>;
}

export interface CompactSiteState {
  id: string;
  type: 'keep' | 'fort' | 'well';
  at: CoordTuple;
  owner: PlayerId | null;
}

export interface CompactBoardState {
  bridges: CoordTuple[];
  scorchedForests: CoordTuple[];
  pendingWells: Array<{
    id: string;
    at: CoordTuple;
    owner: PlayerId;
    remainingTurns: number;
  }>;
  tileEffects: Array<{
    kind: 'graveLock';
    at: CoordTuple;
    sourcePlayer: PlayerId;
    expiresAtTurn: number;
  }>;
}

export interface CompactStateSnapshot {
  turnNumber: number;
  activePlayer: PlayerId;
  players: Record<PlayerId, CompactPlayerState>;
  units: CompactUnitState[];
  sites: CompactSiteState[];
  board: CompactBoardState;
  countdown: { player: PlayerId; checkpoints: number } | null;
  winner: PlayerId | null;
}

export interface StateDelta {
  state?: {
    before: Pick<CompactStateSnapshot, 'turnNumber' | 'activePlayer' | 'countdown' | 'winner'>;
    after: Pick<CompactStateSnapshot, 'turnNumber' | 'activePlayer' | 'countdown' | 'winner'>;
  };
  playersChanged?: Array<{
    player: PlayerId;
    before: CompactPlayerState;
    after: CompactPlayerState;
  }>;
  unitsAdded?: CompactUnitState[];
  unitsRemoved?: CompactUnitState[];
  unitsChanged?: Array<{ before: CompactUnitState; after: CompactUnitState }>;
  sitesAdded?: CompactSiteState[];
  sitesRemoved?: CompactSiteState[];
  sitesChanged?: Array<{ before: CompactSiteState; after: CompactSiteState }>;
  board?: { before: CompactBoardState; after: CompactBoardState };
}

export type LoggedAction = GameAction | { kind: 'endTurn' };

export interface BattleLogStep {
  action: LoggedAction;
  result: { ok: boolean; message: string };
  delta: StateDelta;
}

export interface PlayerTurnSummary {
  mana: number;
  handSize: number;
  unitCount: number;
  totalHp: number;
  commanderHp: number | null;
  wells: number;
  forts: number;
}

export interface BattleStateSummary {
  turnNumber: number;
  activePlayer: PlayerId;
  players: Record<PlayerId, PlayerTurnSummary>;
  countdown: { player: PlayerId; checkpoints: number } | null;
  winner: PlayerId | null;
}

export interface BattleLogTurn {
  halfTurn: number;
  round: number;
  actor: PlayerId;
  faction: Faction;
  plan: Pick<AiPlan, 'score' | 'searchedStates' | 'responseStates' | 'timedOut'> & {
    actionsPlanned: number;
    legalActions: number;
    legalActionsByKind: SimulationActionCounts;
  };
  start: BattleStateSummary;
  steps: BattleLogStep[];
  end?: BattleStateSummary;
}

export interface BattleLog {
  schemaVersion: typeof BATTLE_LOG_SCHEMA_VERSION;
  seed: number;
  firstPlayerFaction: Faction;
  initial: CompactStateSnapshot;
  turns: BattleLogTurn[];
  final: CompactStateSnapshot;
  result: SimulationMatchResult;
}

export interface FactionBattleMetrics {
  turns: number;
  turnsWithoutAction: number;
  idleTurnsWithLegalActions: number;
  legalActionsOffered: number;
  legalActionCounts: SimulationActionCounts;
  idleLegalActionCounts: SimulationActionCounts;
  actionCounts: SimulationActionCounts;
  failedActions: number;
  unitsCreated: number;
  unitsLost: number;
  hpLost: number;
  commanderHpLost: number;
  objectivesCaptured: number;
  manaSpent: number;
  timedOutTurns: number;
  searchedStates: number;
  responseStates: number;
}

export interface BattleLogFinding {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  area: 'ai' | 'rules' | 'simulation';
  evidence: string;
  nextStep: string;
}

export interface BattleLogAnalysis {
  matches: number;
  wins: Record<Faction, number>;
  firstPlayerWins: number;
  terminations: Record<SimulationTermination, number>;
  averageRounds: number;
  factions: Record<Faction, FactionBattleMetrics>;
  findings: BattleLogFinding[];
}

export interface BattleLogReport {
  schemaVersion: typeof BATTLE_LOG_SCHEMA_VERSION;
  logs: BattleLog[];
  analysis: BattleLogAnalysis;
}

const coordTuple = (q: number, r: number): CoordTuple => [q, r];

const compactUnit = (unit: UnitState): CompactUnitState => {
  const compact: CompactUnitState = {
    id: unit.id,
    definitionId: unit.definitionId,
    player: unit.owner,
    hp: unit.hp,
    at: coordTuple(unit.coord.q, unit.coord.r),
  };
  if (unit.exhausted) compact.exhausted = true;
  if (unit.moved) compact.moved = true;
  if (unit.attacked) compact.attacked = true;
  if ((unit.movementSpent ?? 0) > 0) compact.movementSpent = unit.movementSpent;
  if (unit.postAttackMoved) compact.postAttackMoved = true;
  if ((unit.moveBonus ?? 0) > 0) compact.moveBonus = unit.moveBonus;
  if (unit.soulLinkTargetId) compact.soulLinkTargetId = unit.soulLinkTargetId;
  if ((unit.curses?.length ?? 0) > 0) compact.curses = unit.curses?.map((curse) => ({ ...curse }));
  return compact;
};

export const snapshotBattleState = (state: GameState): CompactStateSnapshot => ({
  turnNumber: state.turnNumber,
  activePlayer: state.currentPlayer,
  players: {
    1: {
      faction: state.players[1].faction,
      mana: state.players[1].mana,
      hand: [...state.players[1].hand],
      deckSize: state.players[1].deck.length,
      discardSize: state.players[1].discard.length,
    },
    2: {
      faction: state.players[2].faction,
      mana: state.players[2].mana,
      hand: [...state.players[2].hand],
      deckSize: state.players[2].deck.length,
      discardSize: state.players[2].discard.length,
    },
  },
  units: state.units.map(compactUnit).sort((a, b) => a.id.localeCompare(b.id)),
  sites: state.sites.map((site) => ({
    id: site.id,
    type: site.type,
    at: coordTuple(site.coord.q, site.coord.r),
    owner: site.owner,
  })).sort((a, b) => a.id.localeCompare(b.id)),
  board: {
    bridges: state.builtBridges.map((coord) => coordTuple(coord.q, coord.r)).sort(),
    scorchedForests: state.scorchedForests.map((coord) => coordTuple(coord.q, coord.r)).sort(),
    pendingWells: state.pendingManaWells.map((well) => ({
      id: well.id,
      at: coordTuple(well.coord.q, well.coord.r),
      owner: well.owner,
      remainingTurns: well.remainingTurns,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    tileEffects: state.tileEffects.map((effect) => ({
      kind: effect.kind,
      at: coordTuple(effect.coord.q, effect.coord.r),
      sourcePlayer: effect.sourcePlayer,
      expiresAtTurn: effect.expiresAtTurn,
    })).sort((a, b) => a.at.join(',').localeCompare(b.at.join(','))),
  },
  countdown: state.countdown ? { ...state.countdown } : null,
  winner: state.winner,
});

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const changedById = <T extends { id: string }>(before: T[], after: T[]) => {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  return {
    added: after.filter((item) => !beforeById.has(item.id)),
    removed: before.filter((item) => !afterById.has(item.id)),
    changed: before.flatMap((item) => {
      const next = afterById.get(item.id);
      return next && !same(item, next) ? [{ before: item, after: next }] : [];
    }),
  };
};

const stateHeader = (snapshot: CompactStateSnapshot) => ({
  turnNumber: snapshot.turnNumber,
  activePlayer: snapshot.activePlayer,
  countdown: snapshot.countdown,
  winner: snapshot.winner,
});

export const diffBattleStates = (
  before: CompactStateSnapshot,
  after: CompactStateSnapshot,
): StateDelta => {
  const delta: StateDelta = {};
  const beforeHeader = stateHeader(before);
  const afterHeader = stateHeader(after);
  if (!same(beforeHeader, afterHeader)) delta.state = { before: beforeHeader, after: afterHeader };

  const playersChanged = ([1, 2] as const).flatMap((player) =>
    same(before.players[player], after.players[player])
      ? []
      : [{ player, before: before.players[player], after: after.players[player] }]);
  if (playersChanged.length > 0) delta.playersChanged = playersChanged;

  const units = changedById(before.units, after.units);
  if (units.added.length > 0) delta.unitsAdded = units.added;
  if (units.removed.length > 0) delta.unitsRemoved = units.removed;
  if (units.changed.length > 0) delta.unitsChanged = units.changed;

  const sites = changedById(before.sites, after.sites);
  if (sites.added.length > 0) delta.sitesAdded = sites.added;
  if (sites.removed.length > 0) delta.sitesRemoved = sites.removed;
  if (sites.changed.length > 0) delta.sitesChanged = sites.changed;
  if (!same(before.board, after.board)) delta.board = { before: before.board, after: after.board };
  return delta;
};

const summarizePlayer = (snapshot: CompactStateSnapshot, player: PlayerId): PlayerTurnSummary => {
  const units = snapshot.units.filter((unit) => unit.player === player);
  return {
    mana: snapshot.players[player].mana,
    handSize: snapshot.players[player].hand.length,
    unitCount: units.length,
    totalHp: units.reduce((sum, unit) => sum + unit.hp, 0),
    commanderHp: units.find((unit) => unit.definitionId === 'commander')?.hp ?? null,
    wells: snapshot.sites.filter((site) => site.owner === player && site.type === 'well').length,
    forts: snapshot.sites.filter((site) => site.owner === player && site.type === 'fort').length,
  };
};

const summarizeBattleState = (snapshot: CompactStateSnapshot): BattleStateSummary => ({
  turnNumber: snapshot.turnNumber,
  activePlayer: snapshot.activePlayer,
  players: {
    1: summarizePlayer(snapshot, 1),
    2: summarizePlayer(snapshot, 2),
  },
  countdown: snapshot.countdown,
  winner: snapshot.winner,
});

const cloneAction = (action: GameAction): GameAction =>
  JSON.parse(JSON.stringify(action)) as GameAction;

export const generateBattleLog = (seed: number, options: SimulationBatchOptions = {}): BattleLog => {
  let initial: CompactStateSnapshot | null = null;
  let previous: CompactStateSnapshot | null = null;
  let activeTurn: BattleLogTurn | null = null;
  const turns: BattleLogTurn[] = [];

  const appendStep = (state: GameState, action: LoggedAction, result: { ok: boolean; message: string }): void => {
    if (!activeTurn || !previous) throw new Error('Battle log observer received a step before a turn started.');
    const next = snapshotBattleState(state);
    activeTurn.steps.push({ action, result: { ...result }, delta: diffBattleStates(previous, next) });
    previous = next;
  };

  const result = simulateAiMatch(seed, {
    maxHalfTurns: options.maxHalfTurns,
    repetitionLimit: options.repetitionLimit,
    aiOptions: options.aiOptions,
    firstPlayerFaction: options.firstPlayerFaction,
  }, {
    onMatchStarted: (state) => {
      initial = snapshotBattleState(state);
      previous = initial;
    },
    onTurnPlanned: ({ halfTurn, actor, plan, state }) => {
      if (activeTurn) throw new Error('Battle log observer started a turn before the previous turn ended.');
      const start = snapshotBattleState(state);
      const legalActions = getLegalGameActions(state, actor);
      const legalActionsByKind = emptyActionCounts();
      for (const action of legalActions) legalActionsByKind[action.kind] += 1;
      previous = start;
      activeTurn = {
        halfTurn,
        round: Math.ceil(state.turnNumber / 2),
        actor,
        faction: state.players[actor].faction,
        plan: {
          score: plan.score,
          searchedStates: plan.searchedStates,
          responseStates: plan.responseStates,
          timedOut: plan.timedOut,
          actionsPlanned: plan.actions.length,
          legalActions: legalActions.length,
          legalActionsByKind,
        },
        start: summarizeBattleState(start),
        steps: [],
      };
    },
    onActionResolved: ({ action, result: actionResult, state }) => {
      appendStep(state, cloneAction(action), actionResult);
    },
    onTurnEnded: ({ result: turnResult, state }) => {
      appendStep(state, { kind: 'endTurn' }, turnResult);
      if (!activeTurn || !previous) throw new Error('Battle log observer ended a turn before it started.');
      activeTurn.end = summarizeBattleState(previous);
      turns.push(activeTurn);
      activeTurn = null;
    },
  });

  if (!initial || !previous) throw new Error('Battle log observer did not receive the match state.');
  const unfinishedTurn = activeTurn as BattleLogTurn | null;
  if (unfinishedTurn) {
    unfinishedTurn.end = summarizeBattleState(previous);
    turns.push(unfinishedTurn);
  }

  return {
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    seed,
    firstPlayerFaction: result.firstPlayerFaction,
    initial,
    turns,
    final: previous,
    result,
  };
};

const emptyActionCounts = (): SimulationActionCounts =>
  Object.fromEntries(GAME_ACTION_KINDS.map((kind) => [kind, 0])) as SimulationActionCounts;

const emptyFactionMetrics = (): FactionBattleMetrics => ({
  turns: 0,
  turnsWithoutAction: 0,
  idleTurnsWithLegalActions: 0,
  legalActionsOffered: 0,
  legalActionCounts: emptyActionCounts(),
  idleLegalActionCounts: emptyActionCounts(),
  actionCounts: emptyActionCounts(),
  failedActions: 0,
  unitsCreated: 0,
  unitsLost: 0,
  hpLost: 0,
  commanderHpLost: 0,
  objectivesCaptured: 0,
  manaSpent: 0,
  timedOutTurns: 0,
  searchedStates: 0,
  responseStates: 0,
});

const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;

export const analyzeBattleLogs = (logs: BattleLog[]): BattleLogAnalysis => {
  const factions: Record<Faction, FactionBattleMetrics> = {
    human: emptyFactionMetrics(),
    undead: emptyFactionMetrics(),
  };
  const wins: Record<Faction, number> = { human: 0, undead: 0 };
  const terminations: Record<SimulationTermination, number> = {
    victory: 0,
    repetition: 0,
    'turn-limit': 0,
  };
  let totalRounds = 0;
  let firstPlayerWins = 0;

  for (const log of logs) {
    if (log.result.winnerFaction) wins[log.result.winnerFaction] += 1;
    if (log.result.winner === 1) firstPlayerWins += 1;
    terminations[log.result.termination] += 1;
    totalRounds += log.result.rounds;

    for (const turn of log.turns) {
      const actorMetrics = factions[turn.faction];
      actorMetrics.turns += 1;
      actorMetrics.searchedStates += turn.plan.searchedStates;
      actorMetrics.responseStates += turn.plan.responseStates;
      actorMetrics.legalActionsOffered += turn.plan.legalActions;
      for (const kind of GAME_ACTION_KINDS) {
        actorMetrics.legalActionCounts[kind] += turn.plan.legalActionsByKind[kind];
      }
      if (turn.plan.timedOut) actorMetrics.timedOutTurns += 1;
      const gameplaySteps = turn.steps.filter((step) => step.action.kind !== 'endTurn');
      if (gameplaySteps.length === 0) {
        actorMetrics.turnsWithoutAction += 1;
        if (turn.plan.legalActions > 0) {
          actorMetrics.idleTurnsWithLegalActions += 1;
          for (const kind of GAME_ACTION_KINDS) {
            actorMetrics.idleLegalActionCounts[kind] += turn.plan.legalActionsByKind[kind];
          }
        }
      }

      for (const step of turn.steps) {
        if (!step.result.ok) actorMetrics.failedActions += 1;
        if (step.action.kind !== 'endTurn') actorMetrics.actionCounts[step.action.kind] += 1;

        for (const added of step.delta.unitsAdded ?? []) {
          factions[log.result.playerFactions[added.player]].unitsCreated += 1;
        }
        for (const removed of step.delta.unitsRemoved ?? []) {
          const metrics = factions[log.result.playerFactions[removed.player]];
          metrics.unitsLost += 1;
          metrics.hpLost += removed.hp;
          if (removed.definitionId === 'commander') metrics.commanderHpLost += removed.hp;
        }
        for (const change of step.delta.unitsChanged ?? []) {
          const lostHp = Math.max(0, change.before.hp - change.after.hp);
          if (lostHp === 0) continue;
          const metrics = factions[log.result.playerFactions[change.before.player]];
          metrics.hpLost += lostHp;
          if (change.before.definitionId === 'commander') metrics.commanderHpLost += lostHp;
        }
        for (const change of step.delta.sitesChanged ?? []) {
          if (change.after.owner === null || change.before.owner === change.after.owner) continue;
          factions[log.result.playerFactions[change.after.owner]].objectivesCaptured += 1;
        }
        if (step.action.kind !== 'endTurn') {
          const playerChange = step.delta.playersChanged?.find((change) => change.player === turn.actor);
          if (playerChange) {
            actorMetrics.manaSpent += Math.max(0, playerChange.before.mana - playerChange.after.mana);
          }
        }
      }
    }
  }

  const findings: BattleLogFinding[] = [];
  const totalTurns = factions.human.turns + factions.undead.turns;
  const totalFailures = factions.human.failedActions + factions.undead.failedActions;
  const totalTimeouts = factions.human.timedOutTurns + factions.undead.timedOutTurns;
  const nonVictories = terminations.repetition + terminations['turn-limit'];

  if (totalFailures > 0) findings.push({
    code: 'PLAN_REPLAY_FAILURE',
    severity: 'critical',
    area: 'simulation',
    evidence: `${totalFailures} planned actions failed during replay.`,
    nextStep: 'Fix action-plan replay correctness before using these matches for balance decisions.',
  });
  if (totalTimeouts > 0) findings.push({
    code: 'SEARCH_BUDGET_EXHAUSTED',
    severity: 'warning',
    area: 'ai',
    evidence: `${totalTimeouts} of ${totalTurns} turns exhausted the configured search budget.`,
    nextStep: 'Separate node-limit saturation from wall-clock expiry, then improve pruning or action ordering before increasing the budget.',
  });
  if (nonVictories > 0) findings.push({
    code: 'MATCHES_WITHOUT_VICTORY',
    severity: nonVictories === logs.length ? 'critical' : 'warning',
    area: 'rules',
    evidence: `${nonVictories} of ${logs.length} matches ended without a victory.`,
    nextStep: 'Inspect the final turns for repeated safe movement, blocked Commander pressure, and whether victory pacing needs adjustment.',
  });
  for (const faction of ['human', 'undead'] as const) {
    const metrics = factions[faction];
    const idleRate = ratio(metrics.turnsWithoutAction, metrics.turns);
    if (metrics.turns >= 6 && idleRate >= 0.15) findings.push({
      code: `IDLE_TURNS_${faction.toUpperCase()}`,
      severity: 'warning',
      area: 'ai',
      evidence: `${faction} took no gameplay action on ${metrics.turnsWithoutAction} of ${metrics.turns} turns (${(idleRate * 100).toFixed(1)}%); ${metrics.idleTurnsWithLegalActions} of those turns still offered legal actions.`,
      nextStep: metrics.idleTurnsWithLegalActions > 0
        ? 'Inspect the available action mix on those turns; the evaluator or bounded search is preferring a pass over every legal continuation.'
        : 'Inspect resource, spawn, and mobility constraints that leave the faction with no legal action.',
    });
    const idleLegalTotal = GAME_ACTION_KINDS.reduce(
      (sum, kind) => sum + metrics.idleLegalActionCounts[kind],
      0,
    );
    const idleTacticShare = ratio(metrics.idleLegalActionCounts.tactic, idleLegalTotal);
    if (metrics.idleTurnsWithLegalActions >= 3 && idleLegalTotal >= 100 && idleTacticShare >= 0.6) findings.push({
      code: `TACTIC_BRANCHING_ON_IDLE_TURNS_${faction.toUpperCase()}`,
      severity: 'warning',
      area: 'ai',
      evidence: `${(idleTacticShare * 100).toFixed(1)}% of ${idleLegalTotal} legal choices on ${faction}'s idle turns were tactic targets.`,
      nextStep: 'Prune or rank tile-target variants per card before the global action cap so movement, summoning, attacks, and abilities remain represented in search.',
    });
    if (metrics.turns >= 8 && metrics.actionCounts.attack === 0) findings.push({
      code: `NO_ATTACKS_${faction.toUpperCase()}`,
      severity: 'critical',
      area: 'ai',
      evidence: `${faction} made no attacks across ${metrics.turns} turns.`,
      nextStep: 'Inspect threat approach behavior and the positional score; the planner may prefer reversible movement over committing to combat.',
    });
  }
  if (logs.length >= 6) {
    const decisiveMatches = wins.human + wins.undead;
    const factionGap = Math.abs(ratio(wins.human, decisiveMatches) - ratio(wins.undead, decisiveMatches));
    if (decisiveMatches >= 4 && factionGap >= 0.3) findings.push({
      code: 'FACTION_WIN_GAP',
      severity: 'warning',
      area: 'rules',
      evidence: `Human won ${wins.human} and Undead won ${wins.undead} of ${decisiveMatches} decisive matches.`,
      nextStep: 'Compare unit efficiency, objective control, and first-player splits before changing faction stats or card costs.',
    });
    const firstPlayerRate = ratio(firstPlayerWins, decisiveMatches);
    if (decisiveMatches >= 4 && (firstPlayerRate <= 0.3 || firstPlayerRate >= 0.7)) findings.push({
      code: 'FIRST_PLAYER_SKEW',
      severity: 'warning',
      area: 'rules',
      evidence: `Player 1 won ${(firstPlayerRate * 100).toFixed(1)}% of decisive matches.`,
      nextStep: 'Separate opening-tempo and map-side effects with paired seeds before changing faction balance.',
    });
  }
  const averageRounds = ratio(totalRounds, logs.length);
  if (logs.length > 0 && averageRounds >= 40) findings.push({
    code: 'LONG_MATCHES',
    severity: 'info',
    area: 'rules',
    evidence: `Matches averaged ${averageRounds.toFixed(1)} rounds.`,
    nextStep: 'Review the action timeline against SCM4 and verify whether travel, combat lethality, or the victory countdown is causing the pacing.',
  });

  return {
    matches: logs.length,
    wins,
    firstPlayerWins,
    terminations,
    averageRounds,
    factions,
    findings,
  };
};

export const generateBattleLogReport = (options: SimulationBatchOptions = {}): BattleLogReport => {
  const matches = Math.max(1, Math.floor(options.matches ?? 1));
  const seed = Math.floor(options.seed ?? 1);
  const logs = Array.from({ length: matches }, (_, index) => {
    const firstPlayerFaction: Faction = options.alternateFirstPlayer === false
      ? options.firstPlayerFaction ?? 'human'
      : index % 2 === 0 ? 'human' : 'undead';
    return generateBattleLog(seed + index * 0x9e3779b1, { ...options, firstPlayerFaction });
  });
  return {
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    logs,
    analysis: analyzeBattleLogs(logs),
  };
};
