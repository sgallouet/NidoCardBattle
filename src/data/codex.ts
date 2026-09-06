import { CARD_DEFINITIONS } from './cards';
import type { Ability, Faction, Trait, UnitCard, UnitDefinition } from './types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from './units';

export type CodexUnitId = Exclude<
  UnitDefinitionId,
  'commander' | 'humanCommander' | 'undeadCommander' | 'invokedBeast'
>;

export interface UnitCodexEntry {
  role: string;
  tagline: string;
  strongAgainst: readonly string[];
  weakAgainst: readonly string[];
}

export const TRAIT_DESCRIPTIONS: Record<Trait, string> = {
  Blocking: 'Stops enemies moving past adjacent hexes.',
  Retaliates: 'Strikes back when attacked within range.',
  Invoker: 'Summons one Invoked Beast to a free adjacent hex.',
  HealingAura: 'Heals damaged adjacent allies 1 HP at turn start.',
  Ranged: 'Attacks at range; hills grant +1 Range.',
  SetShot: 'Cannot attack after spending movement.',
  Flying: 'Crosses difficult terrain except mountains and ignores forest slowdown.',
  AgileAssault: 'Can move after attacking and takes half retaliation damage.',
  DarkReflection: 'Reflects 30% of direct attack damage.',
  Necromancy: 'Kills raise a 1 HP exhausted Skeleton on the victim hex.',
  Phase: 'Ignores enemy Blocking zones.',
  Assist: 'Adds +1 melee support damage, or +2 from directly behind.',
};

export const ABILITY_DESCRIPTIONS: Record<Ability, string> = {
  Displace: 'Move an adjacent unit to another free adjacent hex.',
  Restore: 'Restore 2 HP to a damaged adjacent ally.',
  Thunder: 'Deal 1 damage through a chain of adjacent enemies.',
  Rally: 'Give fresh adjacent allies +1 Move this turn.',
  SoulLink: 'Redirect Commander damage to an adjacent Undead ally until next turn.',
  Curse: 'Deal 1 damage at the end of the target turn for 3 turns.',
  BloodDrain: 'Heal 1 HP after dealing attack damage.',
  Cleave: 'A melee attack also damages every adjacent enemy.',
};

export const UNIT_CODEX: Record<CodexUnitId, UnitCodexEntry> = {
  royalGuard: {
    role: 'Melee • Vanguard',
    tagline: 'A disciplined shield wall that anchors the Human line.',
    strongAgainst: ['Narrow approaches', 'Fragile melee', 'Assist formations'],
    weakAgainst: ['Ranged pressure', 'Heavy burst', 'Kiting'],
  },
  longbowRanger: {
    role: 'Ranged • Marksman',
    tagline: 'Long reach rewards careful positioning before the shot.',
    strongAgainst: ['Slow melee', 'Open lanes', 'Wounded targets'],
    weakAgainst: ['Fast divers', 'Forest cover', 'Forced movement'],
  },
  silverwingCavalry: {
    role: 'Flying • Shock Cavalry',
    tagline: 'Fast aerial pressure that can strike, then reposition.',
    strongAgainst: ['Backline units', 'Difficult terrain', 'Low retaliation'],
    weakAgainst: ['Heavy blockers', 'Durable retaliators', 'Focused burst'],
  },
  lightMage: {
    role: 'Caster • Chain Lightning',
    tagline: 'Punishes enemies who stand too close together.',
    strongAgainst: ['Clustered enemies', 'Fragile groups', 'Packed defenses'],
    weakAgainst: ['Isolated targets', 'Melee pressure', 'Spread formations'],
  },
  bannerCaptain: {
    role: 'Melee • Support',
    tagline: 'Keeps a formation alive through long, grinding fights.',
    strongAgainst: ['Attrition', 'Tight formations', 'Damaged allies'],
    weakAgainst: ['Focus fire', 'Isolation', 'Long-range picks'],
  },
  windAdept: {
    role: 'Ranged • Controller',
    tagline: 'Wins fights by moving the pieces before blades meet.',
    strongAgainst: ['Bad positioning', 'Choke points', 'Formation disruption'],
    weakAgainst: ['Direct duels', 'High durability', 'Focused ranged fire'],
  },
  skeletalInfantry: {
    role: 'Melee • Line Troop',
    tagline: 'Cheap bodies that hold ground and make allies hit harder.',
    strongAgainst: ['Choke points', 'Trading space', 'Assist formations'],
    weakAgainst: ['Ranged fire', 'Elite melee', 'Burst damage'],
  },
  boneArcher: {
    role: 'Ranged • Marksman',
    tagline: 'A patient archer that controls lanes from a safe distance.',
    strongAgainst: ['Slow melee', 'Open lanes', 'Wounded targets'],
    weakAgainst: ['Fast divers', 'Forest cover', 'Forced movement'],
  },
  necromancer: {
    role: 'Ranged • Attrition',
    tagline: 'Turns time and enemy casualties into an Undead advantage.',
    strongAgainst: ['Long fights', 'Low-HP targets', 'Static defenses'],
    weakAgainst: ['Fast pressure', 'Forced movement', 'Burst assassins'],
  },
  banshee: {
    role: 'Melee • Controller',
    tagline: 'A swift spirit that tears apart carefully built formations.',
    strongAgainst: ['Choke points', 'Support formations', 'Bad positioning'],
    weakAgainst: ['Direct brawls', 'Heavy retaliation', 'Focused fire'],
  },
  vampire: {
    role: 'Melee • Predator',
    tagline: 'A self-sustaining hunter built to finish vulnerable prey.',
    strongAgainst: ['Wounded enemies', 'Fragile ranged', 'Low-retaliation targets'],
    weakAgainst: ['Heavy blockers', 'Strong retaliation', 'Burst damage'],
  },
  wraith: {
    role: 'Melee • Skirmisher',
    tagline: 'Slips through blocking lines to threaten exposed backfields.',
    strongAgainst: ['Blocking lines', 'Backline units', 'Open flanks'],
    weakAgainst: ['Retaliators', 'Burst damage', 'Durable melee'],
  },
  graveKnight: {
    role: 'Melee • Juggernaut',
    tagline: 'A brutal line-holder that thrives inside crowded fights.',
    strongAgainst: ['Enemy clusters', 'Melee pushes', 'Choke points'],
    weakAgainst: ['Ranged kiting', 'Isolation', 'Mobile skirmishers'],
  },
};

const isUnitCard = (card: (typeof CARD_DEFINITIONS)[keyof typeof CARD_DEFINITIONS]): card is UnitCard =>
  card.type === 'unit';

export const getCodexUnitIds = (): CodexUnitId[] =>
  Object.values(CARD_DEFINITIONS)
    .filter(isUnitCard)
    .map((card) => card.unitId as CodexUnitId);

export const getCodexUnitsByFaction = (faction: Faction): CodexUnitId[] =>
  getCodexUnitIds().filter((id) => UNIT_DEFINITIONS[id].faction === faction);

export const getCodexUnitDefinition = (id: CodexUnitId): UnitDefinition => UNIT_DEFINITIONS[id];

export const mechanicDescription = (mechanic: Trait | Ability): string =>
  mechanic in TRAIT_DESCRIPTIONS
    ? TRAIT_DESCRIPTIONS[mechanic as Trait]
    : ABILITY_DESCRIPTIONS[mechanic as Ability];
