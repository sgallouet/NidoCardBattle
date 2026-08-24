import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { applyGameAction, getLegalGameActions } from './actions';
import { generateLegalActionsForPlayer } from './ai';
import { createGameState } from './engine';

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
  movementSpent: 0,
  postAttackMoved: false,
  moveBonus: 0,
  curses: [],
  ...overrides,
});

const freshState = (): GameState => createGameState(fixedRandom);

describe('engine-owned legal actions', () => {
  it('exposes Curse to every rules consumer without AI-specific logic', () => {
    const state = freshState();
    state.currentPlayer = 2;
    state.players[2].hand = [];
    state.units = [
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
      makeUnit('necromancer', 'necromancer', 2, { q: 5, r: 4 }),
      makeUnit('human-target', 'royalGuard', 1, { q: 7, r: 4 }),
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 9 }),
    ];

    const engineActions = getLegalGameActions(state, 2, { includeCards: false });
    const aiActions = generateLegalActionsForPlayer(state, 2, false);

    expect(engineActions.some((action) => action.kind === 'curse' && action.targetId === 'human-target')).toBe(true);
    expect(aiActions).toEqual(engineActions);
  });

  it('exposes and applies UNT3 through the shared action vocabulary', () => {
    const state = freshState();
    state.currentPlayer = 2;
    state.players[2].hand = [];
    state.units = [
      makeUnit('necromancer', 'necromancer', 2, { q: 5, r: 4 }),
      makeUnit('human-commander', 'commander', 1, { q: 15, r: 9 }),
    ];

    const engineActions = getLegalGameActions(state, 2, { includeCards: false });
    const aiActions = generateLegalActionsForPlayer(state, 2, false);
    const invoke = engineActions.find((action) => action.kind === 'invoke');

    expect(invoke).toBeDefined();
    expect(aiActions).toEqual(engineActions);
    const result = applyGameAction(state, invoke!);
    expect(result.ok).toBe(true);
    expect(state.units.find((unit) => unit.id === result.summonedUnitId)?.definitionId).toBe('invokedBeast');
  });

  it('exposes Soul Link as a normal searched action', () => {
    const state = freshState();
    state.currentPlayer = 2;
    state.players[2].hand = [];
    state.units = [
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
      makeUnit('bodyguard', 'skeletalInfantry', 2, { q: 11, r: 8 }),
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 9 }),
    ];

    expect(getLegalGameActions(state, 2, { includeCards: false }))
      .toContainEqual({ kind: 'soulLink', unitId: 'undead-commander', targetId: 'bodyguard' });
  });

  it('exposes Rally when at least one adjacent ally can benefit', () => {
    const state = freshState();
    state.currentPlayer = 1;
    state.players[1].hand = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 5, r: 5 }),
      makeUnit('guard', 'royalGuard', 1, { q: 6, r: 5 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 3 }),
    ];

    expect(getLegalGameActions(state, 1, { includeCards: false }))
      .toContainEqual({ kind: 'rally', unitId: 'human-commander' });
  });

  it('folds Light Mage summon Restore choice into the summon action', () => {
    const state = freshState();
    state.currentPlayer = 1;
    state.players[1].hand = ['lightMage'];
    state.players[1].mana = 7;
    state.units = [
      makeUnit('damaged-guard', 'royalGuard', 1, { q: 3, r: 9 }, { hp: 1 }),
      makeUnit('undead-commander', 'commander', 2, { q: 15, r: 3 }),
    ];

    const action = getLegalGameActions(state, 1, { includeCards: true }).find((candidate) =>
      candidate.kind === 'summon'
      && candidate.cardId === 'lightMage'
      && candidate.destination.q === 2
      && candidate.destination.r === 9
      && candidate.restoreTargetId === 'damaged-guard');

    expect(action).toBeDefined();
    const result = applyGameAction(state, action!);
    expect(result.ok).toBe(true);
    expect(state.units.find((unit) => unit.id === 'damaged-guard')?.hp).toBe(3);
  });

  it('applies active ability actions through the same generic resolver', () => {
    const state = freshState();
    state.currentPlayer = 2;
    state.units = [
      makeUnit('necromancer', 'necromancer', 2, { q: 5, r: 4 }),
      makeUnit('human-target', 'royalGuard', 1, { q: 7, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
      makeUnit('human-commander', 'commander', 1, { q: 2, r: 9 }),
    ];

    const result = applyGameAction(state, { kind: 'curse', unitId: 'necromancer', targetId: 'human-target' });

    expect(result.ok).toBe(true);
    expect(state.units.find((unit) => unit.id === 'necromancer')?.attacked).toBe(true);
    expect(state.units.find((unit) => unit.id === 'human-target')?.curses).toEqual([
      { sourcePlayer: 2, remainingTurns: 3 },
    ]);
  });
});
