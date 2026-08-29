import type { UnitDefinition } from './types';

export type UnitDefinitionId =
  | 'commander'
  | 'humanCommander'
  | 'undeadCommander'
  | 'royalGuard'
  | 'longbowRanger'
  | 'silverwingCavalry'
  | 'lightMage'
  | 'bannerCaptain'
  | 'windAdept'
  | 'skeletalInfantry'
  | 'boneArcher'
  | 'necromancer'
  | 'banshee'
  | 'vampire'
  | 'wraith'
  | 'graveKnight'
  | 'invokedBeast';

export const UNIT_DEFINITIONS: Record<UnitDefinitionId, UnitDefinition> = {
  commander: {
    id: 'commander', name: 'Commander', faction: 'shared', cost: 0, maxHp: 10, attack: 3, move: 2, range: 1,
    traits: ['Blocking'], mark: 'C',
  },
  humanCommander: {
    id: 'commander', name: 'Human Commander', faction: 'human', cost: 0, maxHp: 10, attack: 3, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], ability: 'Rally', mark: 'C',
  },
  undeadCommander: {
    id: 'commander', name: 'Undead Commander', faction: 'undead', cost: 0, maxHp: 10, attack: 3, move: 2, range: 1,
    traits: ['Blocking', 'DarkReflection'], ability: 'SoulLink', mark: 'C',
  },
  royalGuard: {
    id: 'royalGuard', name: 'Royal Guard', faction: 'human', cost: 2, maxHp: 3, attack: 2, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates', 'Assist'], mark: 'R',
  },
  longbowRanger: {
    id: 'longbowRanger', name: 'Longbow Ranger', faction: 'human', cost: 3, maxHp: 1, attack: 1, move: 2, range: 3,
    traits: ['Ranged', 'Assist', 'SetShot'], mark: 'L',
  },
  silverwingCavalry: {
    id: 'silverwingCavalry', name: 'Silverwing Cavalry', faction: 'human', cost: 6, maxHp: 5, attack: 4, move: 4, range: 1,
    traits: ['Flying', 'AgileAssault'], mark: 'S',
  },
  lightMage: {
    id: 'lightMage', name: 'Thunder Mage', faction: 'human', cost: 4, maxHp: 3, attack: 0, normalAttack: false, move: 2, range: 2,
    traits: ['Invoker'], ability: 'Thunder', mark: 'M',
  },
  bannerCaptain: {
    id: 'bannerCaptain', name: 'Banner Captain', faction: 'human', cost: 4, maxHp: 4, attack: 2, move: 2, range: 1,
    traits: ['HealingAura'], mark: 'B',
  },
  windAdept: {
    id: 'windAdept', name: 'Wind Adept', faction: 'human', cost: 3, maxHp: 2, attack: 1, move: 3, range: 2,
    traits: [], ability: 'Displace', mark: 'W',
  },
  skeletalInfantry: {
    id: 'skeletalInfantry', name: 'Skeletal Infantry', faction: 'undead', cost: 1, maxHp: 2, attack: 2, move: 2, range: 1,
    traits: ['Blocking', 'Assist'], mark: 'S',
  },
  boneArcher: {
    id: 'boneArcher', name: 'Bone Archer', faction: 'undead', cost: 3, maxHp: 1, attack: 1, move: 2, range: 3,
    traits: ['Ranged', 'Assist', 'SetShot'], mark: 'A',
  },
  necromancer: {
    id: 'necromancer', name: 'Necromancer', faction: 'undead', cost: 5, maxHp: 4, attack: 1, move: 2, range: 3,
    traits: ['Ranged', 'Necromancy'], ability: 'Curse', mark: 'N',
  },
  banshee: {
    id: 'banshee', name: 'Banshee', faction: 'undead', cost: 4, maxHp: 3, attack: 2, move: 3, range: 1,
    traits: [], ability: 'Displace', mark: 'B',
  },
  vampire: {
    id: 'vampire', name: 'Vampire', faction: 'undead', cost: 5, maxHp: 4, attack: 3, move: 3, range: 1,
    traits: ['Flying'], ability: 'BloodDrain', mark: 'V',
  },
  wraith: {
    id: 'wraith', name: 'Wraith', faction: 'undead', cost: 4, maxHp: 3, attack: 2, move: 4, range: 1,
    traits: ['Phase'], mark: 'W',
  },
  graveKnight: {
    id: 'graveKnight', name: 'Grave Knight', faction: 'undead', cost: 5, maxHp: 5, attack: 3, move: 2, range: 1,
    traits: ['Blocking', 'Retaliates'], ability: 'Cleave', mark: 'K',
  },
  invokedBeast: {
    id: 'invokedBeast', name: 'Invoked Beast', faction: 'human', cost: 0, maxHp: 2, attack: 1, move: 2, range: 1,
    traits: [], mark: 'I',
  },
};
