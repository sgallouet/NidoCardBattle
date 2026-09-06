import type { GameState } from '../data/types';
import type { AiPlan } from './ai';
import { planLiveAiTurn } from './aiLive';

interface AiWorkerRequest {
  requestId: number;
  state: GameState;
}

interface AiWorkerResponse {
  requestId: number;
  plan: AiPlan;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<AiWorkerRequest>) => void) | null;
  postMessage: (message: AiWorkerResponse) => void;
}

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event: MessageEvent<AiWorkerRequest>): void => {
  const { requestId, state } = event.data;
  const plan = planLiveAiTurn(state);
  workerScope.postMessage({ requestId, plan });
};

export {};
