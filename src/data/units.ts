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
    id: 'skeletonGuard', name: 'Skeleton Guard', cost: 2, maxHp: 5, attack: 2, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], mark: 'S',
  },
  boneArcher: {
    id: 'boneArcher', name: 'Bone Archer', cost: 3, maxHp: 3, attack: 3, move: 2, range: 3,
    traits: [], mark: 'A',
  },
  vampire: {
    id: 'vampire', name: 'Vampire', cost: 5, maxHp: 6, attack: 3, move: 4, range: 1,
    traits: ['Blocking', 'Retaliates'], ability: 'Blood Drain', mark: 'V',
  },
  necromancer: {
    id: 'necromancer', name: 'Necromancer', cost: 4, maxHp: 4, attack: 2, move: 2, range: 2,
    traits: ['Invoker'], mark: 'N',
  },
  banshee: {
    id: 'banshee', name: 'Banshee', cost: 3, maxHp: 3, attack: 1, move: 3, range: 1,
    traits: [], ability: 'Displace', mark: 'B',
  },
  wraith: {
    id: 'wraith', name: 'Wraith', cost: 3, maxHp: 3, attack: 2, move: 5, range: 1,
    traits: [], ability: 'Phase', mark: 'W',
  },
  ghoul: {
    id: 'ghoul', name: 'Ghoul', cost: 4, maxHp: 7, attack: 3, move: 3, range: 1,
    traits: ['Blocking'], ability: 'Feast', mark: 'G',
  },
  graveKnight: {
    id: 'graveKnight', name: 'Grave Knight', cost: 7, maxHp: 9, attack: 4, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], mark: 'K',
  },
};
