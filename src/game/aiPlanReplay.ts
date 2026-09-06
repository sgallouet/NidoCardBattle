import type { GameState, PlayerId } from '../data/types';
import type { AiPlan } from './ai';
import { applyGameAction } from './actions';

const replayKey = (state: GameState, actor: PlayerId): string => JSON.stringify({
  ...state,
  players: Object.fromEntries(([1, 2] as const).map((player) => [player, {
    ...state.players[player], deck: state.players[player].deck.length,
    hand: player === actor ? state.players[player].hand : state.players[player].hand.length,
  }])),
});

export const prepareAiContinuation = (state: GameState, actions: AiPlan['actions']): string[] => {
  const expected = structuredClone(state);
  return actions.map((action) => {
    const key = replayKey(expected, state.currentPlayer);
    const result = applyGameAction(expected, action);
    if (!result.ok) throw new Error(`Invalid AI continuation: ${result.message}`);
    return key;
  });
};

export const validateAiContinuation = (state: GameState, plan: AiPlan, index: number): void => {
  if (plan.expectedStates && plan.expectedStates[index] !== replayKey(state, state.currentPlayer)) {
    throw new Error(`AI continuation diverged before action ${index + 1}.`);
  }
};
