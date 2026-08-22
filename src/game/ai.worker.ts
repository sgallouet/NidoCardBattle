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

self.onmessage = (event: MessageEvent<AiWorkerRequest>): void => {
  const { requestId, state, options } = event.data;
  const plan = planSmartAiTurn(state, options);
  const response: AiWorkerResponse = { requestId, plan };
  self.postMessage(response);
};

export {};
