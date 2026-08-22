import { describe, expect, it } from 'vitest';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { runSimpleAiTurn } from './ai';
import { createGameState, endTurn } from './engine';

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

describe('simple enemy AI', () => {
  it('takes Player 2 turn and returns control to Player 1', () => {
    const state = createGameState(fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.currentPlayer).toBe(2);

    const result = runSimpleAiTurn(state, fixedRandom);

    expect(result.endedTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.winner).toBe(null);
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('prioritizes and kills an adjacent Human Commander', () => {
    const state = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].hand = [];
    state.players[2].mana = 0;
    state.sites = [];
    state.units = [
      makeUnit('human-commander', 'commander', 1, { q: 4, r: 4 }, { hp: 1 }),
      makeUnit('undead-attacker', 'skeletonGuard', 2, { q: 3, r: 4 }),
      makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 }),
    ];

    runSimpleAiTurn(state, fixedRandom);

    expect(state.units.some((unit) => unit.id === 'human-commander')).toBe(false);
    expect(state.countdown?.player).toBe(2);
    expect(state.countdown?.checkpoints).toBe(1);
    expect(state.currentPlayer).toBe(1);
  });

  it('can finish the final Commander survival checkpoint and win', () => {
    const state: GameState = createGameState(fixedRandom);
    state.currentPlayer = 2;
    state.players[2].hand = [];
    state.players[2].mana = 0;
    state.sites = [];
    state.units = [makeUnit('undead-commander', 'commander', 2, { q: 10, r: 8 })];
    state.countdown = { player: 2, checkpoints: 2 };

    const result = runSimpleAiTurn(state, fixedRandom);

    expect(result.endedTurn).toBe(true);
    expect(state.winner).toBe(2);
    expect(state.countdown?.checkpoints).toBe(3);
  });
});
