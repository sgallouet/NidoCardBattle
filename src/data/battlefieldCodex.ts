import { RUIN_ART, TOWN_ART } from './mapDecorationArt';
import { garrisonArtFor, siteArtFor } from './siteArt';
import {
  BRIDGE_TERRAIN_ART,
  FOREST_TERRAIN_ART,
  HILL_TERRAIN_ART,
  MOUNTAIN_TERRAIN_ART,
  PLAIN_TERRAIN_ART,
  SEA_TERRAIN_ART,
} from './terrainArt';

export type BattlefieldCodexId =
  | 'plain'
  | 'forest'
  | 'hill'
  | 'water'
  | 'bridge'
  | 'cliff'
  | 'mountain'
  | 'keep'
  | 'fort'
  | 'garrison'
  | 'well'
  | 'village'
  | 'ruin';

export type BattlefieldCodexGroup = 'terrain' | 'sites';

export interface BattlefieldArtLayer {
  url: string;
  className?: string;
}

export interface BattlefieldCodexEntry {
  id: BattlefieldCodexId;
  group: BattlefieldCodexGroup;
  name: string;
  kind: string;
  tagline: string;
  rules: readonly string[];
  bestFor: readonly string[];
  beware: readonly string[];
  art: readonly BattlefieldArtLayer[];
  glyph?: string;
}

const neutralKeep = siteArtFor('keep', null);
const neutralFort = siteArtFor('fort', null);
const neutralWell = siteArtFor('well', null);
const neutralGarrison = garrisonArtFor(null);

