import type { CardDefinition, Faction } from './types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from './units';

type PrototypeUnitId = Exclude<UnitDefinitionId, 'commander'>;

const unitCard = <T extends PrototypeUnitId>(unitId: T) => {
  const unit = UNIT_DEFINITIONS[unitId];
  if (unit.faction === 'shared') throw new Error(`${unit.name} cannot be used as a faction card.`);
  return {
    id: unitId,
    name: unit.name,
    faction: unit.faction,
    type: 'unit' as const,
    cost: unit.cost,
    unitId,
  };
};

export const CARD_DEFINITIONS = {
  skeletonGuard: unitCard('skeletonGuard'),
  boneArcher: unitCard('boneArcher'),
  vampire: unitCard('vampire'),
  necromancer: unitCard('necromancer'),
  banshee: unitCard('banshee'),
  wraith: unitCard('wraith'),
  ghoul: unitCard('ghoul'),
  graveKnight: unitCard('graveKnight'),
} as const satisfies Record<string, CardDefinition>;

export type CardDefinitionId = keyof typeof CARD_DEFINITIONS;

export const FACTION_DECKS: Record<Faction, CardDefinitionId[]> = {
  human: [
    'boneArcher', 'boneArcher',
    'vampire', 'vampire',
    'wraith', 'wraith',
    'ghoul', 'ghoul',
  ],
  undead: [
    'skeletonGuard', 'skeletonGuard',
    'necromancer', 'necromancer',
    'banshee', 'banshee',
    'graveKnight', 'graveKnight',
  ],
};
