import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  COMMON_AI_OPTIONS,
  buildThreatMap,
  generateLegalAiActions,
  planSmartAiTurn,
  runSmartAiTurn,
  selectCandidateActions,
} from './ai';
import { evaluateStrategicPosition } from './aiEvaluation';
import { coordKey, createGameState, endTurn, hexDistance } from './engine';

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

const minimalAiTurnState = (): GameState => {
  const state = createGameState(fixedRandom);
  state.currentPlayer = 2;
  state.players[2].hand = [];
  state.players[2].deck = [];
  state.players[2].discard = [];
  state.players[2].mana = 0;
  state.sites = [];
  state.units = [
    makeUnit('human-commander', 'commander', 1, { q: 2, r: 9 }),
    makeUnit('undead-commander', 'commander', 2, { q: 15, r: 3 }),
  ];
  return state;
};

const deterministicSearch = {
  beamWidth: 4,
  maxDepth: 3,
  strategyMaxNodes: 700,
  strategyMaxPlanningMs: 5_000,
  candidatePlans: 2,
  responseBeamWidth: 2,
  responseDepth: 2,
  tacticalMaxNodes: 120,
  tacticalMaxPlanningMs: 5_000,
} as const;

describe('smart enemy AI', () => {
  it('takes Player 2 turn and returns control to Player 1', () => {
    const state = minimalAiTurnState();

    const result = runSmartAiTurn(state, fixedRandom, deterministicSearch);

    expect(result.endedTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.winner).toBe(null);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.diagnostics.strategy.nodes).toBeGreaterThan(0);
  });

  it('prioritizes and kills an adjacent Human Commander', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 4, r: 4 }, { hp: 1 }),
      makeUnit('undead-attacker', 'skeletalInfantry', 2, { q: 3, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
    ];

    runSmartAiTurn(state, fixedRandom, deterministicSearch);

    expect(state.units.some((unit) => unit.id === 'human-commander')).toBe(false);
    expect(state.winner).toBe(2);
    expect(state.countdown).toBe(null);
    expect(state.currentPlayer).toBe(2);
  });

  it('can finish the final Commander survival checkpoint and win', () => {
    const state = minimalAiTurnState();
    state.units = [makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 })];
    state.countdown = { player: 2, checkpoints: 2 };

    const result = runSmartAiTurn(state, fixedRandom, deterministicSearch);

    expect(result.endedTurn).toBe(true);
    expect(state.winner).toBe(2);
    expect(state.countdown?.checkpoints).toBe(3);
  });

  it('builds a next-turn threat map from movement plus attack range', () => {
    const state = minimalAiTurnState();
    state.units.push(makeUnit('human-ranger', 'longbowRanger', 1, { q: 9, r: 6 }));
    const threatened = { q: 13, r: 6 };

    const threatMap = buildThreatMap(state, 1);

    expect(threatMap.get(coordKey(threatened))).toBeGreaterThan(0);
  });

  it('searches a complete move then attack sequence to kill the Commander', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 4, r: 4 }, { hp: 2 }),
      makeUnit('undead-attacker', 'skeletalInfantry', 2, { q: 2, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const plan = planSmartAiTurn(state, { ...deterministicSearch, beamWidth: 12, maxDepth: 4 });

    expect(plan.actions.some((action) => action.kind === 'move' && action.unitId === 'undead-attacker')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'attack' && action.targetId === 'human-commander')).toBe(true);
    expect(plan.diagnostics.strategy.nodes).toBeGreaterThan(1);
  });

  it('pursues a wounded Commander when it cannot attack this turn', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 9, r: 4 }, { hp: 3 }),
      makeUnit('undead-pursuer', 'graveKnight', 2, { q: 3, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const plan = planSmartAiTurn(state, { ...deterministicSearch, beamWidth: 10, maxDepth: 3 });
    const pursuit = plan.actions.find((action) =>
      action.kind === 'move' && action.unitId === 'undead-pursuer');

    expect(pursuit?.kind).toBe('move');
    if (pursuit?.kind !== 'move') throw new Error('Expected a pursuit move.');
    expect(hexDistance(pursuit.destination, { q: 9, r: 4 })).toBeLessThan(
      hexDistance({ q: 3, r: 4 }, { q: 9, r: 4 }),
    );
  });

  it('advances units instead of spending its whole opening turn on summons', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);

    const plan = planSmartAiTurn(state, { ...deterministicSearch, maxDepth: 5 });

    expect(plan.actions.some((action) => action.kind === 'move' || action.kind === 'attack')).toBe(true);
    expect(plan.actions.every((action) => action.kind === 'summon')).toBe(false);
  });

  it('includes Banshee Displace combinations in its legal action search', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 8, r: 5 }),
      makeUnit('human-guard', 'royalGuard', 1, { q: 7, r: 5 }),
      makeUnit('undead-banshee', 'banshee', 2, { q: 6, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const actions = generateLegalAiActions(state);

    expect(actions.some((action) => action.kind === 'displace' && action.targetId === 'human-guard')).toBe(true);
  });

  it('retains UNT3 in the AI ability action family', () => {
    const state = minimalAiTurnState();
    state.units.push(makeUnit('undead-invoker', 'necromancer', 2, { q: 8, r: 5 }));

    const selection = selectCandidateActions(state, 2, false);

    expect(selection.stats.legalByKind.invoke).toBeGreaterThan(0);
    expect(selection.stats.retainedByKind.invoke).toBeGreaterThan(0);
    expect(selection.actions.some((action) => action.kind === 'invoke' && action.unitId === 'undead-invoker')).toBe(true);
  });

  it('runs a shallow visible-board Human response search', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.currentPlayer).toBe(2);

    const plan = planSmartAiTurn(state, deterministicSearch);

    expect(plan.diagnostics.tactical.nodes).toBeGreaterThan(0);
    expect(Number.isFinite(plan.strategic.outlook)).toBe(true);
    expect(['forced-win', 'safe', 'unsafe', 'forced-loss']).toContain(plan.tactical.tier);
  });

  it('does not change its plan when only the hidden Human hand changes', () => {
    const first = minimalAiTurnState();
    const second = minimalAiTurnState();
    first.players[1].hand = ['longbowRanger'];
    second.players[1].hand = ['silverwingCavalry', 'lightMage', 'royalGuard', 'longbowRanger'];

    const firstPlan = planSmartAiTurn(first, deterministicSearch);
    const secondPlan = planSmartAiTurn(second, deterministicSearch);

    expect(secondPlan.actions).toEqual(firstPlan.actions);
    expect(secondPlan.strategic).toEqual(firstPlan.strategic);
  });

  it('respects a tiny node budget and still completes the enemy turn', () => {
    const state = minimalAiTurnState();
    const result = runSmartAiTurn(state, fixedRandom, {
      ...COMMON_AI_OPTIONS,
      strategyMaxNodes: 20,
      strategyMaxPlanningMs: 5_000,
      tacticalMaxNodes: 10,
      tacticalMaxPlanningMs: 5_000,
    });

    expect(result.diagnostics.strategy.nodes).toBeLessThanOrEqual(20);
    expect(result.diagnostics.strategy.stopReason).toBe('node-limit');
    expect(result.diagnostics.tactical.nodes).toBeLessThanOrEqual(10);
    expect(result.diagnostics.tactical.stopReason).toBe('node-limit');
    expect(result.endedTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });

  it('preserves action-family diversity when one tactic exposes over 200 tile targets', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);
    state.players[2].mana = 20;
    state.players[2].hand = ['graveLock', 'buildBridge', 'skeletalInfantry'];
    state.units.push(
      makeUnit('human-target', 'royalGuard', 1, { q: 14, r: 3 }),
      makeUnit('undead-banshee', 'banshee', 2, { q: 13, r: 3 }),
    );

    const selection = selectCandidateActions(state, 2, true);

    expect(selection.stats.legalByKind.tactic).toBeGreaterThan(200);
    expect(selection.stats.retainedByKind.tactic).toBeLessThanOrEqual(16);
    expect(selection.stats.retainedByKind.move).toBeGreaterThan(0);
    expect(selection.stats.retainedByKind.attack).toBeGreaterThan(0);
    expect(selection.stats.retainedByKind.displace).toBeGreaterThan(0);
    expect(selection.stats.retainedByKind.summon).toBeGreaterThan(0);
    expect(selection.actions.length).toBeLessThanOrEqual(72);

    const plan = planSmartAiTurn(state, {
      ...deterministicSearch,
      strategyMaxNodes: 80,
      tacticalMaxNodes: 20,
    });
    expect(plan.diagnostics.strategy.legalByKind.tactic).toBeGreaterThan(200);
    expect(plan.diagnostics.strategy.retainedByKind.move).toBeGreaterThan(0);
    expect(plan.diagnostics.strategy.retainedByKind.attack).toBeGreaterThan(0);
    expect(plan.diagnostics.strategy.retainedByKind.displace).toBeGreaterThan(0);
    expect(plan.diagnostics.strategy.retainedByKind.summon).toBeGreaterThan(0);
  });

  it('gates strategic gains behind avoiding a visible Commander kill', () => {
    const state = minimalAiTurnState();
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 14, r: 9 }),
      makeUnit('human-threat', 'skeletalInfantry', 1, { q: 5, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 6, r: 5 }, { hp: 2 }),
      makeUnit('undead-defender', 'graveKnight', 2, { q: 5, r: 6 }),
    ];

    const plan = planSmartAiTurn(state, { ...deterministicSearch, beamWidth: 10, maxDepth: 3 });
    expect(plan.tactical.tier).toBe('safe');
    expect(plan.actions.some((action) =>
      action.kind === 'attack' && action.targetId === 'human-threat')).toBe(true);
    expect(plan.strategic.outlook).toBeGreaterThanOrEqual(-100);
    expect(plan.strategic.outlook).toBeLessThanOrEqual(100);
    expect(Object.keys(plan.strategic.components)).toEqual([
      'economy', 'army', 'objectives', 'position', 'commander', 'victory',
    ]);
  });

  it('prefers damaging a Commander over expanding an already active army', () => {
    const state = minimalAiTurnState();
    state.players[2].mana = 20;
    state.players[2].hand = ['graveKnight', 'vampire'];
    state.sites = [{
      id: 'undead-fort',
      type: 'fort',
      coord: { q: 12, r: 8 },
      owner: 2,
      initialOwner: 2,
    }];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 5, r: 4 }),
      makeUnit('undead-attacker', 'skeletalInfantry', 2, { q: 4, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];

    const plan = planSmartAiTurn(state, { ...deterministicSearch, beamWidth: 10, maxDepth: 3 });
    expect(plan.actions.some((action) =>
      action.kind === 'attack' && action.targetId === 'human-commander')).toBe(true);
  });

  it('scores Commander damage as meaningful strategic progress', () => {
    const healthy = minimalAiTurnState();
    healthy.units = [
      makeUnit('human-commander', 'commander', 1, { q: 7, r: 4 }),
      makeUnit('undead-attacker', 'graveKnight', 2, { q: 5, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 12, r: 8 }),
    ];
    const damaged = structuredClone(healthy);
    const target = damaged.units.find((unit) => unit.id === 'human-commander');
    if (!target) throw new Error('Commander fixture is missing.');
    target.hp -= 3;

    const healthyScore = evaluateStrategicPosition(healthy, 2);
    const damagedScore = evaluateStrategicPosition(damaged, 2);

    expect(damagedScore.components.commander).toBeGreaterThan(healthyScore.components.commander);
    expect(damagedScore.outlook - healthyScore.outlook).toBeGreaterThan(5);
  });
});
