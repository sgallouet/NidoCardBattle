import { COMMON_AI_OPTIONS, type AiSearchOptions } from './ai';

export type PortfolioDoctrine =
  | 'assassinate'
  | 'deployment-tempo'
  | 'objective-rush'
  | 'attrition'
  | 'fortress'
  | 'mana-engine'
  | 'mobility-flank'
  | 'ability-combo'
  | 'balanced';

export const PORTFOLIO_DOCTRINES: readonly PortfolioDoctrine[] = [
  'assassinate',
  'deployment-tempo',
  'objective-rush',
  'attrition',
  'fortress',
  'mana-engine',
  'mobility-flank',
  'ability-combo',
  'balanced',
] as const;

export interface DoctrineStateWeights {
  assassinate: { enemyCommanderDamage: number; ownCommanderDamage: number };
  deploymentTempo: { manaSpent: number; deploymentGain: number; unitGain: number };
  objectiveRush: { siteSwing: number; threatenedCapture: number };
  attrition: { materialSwing: number; exposureImprovement: number };
  fortress: { ownCommanderDamage: number; incomingDamage: number; commanderScreen: number };
  manaEngine: { wellGain: number; pendingWell: number; manaSpent: number };
  mobilityFlank: { siteSwing: number; moveAction: number };
  abilityCombo: { abilityAction: number; tacticAction: number };
  balanced: { materialSwing: number; siteSwing: number; manaSpent: number; action: number };
}

export interface PortfolioHabitWeights {
  profaneWellAction: number;
  unusedProfaneWellPenalty: number;
  pendingWell: number;
  unusedCursePenalty: number;
  curseCommanderAction: number;
  unthreatenedSoulLinkPenalty: number;
  unusedManaPlayablePenalty: number;
  commanderRetreatPenalty: number;
  invokeOnObjectiveBonus: number;
  extraBeastPenalty: number;
  expensiveSummonBonus: number;
  selfDisplaceCommanderPenalty: number;
  profaneWellInHandUrgency: number;
  captureWell: number;
  captureFort: number;
  hillRanged: number;
  villageHeal: number;
  siteApproach: number;
  mapControlPressure: number;
}

export interface PortfolioScoringProfile {
  outlook: number;
  urgency: number;
  action: number;
  tacticalScore: number;
  responseOutlook: number;
  blockedDeploymentPenalty: number;
  materialLossThreshold: number;
  materialLossDivisor: number;
  deploymentLossPenalty: number;
  doctrines: DoctrineStateWeights;
  habits: PortfolioHabitWeights;
}

export interface PortfolioSearchProfile {
  candidatesPerDoctrine: number;
  maxAuditedCandidates: number;
  adaptiveDoctrineBudgets: boolean;
  retainedActions: number;
  maxRetainedActions: number;
  expandedActionsPerNode: number;
  representActionKinds: boolean;
  responseMode: 'setups' | 'beam';
  responseActionsPerNode: number;
}

export interface PortfolioPlannerProfile {
  id: 'v3-portfolio' | 'v4-portfolio' | 'v5-portfolio' | 'v6-portfolio';
  liveOptions: Required<AiSearchOptions>;
  search: PortfolioSearchProfile;
  scoring: PortfolioScoringProfile;
}

const ZERO_HABITS: PortfolioHabitWeights = {
  profaneWellAction: 0,
  unusedProfaneWellPenalty: 0,
  pendingWell: 0,
  unusedCursePenalty: 0,
  curseCommanderAction: 0,
  unthreatenedSoulLinkPenalty: 0,
  unusedManaPlayablePenalty: 0,
  commanderRetreatPenalty: 0,
  invokeOnObjectiveBonus: 0,
  extraBeastPenalty: 0,
  expensiveSummonBonus: 0,
  selfDisplaceCommanderPenalty: 0,
  profaneWellInHandUrgency: 0,
  captureWell: 0,
  captureFort: 0,
  hillRanged: 0,
  villageHeal: 0,
  siteApproach: 0,
  mapControlPressure: 0,
};

const V3_SCORING: PortfolioScoringProfile = {
  outlook: 4,
  urgency: 10,
  action: 18,
  tacticalScore: 0,
  responseOutlook: 0,
  blockedDeploymentPenalty: 260,
  materialLossThreshold: 240,
  materialLossDivisor: 25,
  deploymentLossPenalty: 25,
  doctrines: {
    assassinate: { enemyCommanderDamage: 180, ownCommanderDamage: 120 },
    deploymentTempo: { manaSpent: 70, deploymentGain: 220, unitGain: 130 },
    objectiveRush: { siteSwing: 150, threatenedCapture: 70 },
    attrition: { materialSwing: 0.2, exposureImprovement: 0.125 },
    fortress: { ownCommanderDamage: 180, incomingDamage: 80, commanderScreen: 60 },
    manaEngine: { wellGain: 350, pendingWell: 160, manaSpent: 35 },
    mobilityFlank: { siteSwing: 90, moveAction: 45 },
    abilityCombo: { abilityAction: 130, tacticAction: 80 },
    balanced: { materialSwing: 0.1, siteSwing: 80, manaSpent: 25, action: 25 },
  },
  habits: ZERO_HABITS,
};

