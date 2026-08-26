import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { LIVE_AI_OPTIONS_V2, planSmartAiTurnV2 } from './aiPlannerV2';

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
  // The scene still sends the legacy common profile for compatibility. Never let those old
  // 35/20 ms clocks collapse the repaired planner back into one-action behavior.
  const liveOptions: AiSearchOptions = {
    ...options,
    strategyMaxNodes: Math.max(options.strategyMaxNodes ?? 0, LIVE_AI_OPTIONS_V2.strategyMaxNodes),
    strategyMaxPlanningMs: Math.max(options.strategyMaxPlanningMs ?? 0, LIVE_AI_OPTIONS_V2.strategyMaxPlanningMs),
    tacticalMaxNodes: Math.max(options.tacticalMaxNodes ?? 0, LIVE_AI_OPTIONS_V2.tacticalMaxNodes),
    tacticalMaxPlanningMs: Math.max(options.tacticalMaxPlanningMs ?? 0, LIVE_AI_OPTIONS_V2.tacticalMaxPlanningMs),
    beamWidth: LIVE_AI_OPTIONS_V2.beamWidth,
    maxDepth: LIVE_AI_OPTIONS_V2.maxDepth,
    candidatePlans: LIVE_AI_OPTIONS_V2.candidatePlans,
    responseBeamWidth: LIVE_AI_OPTIONS_V2.responseBeamWidth,
    responseDepth: LIVE_AI_OPTIONS_V2.responseDepth,
  };
  const plan = planSmartAiTurnV2(state, liveOptions);
  workerScope.postMessage({ requestId, plan });
};

export {};
