import type { GameState } from '../data/types';
import {
  applyAiAction,
  COMMON_AI_OPTIONS,
  runSmartAiTurn,
  type AiPlan,
} from './ai';
import { endTurn } from './engine';
import { GameScene } from './GameScene';

interface GameSceneInternals {
  state: GameState;
  message: string;
  animationInProgress: boolean;
  clearInteraction: () => void;
  renderAll: () => void;
}

interface AiWorkerResponse {
  requestId: number;
  plan: AiPlan;
}

export class AiGameScene extends GameScene {
  private aiTurnInProgress = false;
  private aiWorker: Worker | null = null;
  private aiRequestId = 0;

  create(): void {
    super.create();
    if (typeof Worker !== 'undefined') {
      this.aiWorker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (event: MessageEvent<AiWorkerResponse>) => this.finishWorkerPlan(event.data);
      this.aiWorker.onerror = () => this.fallbackToMainThread();
      this.events.once('shutdown', () => this.aiWorker?.terminate());
    }
  }

  update(): void {
    const scene = this as unknown as GameSceneInternals;
    if (this.aiTurnInProgress
      || scene.animationInProgress
      || scene.state.winner
      || scene.state.currentPlayer !== 2) return;

    this.aiTurnInProgress = true;
    scene.animationInProgress = true;
    scene.clearInteraction();
    scene.message = 'Enemy thinking…';
    scene.renderAll();
    document.querySelector<HTMLElement>('#hand')?.replaceChildren();

    if (!this.aiWorker) {
      this.fallbackToMainThread();
      return;
    }

    this.aiRequestId += 1;
    this.aiWorker.postMessage({
      requestId: this.aiRequestId,
      state: scene.state,
      options: COMMON_AI_OPTIONS,
    });
  }

  private finishWorkerPlan(response: AiWorkerResponse): void {
    if (response.requestId !== this.aiRequestId) return;
    const scene = this as unknown as GameSceneInternals;
    if (scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }

    const messages: string[] = [];
    for (const action of response.plan.actions) {
      if (scene.state.winner || scene.state.currentPlayer !== 2) break;
      const result = applyAiAction(scene.state, action);
      if (!result.ok) {
        messages.push(`AI plan stopped: ${result.message}`);
        break;
      }
      messages.push(result.message);
    }

    if (!scene.state.winner && scene.state.currentPlayer === 2) {
      const result = endTurn(scene.state);
      messages.push(result.message);
    }

    scene.message = scene.state.winner === 2
      ? 'The Undead Commander survived the countdown. Enemy wins.'
      : messages.length > 0
        ? `Enemy turn complete: ${messages.at(-1)}`
        : 'Enemy turn complete.';
    this.finishAiUi(scene);
  }

  private fallbackToMainThread(): void {
    const scene = this as unknown as GameSceneInternals;
    if (!this.aiTurnInProgress || scene.state.winner || scene.state.currentPlayer !== 2) {
      this.finishAiUi(scene);
      return;
    }

    this.aiWorker?.terminate();
    this.aiWorker = null;
    const result = runSmartAiTurn(scene.state, Math.random, COMMON_AI_OPTIONS);
    const meaningfulActions = result.actions.filter((action) => !action.startsWith('Player 1'));
    scene.message = scene.state.winner === 2
      ? 'The Undead Commander survived the countdown. Enemy wins.'
      : meaningfulActions.length > 0
        ? `Enemy turn complete: ${meaningfulActions.at(-1)}`
        : 'Enemy turn complete.';
    this.finishAiUi(scene);
  }

  private finishAiUi(scene: GameSceneInternals): void {
    scene.animationInProgress = false;
    scene.clearInteraction();
    scene.renderAll();
    this.aiTurnInProgress = false;
  }
}