export const PLANNER_V3_PROFILE: PortfolioPlannerProfile = {
  id: 'v3-portfolio',
  liveOptions: {
    ...COMMON_AI_OPTIONS,
    beamWidth: 3,
    maxDepth: 6,
    strategyMaxNodes: 2_600,
    strategyMaxPlanningMs: 160,
    candidatePlans: PORTFOLIO_DOCTRINES.length,
    responseBeamWidth: 3,
    responseDepth: 2,
    tacticalMaxNodes: 1_200,
    tacticalMaxPlanningMs: 120,
  },
  search: {
    candidatesPerDoctrine: 1,
    maxAuditedCandidates: PORTFOLIO_DOCTRINES.length,
    adaptiveDoctrineBudgets: false,
    retainedActions: 8,
    maxRetainedActions: 11,
    expandedActionsPerNode: 5,
    representActionKinds: false,
    responseMode: 'setups',
    responseActionsPerNode: 4,
  },
  scoring: V3_SCORING,
};

export const PLANNER_V4_PROFILE: PortfolioPlannerProfile = {
  id: 'v4-portfolio',
  liveOptions: {
    ...PLANNER_V3_PROFILE.liveOptions,
    maxDepth: 7,
    strategyMaxNodes: 7_200,
    strategyMaxPlanningMs: 700,
    tacticalMaxNodes: 3_000,
    tacticalMaxPlanningMs: 300,
    responseDepth: 3,
  },
  search: {
    candidatesPerDoctrine: 2,
    maxAuditedCandidates: 12,
    adaptiveDoctrineBudgets: true,
    retainedActions: 9,
    maxRetainedActions: 14,
    expandedActionsPerNode: 6,
    representActionKinds: true,
    responseMode: 'beam',
    responseActionsPerNode: 7,
  },
  scoring: {
    outlook: 5,
    urgency: 9,
    action: 16,
    tacticalScore: 4,
    responseOutlook: 0,
    blockedDeploymentPenalty: 340,
    materialLossThreshold: 180,
    materialLossDivisor: 22,
    deploymentLossPenalty: 35,
    doctrines: {
      assassinate: { enemyCommanderDamage: 250, ownCommanderDamage: 180 },
      deploymentTempo: { manaSpent: 85, deploymentGain: 330, unitGain: 180 },
      objectiveRush: { siteSwing: 340, threatenedCapture: 180 },
      attrition: { materialSwing: 0.24, exposureImprovement: 0.16 },
      fortress: { ownCommanderDamage: 200, incomingDamage: 85, commanderScreen: 60 },
      manaEngine: { wellGain: 480, pendingWell: 210, manaSpent: 22 },
      mobilityFlank: { siteSwing: 120, moveAction: 38 },
      abilityCombo: { abilityAction: 155, tacticAction: 95 },
      balanced: { materialSwing: 0.13, siteSwing: 105, manaSpent: 30, action: 22 },
    },
    habits: {
      ...ZERO_HABITS,
      captureWell: 12_000,
      captureFort: 9_500,
      hillRanged: 7_500,
      villageHeal: 4_500,
      siteApproach: 1_400,
      mapControlPressure: 0,
      invokeOnObjectiveBonus: 8_000,
    },
  },
};

export const PLANNER_V5_PROFILE: PortfolioPlannerProfile = {
  id: 'v5-portfolio',
  liveOptions: {
    ...PLANNER_V4_PROFILE.liveOptions,
  },
  search: {
    ...PLANNER_V4_PROFILE.search,
    retainedActions: 10,
    maxRetainedActions: 15,
    expandedActionsPerNode: 7,
  },
  scoring: {
    ...PLANNER_V4_PROFILE.scoring,
    doctrines: {
      ...PLANNER_V4_PROFILE.scoring.doctrines,
      manaEngine: { wellGain: 420, pendingWell: 220, manaSpent: 24 },
      abilityCombo: { abilityAction: 90, tacticAction: 110 },
    },
    habits: {
      profaneWellAction: 9_000,
      unusedProfaneWellPenalty: 420,
      pendingWell: 90,
      unusedCursePenalty: 240,
      curseCommanderAction: 22_000,
      unthreatenedSoulLinkPenalty: 160,
      unusedManaPlayablePenalty: 40,
      commanderRetreatPenalty: 70,
      invokeOnObjectiveBonus: 7_000,
      extraBeastPenalty: 35,
      expensiveSummonBonus: 900,
      selfDisplaceCommanderPenalty: 9_000,
      profaneWellInHandUrgency: 18,
      captureWell: 12_000,
      captureFort: 9_500,
      hillRanged: 7_500,
      villageHeal: 4_500,
      siteApproach: 1_400,
      mapControlPressure: 0,
    },
  },
};

export const PLANNER_V6_PROFILE: PortfolioPlannerProfile = {
  id: 'v6-portfolio',
  liveOptions: {
    ...PLANNER_V5_PROFILE.liveOptions,
  },
  search: {
    ...PLANNER_V5_PROFILE.search,
  },
  scoring: {
    ...PLANNER_V5_PROFILE.scoring,
    responseOutlook: 300,
    doctrines: {
      ...PLANNER_V5_PROFILE.scoring.doctrines,
      objectiveRush: { siteSwing: 520, threatenedCapture: 280 },
      manaEngine: { wellGain: 650, pendingWell: 220, manaSpent: 20 },
      mobilityFlank: { siteSwing: 180, moveAction: 38 },
      balanced: { materialSwing: 0.13, siteSwing: 160, manaSpent: 28, action: 22 },
    },
    habits: {
      ...PLANNER_V5_PROFILE.scoring.habits,
      captureWell: 18_000,
      captureFort: 15_000,
      hillRanged: 9_000,
      villageHeal: 40_000,
      siteApproach: 2_400,
      mapControlPressure: 650,
    },
  },
};
