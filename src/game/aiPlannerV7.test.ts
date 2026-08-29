import { describe, expect, it } from 'vitest';
import type { Coord, PlayerId, SiteState, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import type { AiAction, AiPlan } from './ai';
import { PLANNER_V5_PROFILE, PLANNER_V7_PROFILE } from './aiPlannerProfiles';
import { LIVE_AI_OPTIONS_V7, getBrowserAiSearchOptions, planAiTurnV7 } from './aiPlannerV7';
import { createGameState, hexDistance, terrainAt } from './engine';

const fixedRandom = () => 0.25;
const QUICK_OPTIONS = {
  beamWidth: 4,
  maxDepth: 4,
  strategyMaxNodes: 900,
  strategyMaxPlanningMs: 8_000,
  candidatePlans: 12,
  responseBeamWidth: 3,
  responseDepth: 3,
  tacticalMaxNodes: 360,
  tacticalMaxPlanningMs: 8_000,
} as const;

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

const objective = (id: string, type: 'well' | 'fort', coord: Coord): SiteState => ({
  id,
  type,
  coord,
  initialOwner: null,
  owner: null,
});

const isolatedState = (units: UnitState[], sites: SiteState[]) => {
  const state = createGameState(fixedRandom);
  state.currentPlayer = 2;
  state.players[2].mana = 0;
  state.players[2].hand = [];
  state.players[2].deck = [];
  state.players[2].discard = [];
  state.sites = sites;
  state.units = [
    makeUnit('human-commander', 'commander', 1, { q: 1, r: 1 }),
    makeUnit('undead-commander', 'commander', 2, { q: 16, r: 11 }, { exhausted: true }),
    ...units,
  ];
  return state;
};

type MoveAction = Extract<AiAction, { kind: 'move' }>;
const firstMoveFor = (plan: AiPlan, unitId: string): MoveAction | undefined =>
  plan.actions.find((action): action is MoveAction => action.kind === 'move' && action.unitId === unitId);

describe('Planner V7 selective control profile', () => {
  it('keeps the one-second V5 live-search budget', () => {
    expect(getBrowserAiSearchOptions()).toBe(LIVE_AI_OPTIONS_V7);
    expect(LIVE_AI_OPTIONS_V7.strategyMaxPlanningMs + LIVE_AI_OPTIONS_V7.tacticalMaxPlanningMs).toBe(1_000);
    expect(LIVE_AI_OPTIONS_V7.strategyMaxNodes).toBe(PLANNER_V5_PROFILE.liveOptions.strategyMaxNodes);
    expect(LIVE_AI_OPTIONS_V7.tacticalMaxNodes).toBe(PLANNER_V5_PROFILE.liveOptions.tacticalMaxNodes);
  });

  it('advances a non-Commander toward a distant Mana Well', () => {
    const unit = makeUnit('objective-runner', 'skeletalInfantry', 2, { q: 12, r: 4 });
    const well = objective('target-well', 'well', { q: 7, r: 4 });
    const state = isolatedState([unit], [well]);

    const move = firstMoveFor(planAiTurnV7(state, QUICK_OPTIONS), unit.id);

    expect(move?.kind).toBe('move');
    expect(hexDistance(move!.destination, well.coord)).toBeLessThan(hexDistance(unit.coord, well.coord));
  });

  it('captures a reachable neutral Fort', () => {
    const unit = makeUnit('fort-runner', 'skeletalInfantry', 2, { q: 8, r: 4 });
    const fort = objective('target-fort', 'fort', { q: 7, r: 4 });
    const state = isolatedState([unit], [fort]);

    expect(planAiTurnV7(state, QUICK_OPTIONS).actions).toContainEqual({
      kind: 'move', unitId: unit.id, destination: fort.coord,
    });
  });

  it('puts a ranged unit on a Hill when no urgent objective is available', () => {
    const unit = makeUnit('undead-archer', 'boneArcher', 2, { q: 13, r: 5 });
    const state = isolatedState([unit], []);

    const move = firstMoveFor(planAiTurnV7(state, QUICK_OPTIONS), unit.id);

    expect(move?.kind).toBe('move');
    expect(terrainAt(move!.destination)).toBe('hill');
  });

  it('moves a wounded ranged unit onto a Village to heal', () => {
    const unit = makeUnit('wounded-necromancer', 'necromancer', 2, { q: 13, r: 7 }, { hp: 2 });
    const state = isolatedState([unit], []);

    expect(planAiTurnV7(state, QUICK_OPTIONS).actions).toContainEqual({
      kind: 'move', unitId: unit.id, destination: { q: 14, r: 7 },
    });
  });

  it('removes Commander approach pressure without disabling an immediate capture', () => {
    const commander = makeUnit('undead-commander', 'commander', 2, { q: 8, r: 4 });
    const well = objective('target-well', 'well', { q: 7, r: 4 });
    const state = isolatedState([], [well]);
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 1, r: 1 }),
      commander,
    ];

    expect(PLANNER_V7_PROFILE.scoring.habits.commanderSiteApproachScale).toBe(0);
    expect(planAiTurnV7(state, QUICK_OPTIONS).actions).toContainEqual({
      kind: 'move', unitId: commander.id, destination: well.coord,
    });
  });

  it('keeps a healthy Commander from being the distant objective runner', () => {
    const commander = makeUnit('undead-commander', 'commander', 2, { q: 12, r: 4 });
    const well = objective('target-well', 'well', { q: 7, r: 4 });
    const state = isolatedState([], [well]);
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 1, r: 1 }),
      commander,
    ];

    const move = firstMoveFor(planAiTurnV7(state, QUICK_OPTIONS), commander.id);

    if (move) {
      expect(hexDistance(move.destination, well.coord)).toBeGreaterThanOrEqual(hexDistance(commander.coord, well.coord));
    }
  });

  it('does not spend Grave Lock on a remote enemy with no nearby follow-up', () => {
    const state = isolatedState([], []);
    state.players[2].mana = 3;
    state.players[2].hand = ['graveLock', 'skeletalInfantry'];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 8 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 4 }),
    ];

    const actions = planAiTurnV7(state, QUICK_OPTIONS).actions;

    expect(actions.some((action) => action.kind === 'tactic' && action.cardId === 'graveLock')).toBe(false);
  });
});
