import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { PLANNER_V7_PROFILE, type PortfolioDoctrine } from './aiPlannerProfiles';
import { planPortfolioAiTurn } from './aiPlannerV3';

export type PlannerV7Doctrine = PortfolioDoctrine;
export const LIVE_AI_OPTIONS_V7: Required<AiSearchOptions> = PLANNER_V7_PROFILE.liveOptions;
export const getBrowserAiSearchOptions = (): Required<AiSearchOptions> => LIVE_AI_OPTIONS_V7;

export const planAiTurnV7 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan =>
  planPortfolioAiTurn(state, PLANNER_V7_PROFILE, overrides);