export const BATTLEFIELD_CODEX: Record<BattlefieldCodexId, BattlefieldCodexEntry> = {
  plain: {
    id: 'plain', group: 'terrain', name: 'Plain', kind: 'Open Ground',
    tagline: 'Reliable ground with no hidden cost or protection.',
    rules: ['Normal movement cost.', 'No attack or defense modifier.'],
    bestFor: ['Fast repositioning', 'Clean attack lanes'],
    beware: ['Little natural protection'],
    art: [{ url: PLAIN_TERRAIN_ART.url, className: 'is-hex' }],
  },
  forest: {
    id: 'forest', group: 'terrain', name: 'Forest', kind: 'Defensive Terrain',
    tagline: 'Dense cover slows an advance and blunts incoming arrows.',
    rules: ['Non-Flying movement is slowed by 30%.', 'Ranged damage into Forest is reduced by 30%.'],
    bestFor: ['Protecting fragile units', 'Stalling ranged pressure'],
    beware: ['Slower ground movement'],
    art: [
      { url: FOREST_TERRAIN_ART.ground.url, className: 'is-hex' },
      { url: FOREST_TERRAIN_ART.overlay.url, className: 'is-hex is-canopy' },
    ],
  },
  hill: {
    id: 'hill', group: 'terrain', name: 'Hill', kind: 'High Ground',
    tagline: 'A commanding perch for ranged formations.',
    rules: ['Normal movement cost.', 'Ranged units gain +1 Range while standing here.'],
    bestFor: ['Archers and casters', 'Controlling open lanes'],
    beware: ['Highly contested positions'],
    art: [
      { url: PLAIN_TERRAIN_ART.url, className: 'is-hex' },
      { url: HILL_TERRAIN_ART.url, className: 'is-overlay' },
    ],
  },
  water: {
    id: 'water', group: 'terrain', name: 'Water', kind: 'Sea',
    tagline: 'Deep water divides armies and reshapes the battle line.',
    rules: ['Ground units cannot enter.', 'Flying units can cross it.'],
    bestFor: ['Natural barriers', 'Protecting flanks'],
    beware: ['Bridges create sudden crossings'],
    art: [{ url: SEA_TERRAIN_ART.bases[0].url, className: 'is-hex' }],
  },
  bridge: {
    id: 'bridge', group: 'terrain', name: 'Bridge', kind: 'Crossing',
    tagline: 'A narrow route that turns impassable water into open ground.',
    rules: ['Passable with normal movement.', 'Built over Water by the Build Bridge tactic.'],
    bestFor: ['Opening new routes', 'Surprise flanks'],
    beware: ['Predictable choke points'],
    art: [
      { url: SEA_TERRAIN_ART.bases[1].url, className: 'is-hex' },
      { url: BRIDGE_TERRAIN_ART.url, className: 'is-bridge' },
    ],
  },
  cliff: {
    id: 'cliff', group: 'terrain', name: 'Cliff', kind: 'Broken Ground',
    tagline: 'Sheer rock blocks the march of ordinary troops.',
    rules: ['Ground units cannot enter.', 'Flying units can cross it.'],
    bestFor: ['Natural choke points', 'Securing a flank'],
    beware: ['Flying units ignore the barrier'],
    art: [], glyph: '▲',
  },
  mountain: {
    id: 'mountain', group: 'terrain', name: 'Mountain', kind: 'Impassable',
    tagline: 'An absolute wall of stone, even to flying units.',
    rules: ['No unit can enter or cross.', 'Use it as permanent map geometry.'],
    bestFor: ['Anchoring defenses', 'Shaping lanes'],
    beware: ['Routes around it are predictable'],
    art: [{ url: MOUNTAIN_TERRAIN_ART.url, className: 'is-hex' }],
  },
  keep: {
    id: 'keep', group: 'sites', name: 'Keep', kind: 'Strategic Site',
    tagline: 'The heart of a realm and a dependable source of reinforcements.',
    rules: ['Capture by ending your turn on it.', 'Controlled Keeps are summon points.', 'From your second turn onward, each controlled Keep grants +1 Mana at turn start.'],
    bestFor: ['Army deployment', 'Long-term mana income'],
    beware: ['Losing it hurts both tempo and economy'],
    art: [{ url: neutralKeep.url, className: 'is-site' }],
  },
  fort: {
    id: 'fort', group: 'sites', name: 'Fort', kind: 'Strategic Site',
    tagline: 'A fortified foothold that expands where your army can arrive.',
    rules: ['Capture by ending your turn on it.', 'Controlled Forts are summon points.', 'A Fort controls its linked Garrisons.'],
    bestFor: ['Forward deployment', 'Controlling nearby Garrisons'],
    beware: ['Enemy occupation can flip the network'],
    art: [{ url: neutralFort.url, className: 'is-site is-large-site' }],
  },
  garrison: {
    id: 'garrison', group: 'sites', name: 'Garrison', kind: 'Linked Deployment',
    tagline: 'An outlying deployment ring supplied by its parent Fort.',
    rules: ['Ownership follows the linked Fort.', 'An empty controlled Garrison is a valid summon point.'],
    bestFor: ['Wide reinforcement angles', 'Holding territory'],
    beware: ['Falls with its linked Fort'],
    art: [{ url: neutralGarrison.url, className: 'is-site' }],
  },
  well: {
    id: 'well', group: 'sites', name: 'Mana Well', kind: 'Strategic Site',
    tagline: 'A slow pulse of arcane power worth fighting over.',
    rules: ['Capture by ending your turn on it.', 'Every third turn you take, each controlled Well grants +2 Mana.'],
    bestFor: ['Burst turns', 'Long games'],
    beware: ['Income arrives only on turns 3, 6, 9…'],
    art: [{ url: neutralWell.url, className: 'is-site is-small-site' }],
  },
  village: {
    id: 'village', group: 'sites', name: 'Village', kind: 'Healing Location',
    tagline: 'A quiet refuge where battered troops can recover.',
    rules: ['A unit standing here heals 1 HP at the start of its owner’s turn.'],
    bestFor: ['Sustaining wounded units', 'Defensive staging'],
    beware: ['The healing requires occupying the tile'],
    art: [{ url: TOWN_ART.url, className: 'is-site' }],
  },
  ruin: {
    id: 'ruin', group: 'sites', name: 'Ruin', kind: 'Mana Location',
    tagline: 'Ancient remnants still leak enough power to reward an occupier.',
    rules: ['A player with a unit standing here gains +1 Mana at turn start.'],
    bestFor: ['Early mana income', 'Rewarding map control'],
    beware: ['Income stops when the tile is vacated'],
    art: [{ url: RUIN_ART.url, className: 'is-site' }],
  },
};

export const TERRAIN_CODEX_IDS: readonly BattlefieldCodexId[] = [
  'plain', 'forest', 'hill', 'water', 'bridge', 'cliff', 'mountain',
];

export const SITE_CODEX_IDS: readonly BattlefieldCodexId[] = [
  'keep', 'fort', 'garrison', 'well', 'village', 'ruin',
];
