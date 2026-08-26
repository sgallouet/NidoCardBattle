import type { GameState, PlayerId } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { planSmartAiTurnV2 } from './aiPlannerV2';

const opponentOf = (player: PlayerId): PlayerId => player === 1 ? 2 : 1;

/**
 * Planner V2's live entry point intentionally targets Player 2. Head-to-head simulation
 * needs the exact same planner on either side, so Player 1 states are mirrored to Player 2.
 * GameAction itself contains no PlayerId, therefore the returned action sequence can be
 * replayed directly against the original state.
 */
const mirrorPlayers = (state: GameState): GameState => {
  const mirrored = structuredClone(state);
  const player1 = mirrored.players[1];
  const player2 = mirrored.players[2];
  mirrored.players = {
    1: { ...player2, id: 1 },
    2: { ...player1, id: 2 },
  };
  mirrored.currentPlayer = opponentOf(mirrored.currentPlayer);
  if (mirrored.winner) mirrored.winner = opponentOf(mirrored.winner);
  if (mirrored.countdown) mirrored.countdown.player = opponentOf(mirrored.countdown.player);

  for (const unit of mirrored.units) {
    unit.owner = opponentOf(unit.owner);
    if (unit.curses) {
      for (const curse of unit.curses) curse.sourcePlayer = opponentOf(curse.sourcePlayer);
    }
  }
  for (const site of mirrored.sites) {
    if (site.owner) site.owner = opponentOf(site.owner);
    if (site.initialOwner) site.initialOwner = opponentOf(site.initialOwner);
  }
  for (const pending of mirrored.pendingManaWells) pending.owner = opponentOf(pending.owner);
  for (const effect of mirrored.tileEffects) effect.sourcePlayer = opponentOf(effect.sourcePlayer);
  return mirrored;
};

export const planAiTurnV2AnyPlayer = (
  state: GameState,
  overrides: AiSearchOptions = {},
): AiPlan => state.currentPlayer === 2
  ? planSmartAiTurnV2(state, overrides)
  : planSmartAiTurnV2(mirrorPlayers(state), overrides);
