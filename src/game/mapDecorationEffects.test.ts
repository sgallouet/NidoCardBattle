import { describe, expect, it } from 'vitest';
import { MAP_DECORATIONS } from '../data/map';
import { UNIT_DEFINITIONS } from '../data/units';
import { createGameState, endTurn, MAX_MANA } from './engine';

const fixedRandom = () => 0.25;

describe('Village and Ruin occupancy bonuses', () => {
  it('applies MPL8 when a damaged unit starts its turn on a Village', () => {
    const state = createGameState(fixedRandom);
    const village = MAP_DECORATIONS.find((decoration) => decoration.type === 'village')!;
    const unit = state.units.find((candidate) => candidate.owner === 2 && candidate.definitionId !== 'commander')!;
    unit.coord = { ...village.coord };
    unit.hp = Math.max(1, UNIT_DEFINITIONS[unit.definitionId as keyof typeof UNIT_DEFINITIONS].maxHp - 1);
    const hpBefore = unit.hp;

    endTurn(state, fixedRandom);

    expect(state.currentPlayer).toBe(2);
    expect(unit.hp).toBe(hpBefore + 1);
  });

  it('applies ECM6 only while a unit occupies a Ruin', () => {
    const state = createGameState(fixedRandom);
    const ruin = MAP_DECORATIONS.find((decoration) => decoration.type === 'ruin')!;
    const unit = state.units.find((candidate) => candidate.owner === 2 && candidate.definitionId !== 'commander')!;
    unit.coord = { ...ruin.coord };
    state.players[2].mana = 3;

    endTurn(state, fixedRandom);

    expect(state.currentPlayer).toBe(2);
    expect(state.players[2].mana).toBe(4);
  });

  it('keeps Ruin income subject to ECM4', () => {
    const state = createGameState(fixedRandom);
    const ruin = MAP_DECORATIONS.find((decoration) => decoration.type === 'ruin')!;
    const unit = state.units.find((candidate) => candidate.owner === 2 && candidate.definitionId !== 'commander')!;
    unit.coord = { ...ruin.coord };
    state.players[2].mana = MAX_MANA;

    endTurn(state, fixedRandom);

    expect(state.players[2].mana).toBe(MAX_MANA);
  });
});
