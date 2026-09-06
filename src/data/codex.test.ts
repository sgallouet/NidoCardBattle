import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS } from './cards';
import {
  ABILITY_DESCRIPTIONS,
  TRAIT_DESCRIPTIONS,
  UNIT_CODEX,
  getCodexUnitDefinition,
  getCodexUnitIds,
  getCodexUnitsByFaction,
} from './codex';
import { UNIT_DEFINITIONS } from './units';

describe('War Codex data', () => {
  it('covers every playable unit card', () => {
    const playable = Object.values(CARD_DEFINITIONS)
      .filter((card) => card.type === 'unit')
      .map((card) => card.unitId)
      .sort();
    expect(getCodexUnitIds().sort()).toEqual(playable);
    expect(Object.keys(UNIT_CODEX).sort()).toEqual(playable);
  });

  it('groups units by their real faction', () => {
    for (const id of getCodexUnitsByFaction('human')) {
      expect(UNIT_DEFINITIONS[id].faction).toBe('human');
    }
    for (const id of getCodexUnitsByFaction('undead')) {
      expect(UNIT_DEFINITIONS[id].faction).toBe('undead');
    }
    expect(getCodexUnitsByFaction('undead')).toContain('vampire');
  });

  it('reads stats from UNIT_DEFINITIONS rather than duplicating them', () => {
    expect(getCodexUnitDefinition('vampire')).toBe(UNIT_DEFINITIONS.vampire);
    expect(getCodexUnitDefinition('vampire')).toMatchObject({
      cost: 5,
      maxHp: 4,
      attack: 3,
      move: 3,
      range: 1,
      ability: 'BloodDrain',
    });
  });

  it('has player-facing descriptions for every mechanic used by playable units', () => {
    for (const id of getCodexUnitIds()) {
      const definition = UNIT_DEFINITIONS[id];
      for (const trait of definition.traits) {
        expect(TRAIT_DESCRIPTIONS[trait]).toBeTruthy();
      }
      if (definition.ability) expect(ABILITY_DESCRIPTIONS[definition.ability]).toBeTruthy();
    }
  });
});
