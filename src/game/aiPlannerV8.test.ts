import { describe, expect, it } from 'vitest';
import type { Coord, PlayerId, SiteState, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import type { AiAction, AiPlan } from './ai';
import { PLANNER_V7_PROFILE, PLANNER_V8_PROFILE } from './aiPlannerProfiles';
import { LIVE_AI_OPTIONS_V8, getBrowserAiSearchOptions, planAiTurnV8 } from './aiPlannerV8';
import { createGameState, hexDistance } from './engine';

const fixedRandom = () => 0.25;
const QUICK_OPTIONS = {
  beamWidth: 4,
  maxDepth: 5,
  strategyMaxNodes: 1_200,
  strategyMaxPlanningMs: 8_000,
  candidatePlans: 12,
  responseBeamWidth: 3,
  responseDepth: 3,
  tacticalMaxNodes: 480,
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

const objective = (
  id: string,
  type: 'well' | 'fort',
  coord: Coord,
  owner: PlayerId | null = null,
): SiteState => ({ id, type, coord, initialOwner: owner, owner });

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

describe('Planner V8 control conversion profile', () => {
  it('keeps V7 search breadth and the one-second live budget', () => {
    expect(getBrowserAiSearchOptions()).toBe(LIVE_AI_OPTIONS_V8);
    expect(LIVE_AI_OPTIONS_V8.strategyMaxPlanningMs + LIVE_AI_OPTIONS_V8.tacticalMaxPlanningMs).toBe(1_000);
    expect(LIVE_AI_OPTIONS_V8.strategyMaxNodes).toBe(PLANNER_V7_PROFILE.liveOptions.strategyMaxNodes);
    expect(LIVE_AI_OPTIONS_V8.tacticalMaxNodes).toBe(PLANNER_V7_PROFILE.liveOptions.tacticalMaxNodes);
  });

  it('assigns two available runners to different expansion objectives', () => {
    const wellRunner = makeUnit('well-runner', 'skeletalInfantry', 2, { q: 12, r: 4 });
    const fortRunner = makeUnit('fort-runner', 'banshee', 2, { q: 12, r: 5 });
    const well = objective('near-well', 'well', { q: 9, r: 4 });
    const fort = objective('lower-fort', 'fort', { q: 12, r: 9 });
    const state = isolatedState([wellRunner, fortRunner], [well, fort]);

    const plan = planAiTurnV8(state, QUICK_OPTIONS);
    const wellMove = firstMoveFor(plan, wellRunner.id);
    const fortMove = firstMoveFor(plan, fortRunner.id);

    expect(wellMove).toBeDefined();
    expect(fortMove).toBeDefined();
    expect(hexDistance(wellMove!.destination, well.coord)).toBeLessThan(hexDistance(wellRunner.coord, well.coord));
    expect(hexDistance(fortMove!.destination, fort.coord)).toBeLessThan(hexDistance(fortRunner.coord, fort.coord));
  });

  it('converts established control into a lethal attack on a site defender', () => {
    const attacker = makeUnit('attacker', 'skeletalInfantry', 2, { q: 10, r: 6 });
    const defender = makeUnit('site-defender', 'royalGuard', 1, { q: 9, r: 6 }, { hp: 2 });
    const state = isolatedState([attacker, defender], [
      objective('owned-well-a', 'well', { q: 13, r: 4 }, 2),
      objective('owned-well-b', 'well', { q: 11, r: 10 }, 2),
      objective('owned-fort', 'fort', { q: 9, r: 9 }, 2),
      objective('enemy-fort', 'fort', defender.coord, 1),
    ]);

    expect(planAiTurnV8(state, QUICK_OPTIONS).actions).toContainEqual({
      kind: 'attack', unitId: attacker.id, targetId: defender.id,
    });
  });

  it('does not abandon the turn for Village healing after only minor damage', () => {
    const unit = makeUnit('scratched-necromancer', 'necromancer', 2, { q: 13, r: 7 }, { hp: 3 });
    const state = isolatedState([unit], []);

    const move = firstMoveFor(planAiTurnV8(state, QUICK_OPTIONS), unit.id);

    expect(PLANNER_V8_PROFILE.scoring.habits.villageHealMaxHealthRatio).toBe(0.6);
    expect(move?.destination).not.toEqual({ q: 14, r: 7 });
  });

  it('still sends a critically wounded ranged unit to an available Village', () => {
    const unit = makeUnit('wounded-necromancer', 'necromancer', 2, { q: 13, r: 7 }, { hp: 2 });
    const state = isolatedState([unit], []);

    expect(planAiTurnV8(state, QUICK_OPTIONS).actions).toContainEqual({
      kind: 'move', unitId: unit.id, destination: { q: 14, r: 7 },
    });
  });
});
