import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { PLANNER_V6_PROFILE, type PortfolioDoctrine } from './aiPlannerProfiles';
import { planPortfolioAiTurn } from './aiPlannerV3';

export type PlannerV6Doctrine = PortfolioDoctrine;
export const LIVE_AI_OPTIONS_V6: Required<AiSearchOptions> = PLANNER_V6_PROFILE.liveOptions;

/** The single live browser profile: one second across strategy and tactical response. */
export const getBrowserAiSearchOptions = (): Required<AiSearchOptions> => LIVE_AI_OPTIONS_V6;

export const planAiTurnV6 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan =>
  planPortfolioAiTurn(state, PLANNER_V6_PROFILE, overrides);
