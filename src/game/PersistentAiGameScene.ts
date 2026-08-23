import type { GameState } from '../data/types';
import { AiGameScene } from './AiGameScene';
import { MAX_MANA } from './engine';
import {
  alignCommanderRuntimeForLocalFaction,
  chooseNewGameSetup,
  configureFreshGameState,
  consumePendingNewGameSetup,
  savePendingNewGameSetup,
  startSideLabel,
} from './NewGameSetup';
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
    const pendingSetup = saved ? null : consumePendingNewGameSetup();

    if (saved) {
      for (const playerId of [1, 2] as const) {
        saved.players[playerId].mana = Math.min(MAX_MANA, Math.max(0, saved.players[playerId].mana));
      }
      scene.state = saved;
      alignCommanderRuntimeForLocalFaction(saved.players[1].faction);
      scene.message = `Saved match resumed on turn ${saved.turnNumber}.`;
    } else if (pendingSetup) {
      configureFreshGameState(scene.state, pendingSetup);
      const factionName = pendingSetup.faction === 'human' ? 'Human' : 'Undead';
      scene.message = `${factionName} deployed at the ${startSideLabel(pendingSetup.side)} start.`;
    } else {
      alignCommanderRuntimeForLocalFaction(scene.state.players[1].faction);
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
      void chooseNewGameSetup().then((setup) => {
        if (!setup) return;
        if (!savePendingNewGameSetup(setup)) {
          window.alert('Unable to start a new game because browser session storage is unavailable.');
          return;
        }
        persistenceEnabled = false;
        clearSavedGameState();
        window.location.reload();
      });
    };
    newGameButton?.addEventListener('click', startNewGame);

    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', flush);
      newGameButton?.removeEventListener('click', startNewGame);
    });
  }
}
