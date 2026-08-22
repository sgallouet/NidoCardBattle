import type { GameState } from '../data/types';
import { runSmartAiTurn } from './ai';
import { GameScene } from './GameScene';

interface GameSceneInternals {
  state: GameState;
  message: string;
  animationInProgress: boolean;
  clearInteraction: () => void;
  renderAll: () => void;
}

export class AiGameScene extends GameScene {
  private aiTurnInProgress = false;

  update(): void {
    const scene = this as unknown as GameSceneInternals;
    if (this.aiTurnInProgress
      || scene.animationInProgress
      || scene.state.winner
      || scene.state.currentPlayer !== 2) return;

    this.aiTurnInProgress = true;
    try {
      const result = runSmartAiTurn(scene.state);
      scene.clearInteraction();
      const meaningfulActions = result.actions.filter((action) => !action.startsWith('Player 1'));
      scene.message = scene.state.winner === 2
        ? 'The Undead Commander survived the countdown. Enemy wins.'
        : meaningfulActions.length > 0
          ? `Enemy turn complete: ${meaningfulActions.at(-1)}`
          : 'Enemy turn complete.';
      scene.renderAll();
    } finally {
      this.aiTurnInProgress = false;
    }
  }
}
