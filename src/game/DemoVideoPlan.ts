import type { CardDefinitionId } from '../data/cards';
import type { GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import type { AiAction } from './ai';
import { createGameState } from './engine';

export const DEMO_VIDEO_PROFILE = {
  width: 1280,
  height: 720,
  frameRate: 30,
  videoBitsPerSecond: 8_000_000,
  minimumDurationSeconds: 18,
} as const;

export const DEMO_VIDEO_ACTIONS: readonly AiAction[] = [
  { kind: 'move', unitId: 'demo-human-commander', destination: { q: 7, r: 9 } },
  { kind: 'attack', unitId: 'demo-human-commander', targetId: 'demo-grave-knight' },
  { kind: 'move', unitId: 'demo-royal-guard', destination: { q: 10, r: 9 } },
  {
    kind: 'summon',
    handIndex: 0,
    cardId: 'silverwingCavalry',
    destination: { q: 9, r: 9 },
  },
  { kind: 'thunder', unitId: 'demo-thunder-mage', destination: { q: 10, r: 7 } },
];

const makeUnit = (
  id: string,
  definitionId: UnitDefinitionId,
  owner: PlayerId,
  q: number,
  r: number,
  hp?: number,
): UnitState => {
  const definition = definitionId === 'commander'
    ? owner === 1 ? UNIT_DEFINITIONS.humanCommander : UNIT_DEFINITIONS.undeadCommander
    : UNIT_DEFINITIONS[definitionId];
  return {
    id,
    definitionId,
    owner,
    hp: hp ?? definition.maxHp,
    coord: { q, r },
    exhausted: false,
    moved: false,
    attacked: false,
    movementSpent: 0,
    postAttackMoved: false,
    moveBonus: 0,
  };
};

export const createDemoVideoState = (): GameState => {
  const state = createGameState(() => 0.25);
  state.currentPlayer = 1;
  state.turnNumber = 7;
  state.players[1].mana = 10;
  state.players[1].hand = ['silverwingCavalry' satisfies CardDefinitionId];
  state.players[1].deck = [];
  state.players[1].discard = [];
  state.players[2].mana = 8;
  state.players[2].hand = [];
  state.players[2].deck = [];
  state.players[2].discard = [];
  state.countdown = null;
  state.winner = null;
  state.nextUnitId = 100;

  for (const site of state.sites) {
    if (site.id === 'fort-south' || site.id === 'well-southeast') site.owner = 1;
    if (site.id === 'fort-north' || site.id === 'well-northeast') site.owner = 2;
  }

  state.units = [
    makeUnit('demo-human-commander', 'commander', 1, 6, 8),
    makeUnit('demo-royal-guard', 'royalGuard', 1, 9, 9),
    makeUnit('demo-thunder-mage', 'lightMage', 1, 10, 5),
    makeUnit('demo-longbow', 'longbowRanger', 1, 5, 8),
    makeUnit('demo-grave-knight', 'graveKnight', 2, 8, 9, 4),
    makeUnit('demo-bone-archer', 'boneArcher', 2, 10, 7),
    makeUnit('demo-skeleton', 'skeletalInfantry', 2, 11, 7),
    makeUnit('demo-necromancer', 'necromancer', 2, 11, 8),
    makeUnit('demo-undead-commander', 'commander', 2, 13, 7),
  ];

  return state;
};
