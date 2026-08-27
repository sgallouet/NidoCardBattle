import type { GameState } from '../data/types';
import type { AiPlan, AiSearchOptions } from './ai';
import { PLANNER_V4_PROFILE, type PortfolioDoctrine } from './aiPlannerProfiles';
import { planPortfolioAiTurn } from './aiPlannerV3';

export type PlannerV4Doctrine = PortfolioDoctrine;
export const LIVE_AI_OPTIONS_V4: Required<AiSearchOptions> = PLANNER_V4_PROFILE.liveOptions;

/** One common mobile-safe intelligence budget for every live-game device. */
export const getBrowserAiSearchOptions = (): Required<AiSearchOptions> => LIVE_AI_OPTIONS_V4;

export const planAiTurnV4 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan =>
  planPortfolioAiTurn(state, PLANNER_V4_PROFILE, overrides);
