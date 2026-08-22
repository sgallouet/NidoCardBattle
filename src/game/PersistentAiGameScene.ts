import type { GameState } from '../data/types';
import { AiGameScene } from './AiGameScene';
import { DEBUG_START_MANA } from './engine';
import { clearSavedGameState, loadSavedGameState, saveGameState } from './save';

interface PersistentSceneInternals {
  state: GameState;
  message: string;
  renderAll: () => void;
}

export class PersistentAiGameScene extends AiGameScene {
  create(): void {
    const scene = this as unknown as PersistentSceneInternals;
    const saved = loadSavedGameState();
    if (saved) {
      saved.players[saved.currentPlayer].mana = DEBUG_START_MANA;
      scene.state = saved;
      scene.message = `Saved match resumed on turn ${saved.turnNumber}.`;
    }

    super.create();

    const originalRenderAll = scene.renderAll.bind(this);
    let persistenceEnabled = true;
    const persist = (): void => {
      if (!persistenceEnabled) return;
      if (scene.state.winner) clearSavedGameState();
      else saveGameState(scene.state);
    };

    scene.renderAll = () => {
      originalRenderAll();
      persist();
    };

    persist();
    const flush = (): void => persist();
    window.addEventListener('pagehide', flush);

    const newGameButton = document.querySelector<HTMLButtonElement>('#new-game-button');
    const startNewGame = (): void => {
      if (!window.confirm('Start a new game? Your current match will be discarded.')) return;
      persistenceEnabled = false;
      clearSavedGameState();
      window.location.reload();
    };
    newGameButton?.addEventListener('click', startNewGame);

    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', flush);
      newGameButton?.removeEventListener('click', startNewGame);
    });
  }
}
