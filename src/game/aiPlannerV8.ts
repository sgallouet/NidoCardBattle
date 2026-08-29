import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { PLANNER_V8_PROFILE, type PortfolioDoctrine } from './aiPlannerProfiles';
import { planPortfolioAiTurn } from './aiPlannerV3';

export type PlannerV8Doctrine = PortfolioDoctrine;
export const LIVE_AI_OPTIONS_V8: Required<AiSearchOptions> = PLANNER_V8_PROFILE.liveOptions;
export const getBrowserAiSearchOptions = (): Required<AiSearchOptions> => LIVE_AI_OPTIONS_V8;

export const planAiTurnV8 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan =>
  planPortfolioAiTurn(state, PLANNER_V8_PROFILE, overrides);
