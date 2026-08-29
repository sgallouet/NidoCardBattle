import type { ActionResult, GameState, PlayerId } from '../data/types';
import type { AiAction, AiPlan } from './ai';
import {
  BATTLE_LOG_SCHEMA_VERSION,
  diffBattleStates,
  snapshotBattleState,
  type CompactStateSnapshot,
  type LoggedAction,
  type StateDelta,
} from './battleLog';

export const LIVE_BATTLE_LOG_SCHEMA_VERSION = 2 as const;

interface LiveBattleEventBase {
  sequence: number;
  turnNumber: number;
  actor: PlayerId;
}

export interface LiveBattleStateEvent extends LiveBattleEventBase {
  kind: 'state';
  message: string;
  delta: StateDelta;
}

export interface LiveBattleAiPlanEvent extends LiveBattleEventBase {
  kind: 'ai-plan';
  plan: AiPlan;
}

export interface LiveBattleAiActionEvent extends LiveBattleEventBase {
  kind: 'ai-action';
  action: LoggedAction;
  result: ActionResult;
  delta: StateDelta;
}

export type LiveBattleEvent = LiveBattleStateEvent | LiveBattleAiPlanEvent | LiveBattleAiActionEvent;

export interface LiveBattleLog {
  schemaVersion: typeof LIVE_BATTLE_LOG_SCHEMA_VERSION;
  stateSchemaVersion: typeof BATTLE_LOG_SCHEMA_VERSION;
  source: 'live-human-vs-ai';
  startedAt: string;
  initialTurnNumber: number;
  historyComplete: boolean;
  resumeCount: number;
  resumedAt: string[];
  completedAt: string | null;
  completed: boolean;
  winner: PlayerId | null;
  initial: CompactStateSnapshot;
  events: LiveBattleEvent[];
  final: CompactStateSnapshot;
}

const clone = <T>(value: T): T => structuredClone(value);
const snapshotsMatch = (left: CompactStateSnapshot, right: CompactStateSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class LiveBattleLogRecorder {
  private startedAt: string;
  private initialTurnNumber: number;
  private historyComplete: boolean;
  private resumeCount = 0;
  private resumedAt: string[] = [];
  private initial: CompactStateSnapshot;
  private previous: CompactStateSnapshot;
  private aiActionStart: CompactStateSnapshot | null = null;
  private events: LiveBattleEvent[] = [];

  constructor(initialState: GameState, startedAt = new Date().toISOString()) {
    this.startedAt = startedAt;
    this.initial = snapshotBattleState(initialState);
    this.initialTurnNumber = this.initial.turnNumber;
    this.historyComplete = this.initialTurnNumber === 1;
    this.previous = this.initial;
  }

  get actionInProgress(): boolean {
    return this.aiActionStart !== null;
  }

  get revision(): number {
    return this.events.length;
  }

  static resume(initialState: GameState, draft: LiveBattleLog, resumedAt = new Date().toISOString()): LiveBattleLogRecorder {
    if (draft.completed || draft.winner !== null || draft.completedAt !== null) {
      throw new Error('Cannot resume a completed live battle log.');
    }
    const current = snapshotBattleState(initialState);
    if (!snapshotsMatch(draft.final, current)) {
      throw new Error('Saved match and live battle log are out of sync.');
    }
    const recorder = new LiveBattleLogRecorder(initialState, draft.startedAt);
    recorder.initialTurnNumber = draft.initialTurnNumber;
    recorder.historyComplete = draft.historyComplete;
    recorder.resumeCount = draft.resumeCount + 1;
    recorder.resumedAt = [...draft.resumedAt, resumedAt];
    recorder.initial = clone(draft.initial);
    recorder.previous = clone(draft.final);
    recorder.events = clone(draft.events);
    return recorder;
  }

  recordState(state: GameState, message: string): void {
    if (this.aiActionStart) return;
    const next = snapshotBattleState(state);
    const delta = diffBattleStates(this.previous, next);
    if (Object.keys(delta).length === 0) return;
    this.events.push({
      kind: 'state',
      sequence: this.events.length + 1,
      turnNumber: this.previous.turnNumber,
      actor: this.previous.activePlayer,
      message,
      delta,
    });
    this.previous = next;
  }

  beginAiAction(state: GameState): void {
    if (this.aiActionStart) throw new Error('Cannot begin an AI action while another AI action is being recorded.');
    this.aiActionStart = snapshotBattleState(state);
  }

  recordAiPlan(state: GameState, plan: AiPlan): void {
    this.events.push({
      kind: 'ai-plan',
      sequence: this.events.length + 1,
      turnNumber: state.turnNumber,
      actor: state.currentPlayer,
      plan: clone(plan),
    });
  }

  recordAiAction(state: GameState, actor: PlayerId, action: AiAction | { kind: 'endTurn' }, result: ActionResult): void {
    if (!this.aiActionStart) throw new Error('Cannot record an AI action that was not started.');
    const next = snapshotBattleState(state);
    this.events.push({
      kind: 'ai-action',
      sequence: this.events.length + 1,
      turnNumber: this.aiActionStart.turnNumber,
      actor,
      action: clone(action),
      result: clone(result),
      delta: diffBattleStates(this.aiActionStart, next),
    });
    this.previous = next;
    this.aiActionStart = null;
  }

  createLog(state: GameState, completedAt = new Date().toISOString()): LiveBattleLog {
    const final = snapshotBattleState(state);
    return {
      schemaVersion: LIVE_BATTLE_LOG_SCHEMA_VERSION,
      stateSchemaVersion: BATTLE_LOG_SCHEMA_VERSION,
      source: 'live-human-vs-ai',
      startedAt: this.startedAt,
      initialTurnNumber: this.initialTurnNumber,
      historyComplete: this.historyComplete,
      resumeCount: this.resumeCount,
      resumedAt: clone(this.resumedAt),
      completedAt: final.winner ? completedAt : null,
      completed: final.winner !== null,
      winner: final.winner,
      initial: clone(this.initial),
      events: clone(this.events),
      final,
    };
  }
}

export const downloadLiveBattleLog = (log: LiveBattleLog): void => {
  if (!log.completed || !log.winner) throw new Error('A battle log can only be downloaded after victory.');
  const timestamp = log.completedAt?.replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z') ?? 'completed';
  const fileName = `nido-battle-${timestamp}-player-${log.winner}-wins.json`;
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
