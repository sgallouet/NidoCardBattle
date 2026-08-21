import type { CardDefinition } from './types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from './units';

type PrototypeUnitId = Exclude<UnitDefinitionId, 'commander'>;

const unitCard = <T extends PrototypeUnitId>(unitId: T) => ({
  id: unitId,
  name: UNIT_DEFINITIONS[unitId].name,
  type: 'unit' as const,
  cost: UNIT_DEFINITIONS[unitId].cost,
  unitId,
});

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

export const PROTOTYPE_DECK: CardDefinitionId[] = [
  'skeletonGuard', 'skeletonGuard',
  'boneArcher', 'boneArcher',
  'vampire', 'vampire',
  'necromancer', 'necromancer',
  'banshee', 'banshee',
  'wraith', 'wraith',
  'ghoul', 'ghoul',
  'graveKnight', 'graveKnight',
];
