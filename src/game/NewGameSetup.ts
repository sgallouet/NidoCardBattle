import { STARTING_SIDE_SLOTS } from '../data/map';
import { setSiteOwnerFactions } from '../data/siteArt';
import type { Faction, GameState, PlayerId } from '../data/types';
import { UNIT_ART } from '../data/unitArt';
import { UNIT_DEFINITIONS } from '../data/units';
import './NewGameSetup.css';
import { setStartingFaction } from './engine';
import { openBattleSetup } from './NewBattlePresentation';

export type StartSide = keyof typeof STARTING_SIDE_SLOTS;

export interface NewGameSetup {
  faction: Faction;
  aiFaction?: Faction;
  side: StartSide;
}

const PENDING_SETUP_KEY = 'nidocardbattle.pendingNewGameSetup';
const BASE_HUMAN_COMMANDER = UNIT_DEFINITIONS.humanCommander;
const BASE_UNDEAD_COMMANDER = UNIT_DEFINITIONS.undeadCommander;
const BASE_HUMAN_COMMANDER_ART = UNIT_ART.humanCommander;
const BASE_UNDEAD_COMMANDER_ART = UNIT_ART.undeadCommander;
let activeDialog: Promise<NewGameSetup | null> | null = null;

export const oppositeStartSide = (side: StartSide): StartSide =>
  side === 'bottomLeft' ? 'upperRight' : 'bottomLeft';

export const startSideLabel = (side: StartSide): string =>
  side === 'bottomLeft' ? 'bottom-left' : 'upper-right';

export const randomStartSide = (random: () => number = Math.random): StartSide =>
  random() < 0.5 ? 'bottomLeft' : 'upperRight';

export const alignCommanderRuntimeForLocalFaction = (faction: Faction, aiFaction: Faction = faction === 'human' ? 'undead' : 'human'): void => {
  const localIsHuman = faction === 'human';
  UNIT_DEFINITIONS.humanCommander = localIsHuman ? BASE_HUMAN_COMMANDER : BASE_UNDEAD_COMMANDER;
  UNIT_DEFINITIONS.undeadCommander = aiFaction === 'undead' ? BASE_UNDEAD_COMMANDER : BASE_HUMAN_COMMANDER;
  UNIT_ART.humanCommander = localIsHuman ? BASE_HUMAN_COMMANDER_ART : BASE_UNDEAD_COMMANDER_ART;
  UNIT_ART.undeadCommander = aiFaction === 'undead' ? BASE_UNDEAD_COMMANDER_ART : BASE_HUMAN_COMMANDER_ART;
  setSiteOwnerFactions(faction, aiFaction);
};

const swapFactionPayloads = (state: GameState): void => {
  const player1 = state.players[1];
  const player2 = state.players[2];
  [player1.faction, player2.faction] = [player2.faction, player1.faction];
  [player1.deck, player2.deck] = [player2.deck, player1.deck];
  [player1.hand, player2.hand] = [player2.hand, player1.hand];
  [player1.discard, player2.discard] = [player2.discard, player1.discard];
  for (const unit of state.units) unit.owner = unit.owner === 1 ? 2 : 1;
};

const placeStartingArmy = (state: GameState, playerId: PlayerId, side: StartSide): void => {
  const faction = state.players[playerId].faction;
  const slots = STARTING_SIDE_SLOTS[side];
  const frontlineId = faction === 'human' ? 'royalGuard' : 'skeletalInfantry';
  const supportId = faction === 'human' ? 'longbowRanger' : 'necromancer';

  for (const unit of state.units.filter((candidate) => candidate.owner === playerId)) {
    if (unit.definitionId === 'commander') unit.coord = { ...slots.commander };
    else if (unit.definitionId === frontlineId) unit.coord = { ...slots.frontline };
    else if (unit.definitionId === supportId) unit.coord = { ...slots.support };
  }
};

export const configureFreshGameState = (state: GameState, setup: NewGameSetup): void => {
  if (state.players[1].faction !== setup.faction) swapFactionPayloads(state);

  if (setup.aiFaction && state.players[2].faction !== setup.aiFaction) {
    setStartingFaction(state, 2, setup.aiFaction);
  }
  const opponentSide = oppositeStartSide(setup.side);
  placeStartingArmy(state, 1, setup.side);
  placeStartingArmy(state, 2, opponentSide);

  const localKeepId = STARTING_SIDE_SLOTS[setup.side].keepId;
  const opponentKeepId = STARTING_SIDE_SLOTS[opponentSide].keepId;
  for (const site of state.sites) {
    if (site.type !== 'keep') continue;
    if (site.id === localKeepId) site.owner = 1;
    else if (site.id === opponentKeepId) site.owner = 2;
  }

  alignCommanderRuntimeForLocalFaction(setup.faction, state.players[2].faction);
};

export const savePendingNewGameSetup = (setup: NewGameSetup): boolean => {
  try {
    window.sessionStorage.setItem(PENDING_SETUP_KEY, JSON.stringify(setup));
    return true;
  } catch {
    return false;
  }
};

export const consumePendingNewGameSetup = (): NewGameSetup | null => {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SETUP_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_SETUP_KEY);
    const parsed = JSON.parse(raw) as Partial<NewGameSetup>;
    const validFaction = parsed.faction === 'human' || parsed.faction === 'undead';
    const validSide = parsed.side === 'bottomLeft' || parsed.side === 'upperRight';
    const validAi = parsed.aiFaction === undefined || parsed.aiFaction === 'human' || parsed.aiFaction === 'undead';
    return validFaction && validSide && validAi
      ? { faction: parsed.faction as Faction, side: parsed.side as StartSide, aiFaction: parsed.aiFaction }
      : null;
  } catch {
    return null;
  }
};

export const chooseNewGameSetup = (): Promise<NewGameSetup | null> => {
  if (activeDialog) return activeDialog;
  activeDialog = openBattleSetup().then((selection) => {
    activeDialog = null;
    return selection ? { ...selection, side: randomStartSide() } : null;
  });
  return activeDialog;
};
