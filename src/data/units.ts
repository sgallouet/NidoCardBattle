import type { UnitDefinition } from './types';

export type UnitDefinitionId =
  | 'commander'
  | 'skeletonGuard'
  | 'boneArcher'
  | 'vampire'
  | 'necromancer'
  | 'banshee'
  | 'wraith'
  | 'ghoul'
  | 'graveKnight';

export const UNIT_DEFINITIONS: Record<UnitDefinitionId, UnitDefinition> = {
  commander: {
    id: 'commander', name: 'Commander', cost: 0, maxHp: 10, attack: 3, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], mark: 'C',
  },
  skeletonGuard: {
    id: 'skeletonGuard', name: 'Skeletal Infantry', cost: 1, maxHp: 2, attack: 2, move: 2, range: 1,
    traits: ['Blocking'], mark: 'S',
  },
  boneArcher: {
    id: 'boneArcher', name: 'Longbow Ranger', cost: 3, maxHp: 2, attack: 2, move: 2, range: 3,
    traits: ['Ranged'], mark: 'L',
  },
  vampire: {
    id: 'vampire', name: 'Silverwing Cavalry', cost: 6, maxHp: 5, attack: 4, move: 4, range: 1,
    traits: ['Flying', 'Charge'], mark: 'S',
  },
  necromancer: {
    id: 'necromancer', name: 'Necromancer', cost: 5, maxHp: 4, attack: 1, move: 2, range: 2,
    traits: ['Invoker'], mark: 'N',
  },
  banshee: {
    id: 'banshee', name: 'Banshee Displacer', cost: 4, maxHp: 3, attack: 2, move: 3, range: 1,
    traits: [], ability: 'Displace', mark: 'B',
  },
  wraith: {
    id: 'wraith', name: 'Light Mage', cost: 4, maxHp: 3, attack: 2, move: 2, range: 2,
    traits: [], ability: 'Restore', mark: 'M',
  },
  ghoul: {
    id: 'ghoul', name: 'Royal Guard', cost: 2, maxHp: 3, attack: 2, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], mark: 'R',
  },
  graveKnight: {
    id: 'graveKnight', name: 'Grave Knight', cost: 5, maxHp: 4, attack: 4, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], mark: 'K',
  },
};
