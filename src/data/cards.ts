import type { CardDefinition } from './types';

export const CARD_DEFINITIONS = {
  skeletonGuard: { id: 'skeletonGuard', name: 'Skeleton Guard', type: 'unit', cost: 2, unitId: 'skeletonGuard' },
  boneArcher: { id: 'boneArcher', name: 'Bone Archer', type: 'unit', cost: 3, unitId: 'boneArcher' },
  vampire: { id: 'vampire', name: 'Vampire', type: 'unit', cost: 5, unitId: 'vampire' },
  necromancer: { id: 'necromancer', name: 'Necromancer', type: 'unit', cost: 4, unitId: 'necromancer' },
  banshee: { id: 'banshee', name: 'Banshee', type: 'unit', cost: 3, unitId: 'banshee' },
  wraith: { id: 'wraith', name: 'Wraith', type: 'unit', cost: 3, unitId: 'wraith' },
  ghoul: { id: 'ghoul', name: 'Ghoul', type: 'unit', cost: 4, unitId: 'ghoul' },
  graveKnight: { id: 'graveKnight', name: 'Grave Knight', type: 'unit', cost: 7, unitId: 'graveKnight' },
  graveBolt: {
    id: 'graveBolt', name: 'Grave Bolt', type: 'tactic', cost: 2,
    effect: { kind: 'damage', amount: 2, target: 'enemy' },
  },
  soulMend: {
    id: 'soulMend', name: 'Soul Mend', type: 'tactic', cost: 1,
    effect: { kind: 'heal', amount: 2, target: 'friendly' },
  },
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
  'graveBolt', 'soulMend',
];
