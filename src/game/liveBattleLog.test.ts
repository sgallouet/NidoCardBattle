import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { planSmartAiTurn } from './ai';
import { attackUnit, createGameState } from './engine';
import { LiveBattleLogRecorder } from './liveBattleLog';

const fixedRandom = () => 0.25;

const makeUnit = (
  id: string,
  definitionId: UnitDefinitionId,
  owner: PlayerId,
  coord: Coord,
  overrides: Partial<UnitState> = {},
): UnitState => ({
  id,
  definitionId,
  owner,
  coord,
  hp: UNIT_DEFINITIONS[definitionId].maxHp,
  exhausted: false,
  moved: false,
  attacked: false,
  ...overrides,
});

describe('live battle log', () => {
  it('exports processable deltas together with AI plans and executed actions', () => {
    const state: GameState = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].hand = [];
    state.players[2].deck = [];
    state.players[2].discard = [];
    state.players[2].mana = 0;
    state.sites = [];
    state.units = [
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
      makeUnit('undead-attacker', 'skeletalInfantry', 2, { q: 4, r: 4 }),
      makeUnit('final-human', 'longbowRanger', 1, { q: 5, r: 4 }, { hp: 1 }),
    ];
    const recorder = new LiveBattleLogRecorder(state, '2026-08-23T00:00:00.000Z');
    const plan = planSmartAiTurn(state, {
      beamWidth: 2,
      maxDepth: 2,
      strategyMaxNodes: 40,
      strategyMaxPlanningMs: 5_000,
      candidatePlans: 1,
      responseBeamWidth: 1,
      responseDepth: 1,
      tacticalMaxNodes: 10,
      tacticalMaxPlanningMs: 5_000,
    });
    recorder.recordAiPlan(state, plan);
    const action = { kind: 'attack', unitId: 'undead-attacker', targetId: 'final-human' } as const;
    recorder.beginAiAction(state);
    expect(recorder.actionInProgress).toBe(true);
    const result = attackUnit(state, action.unitId, action.targetId);
    recorder.recordState(state, 'Intermediate animation render.');
    recorder.recordAiAction(state, 2, action, result);
    expect(recorder.actionInProgress).toBe(false);

    const log = recorder.createLog(state, '2026-08-23T00:01:00.000Z');

    expect(log).toMatchObject({
      schemaVersion: 2,
      stateSchemaVersion: 2,
      source: 'live-human-vs-ai',
      initialTurnNumber: 1,
      historyComplete: true,
      resumeCount: 0,
      resumedAt: [],
      completed: true,
      winner: 2,
      completedAt: '2026-08-23T00:01:00.000Z',
    });
    expect(log.events.map((event) => event.kind)).toEqual(['ai-plan', 'ai-action']);
    expect(log.events[0]).toMatchObject({ kind: 'ai-plan', actor: 2, plan: { actions: expect.any(Array) } });
    expect(log.events[1]).toMatchObject({
      kind: 'ai-action',
      actor: 2,
      action,
      result: { ok: true },
      delta: {
        unitsRemoved: [{ id: 'final-human' }],
        state: { after: { winner: 2 } },
      },
    });
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });

  it('skips render-only events that do not change the game state', () => {
    const state = createGameState(fixedRandom);
    const recorder = new LiveBattleLogRecorder(state);

    recorder.recordState(state, 'Selection changed.');

    expect(recorder.createLog(state).events).toEqual([]);
    expect(recorder.revision).toBe(0);
  });

  it('continues one complete match history after a saved-game resume', () => {
    const state = createGameState(fixedRandom);
    const recorder = new LiveBattleLogRecorder(state, '2026-08-23T00:00:00.000Z');
    state.units[0].coord = { q: 3, r: 8 };
    recorder.recordState(state, 'First session move.');
    const draft = JSON.parse(JSON.stringify(recorder.createLog(state))) as ReturnType<typeof recorder.createLog>;

    const resumed = LiveBattleLogRecorder.resume(state, draft, '2026-08-23T00:02:00.000Z');
    state.units[0].coord = { q: 4, r: 8 };
    resumed.recordState(state, 'Second session move.');
    const log = resumed.createLog(state);

    expect(log.initial.turnNumber).toBe(1);
    expect(log.events).toHaveLength(2);
    expect(log.historyComplete).toBe(true);
    expect(log.resumeCount).toBe(1);
    expect(log.resumedAt).toEqual(['2026-08-23T00:02:00.000Z']);
  });

  it('marks a recorder started during an existing match as incomplete', () => {
    const state = createGameState(fixedRandom);
    state.turnNumber = 23;

    const log = new LiveBattleLogRecorder(state).createLog(state);

    expect(log.initialTurnNumber).toBe(23);
    expect(log.historyComplete).toBe(false);
  });

  it('rejects a saved log whose final snapshot does not match the saved game', () => {
    const state = createGameState(fixedRandom);
    const draft = new LiveBattleLogRecorder(state).createLog(state);
    state.turnNumber = 2;

    expect(() => LiveBattleLogRecorder.resume(state, draft)).toThrow(/out of sync/);
  });
});
