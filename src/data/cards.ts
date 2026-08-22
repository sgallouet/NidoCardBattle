import type { CardDefinition, Faction } from './types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from './units';

type PrototypeUnitId = Exclude<UnitDefinitionId, 'commander' | 'humanCommander' | 'undeadCommander'>;

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
  royalGuard: unitCard('royalGuard'),
  longbowRanger: unitCard('longbowRanger'),
  silverwingCavalry: unitCard('silverwingCavalry'),
  lightMage: unitCard('lightMage'),
  bannerCaptain: unitCard('bannerCaptain'),
  windAdept: unitCard('windAdept'),
  skeletalInfantry: unitCard('skeletalInfantry'),
  boneArcher: unitCard('boneArcher'),
  necromancer: unitCard('necromancer'),
  banshee: unitCard('banshee'),
  vampire: unitCard('vampire'),
  wraith: unitCard('wraith'),
  graveKnight: unitCard('graveKnight'),
  graveLock: {
    id: 'graveLock',
    name: 'Grave Lock',
    faction: 'undead',
    type: 'tactic',
    cost: 3,
    effect: { kind: 'graveLock', target: 'tile' },
  },
  buildBridge: {
    id: 'buildBridge',
    name: 'Build Bridge',
    faction: 'shared',
    type: 'tactic',
    cost: 2,
    effect: { kind: 'buildBridge', target: 'water' },
  },
  scorch: {
    id: 'scorch',
    name: 'Scorch',
    faction: 'human',
    type: 'tactic',
    cost: 1,
    effect: { kind: 'scorch', target: 'forest' },
  },
  raiseFort: {
    id: 'raiseFort',
    name: 'Raise Fort',
    faction: 'human',
    type: 'tactic',
    cost: 4,
    effect: { kind: 'raiseFort', target: 'constructibleLand' },
  },
  profaneWell: {
    id: 'profaneWell',
    name: 'Profane Well',
    faction: 'undead',
    type: 'tactic',
    cost: 2,
    effect: { kind: 'profaneWell', target: 'friendlyUnit' },
  },
} as const satisfies Record<string, CardDefinition>;

export type CardDefinitionId = keyof typeof CARD_DEFINITIONS;

export const FACTION_DECKS: Record<Faction, CardDefinitionId[]> = {
  human: [
    'royalGuard',
    'longbowRanger',
    'silverwingCavalry',
    'lightMage',
    'bannerCaptain',
    'scorch',
    'raiseFort',
    'buildBridge',
  ],
  undead: [
    'skeletalInfantry',
    'boneArcher',
    'necromancer',
    'vampire',
    'graveKnight',
    'graveLock',
    'profaneWell',
    'buildBridge',
  ],
};
