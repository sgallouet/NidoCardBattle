import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { LIVE_AI_OPTIONS_V6, planAiTurnV6 } from './aiPlannerV6';

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
  // The scene sends the V6 live profile. Keep those node/time floors if a caller posts a
  // smaller compatibility budget.
  const liveOptions: AiSearchOptions = {
    ...options,
    strategyMaxNodes: Math.max(options.strategyMaxNodes ?? 0, LIVE_AI_OPTIONS_V6.strategyMaxNodes),
    strategyMaxPlanningMs: Math.max(options.strategyMaxPlanningMs ?? 0, LIVE_AI_OPTIONS_V6.strategyMaxPlanningMs),
    tacticalMaxNodes: Math.max(options.tacticalMaxNodes ?? 0, LIVE_AI_OPTIONS_V6.tacticalMaxNodes),
    tacticalMaxPlanningMs: Math.max(options.tacticalMaxPlanningMs ?? 0, LIVE_AI_OPTIONS_V6.tacticalMaxPlanningMs),
    beamWidth: LIVE_AI_OPTIONS_V6.beamWidth,
    maxDepth: LIVE_AI_OPTIONS_V6.maxDepth,
    candidatePlans: LIVE_AI_OPTIONS_V6.candidatePlans,
    responseBeamWidth: LIVE_AI_OPTIONS_V6.responseBeamWidth,
    responseDepth: LIVE_AI_OPTIONS_V6.responseDepth,
  };
  const plan = planAiTurnV6(state, liveOptions);
  workerScope.postMessage({ requestId, plan });
};

export {};
