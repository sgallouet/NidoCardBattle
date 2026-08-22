import type { GameState } from '../data/types';
import { AiGameScene } from './AiGameScene';
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
      scene.state = saved;
      scene.message = `Saved match resumed on turn ${saved.turnNumber}.`;
    }

    super.create();

    const originalRenderAll = scene.renderAll.bind(this);
    const persist = (): void => {
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
    this.events.once('shutdown', () => window.removeEventListener('pagehide', flush));
  }
}
