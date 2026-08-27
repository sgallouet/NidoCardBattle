import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { PLANNER_V5_PROFILE, type PortfolioDoctrine } from './aiPlannerProfiles';
import { planPortfolioAiTurn } from './aiPlannerV3';

export type PlannerV5Doctrine = PortfolioDoctrine;
export const LIVE_AI_OPTIONS_V5: Required<AiSearchOptions> = PLANNER_V5_PROFILE.liveOptions;

export const planAiTurnV5 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan =>
  planPortfolioAiTurn(state, PLANNER_V5_PROFILE, overrides);
