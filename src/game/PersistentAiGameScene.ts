import type { GameState } from '../data/types';
import { AiGameScene } from './AiGameScene';
import { LiveBattleLogRecorder, type LiveBattleLog } from './liveBattleLog';
import {
  alignCommanderRuntimeForLocalFaction,
  chooseNewGameSetup,
  configureFreshGameState,
  consumePendingNewGameSetup,
  savePendingNewGameSetup,
  startSideLabel,
} from './NewGameSetup';
import { clearSavedGameState, loadSavedMatch, saveMatch } from './save';

interface PersistentSceneInternals {
  state: GameState;
  message: string;
  renderAll: () => void;
}

export class PersistentAiGameScene extends AiGameScene {
  private restoredBattleLog: LiveBattleLog | null = null;
  private freshMatchStart = false;

  protected shouldPlayFreshMatchIntro(): boolean {
    return this.freshMatchStart;
  }

  protected override createLiveBattleLogRecorder(initialState: GameState): LiveBattleLogRecorder {
    const draft = this.restoredBattleLog;
    this.restoredBattleLog = null;
    return draft
      ? LiveBattleLogRecorder.resume(initialState, draft)
      : new LiveBattleLogRecorder(initialState);
  }

  create(): void {
    const scene = this as unknown as PersistentSceneInternals;
    const saved = loadSavedMatch();
    const pendingSetup = saved ? null : consumePendingNewGameSetup();
    this.freshMatchStart = !saved;

    if (saved) {
      scene.state = saved.state;
      this.restoredBattleLog = saved.battleLog;
      alignCommanderRuntimeForLocalFaction(saved.state.players[1].faction);
      scene.message = `Saved match resumed on turn ${saved.state.turnNumber}.`;
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
    let persistedLogRevision = -1;
    const persist = (): void => {
      if (!persistenceEnabled || this.isLiveBattleLogActionInProgress()) return;
      if (scene.state.winner) clearSavedGameState();
      else {
        const revision = this.liveBattleLogRevision();
        if (revision === persistedLogRevision) return;
        if (saveMatch(scene.state, this.createLiveBattleLogDraft())) persistedLogRevision = revision;
      }
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
