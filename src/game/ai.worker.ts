import type { GameState } from '../data/types';
import { planSmartAiTurn, type AiPlan, type AiSearchOptions } from './ai';

interface AiWorkerRequest {
  requestId: number;
  state: GameState;
  options: AiSearchOptions;
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
  const { requestId, state, options } = event.data;
  const plan = planSmartAiTurn(state, options);
  workerScope.postMessage({ requestId, plan });
};

export {};
