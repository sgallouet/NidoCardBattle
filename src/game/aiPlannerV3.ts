import { CARD_DEFINITIONS } from '../data/cards';
import { MAP_DECORATIONS } from '../data/map';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS } from '../data/units';
import { GAME_ACTION_KINDS } from './actions';
import {
  applyAiAction,
  assessTacticalOutcome,
  selectCandidateActions,
  type ActionKindCounts,
  type AiAction,
  type AiPlan,
  type AiSearchOptions,
  type SearchPhaseDiagnostics,
  type SearchStopReason,
  type TacticalAssessment,
} from './ai';
import { evaluateStrategicPosition, strategicUnitValue, type StrategicEvaluation } from './aiEvaluation';
import {
  PLANNER_V3_PROFILE,
  PORTFOLIO_DOCTRINES,
  type PortfolioDoctrine,
  type PortfolioPlannerProfile,
} from './aiPlannerProfiles';
import { endTurn, findUnit, hexDistance, terrainAt, unitDefinition } from './engine';

export type PlannerV3Doctrine = PortfolioDoctrine;
export const LIVE_AI_OPTIONS_V3: Required<AiSearchOptions> = PLANNER_V3_PROFILE.liveOptions;

interface PortfolioDiagnostics {
  strategy: SearchPhaseDiagnostics;
  tactical: SearchPhaseDiagnostics;
  planner: PortfolioPlannerProfile['id'];
  selectedDoctrine: PlannerV3Doctrine;
  doctrineScores: Partial<Record<PlannerV3Doctrine, number>>;
  doctrinesCompleted: number;
  candidatesGenerated: number;
  candidatesAfterDeduplication: number;
  tacticalCandidatesAssessed: number;
  responseSequencesChecked: number;
}

interface Budget {
  deadline: number;
  maxNodes: number;
  nodes: number;
  stopReason: SearchStopReason;
  legalActions: number;
  retainedActions: number;
  legalByKind: ActionKindCounts;
  retainedByKind: ActionKindCounts;
}

interface DoctrineNode {
  state: GameState;
  actions: AiAction[];
  score: number;
}

interface DoctrineCandidate extends DoctrineNode {
  doctrine: PlannerV3Doctrine;
  endedState: GameState;
  strategic: StrategicEvaluation;
}

interface AuditedCandidate extends DoctrineCandidate {
  tactical: TacticalAssessment;
  responseSequencesChecked: number;
  assessed: boolean;
}

const nowMs = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const cloneState = (state: GameState): GameState => structuredClone(state);
const opponentOf = (player: PlayerId): PlayerId => player === 1 ? 2 : 1;
const sameCoord = (left: Coord, right: Coord): boolean => left.q === right.q && left.r === right.r;
const emptyCounts = (): ActionKindCounts => ({ summon: 0, tactic: 0, move: 0, attack: 0, displace: 0, rally: 0, soulLink: 0, curse: 0, thunder: 0, invoke: 0 });
const emptyDiagnostics = (): SearchPhaseDiagnostics => ({ nodes: 0, stopReason: 'complete', legalActions: 0, retainedActions: 0, legalByKind: emptyCounts(), retainedByKind: emptyCounts() });
const createBudget = (maxNodes: number, maxMs: number): Budget => ({ deadline: nowMs() + maxMs, maxNodes, nodes: 0, stopReason: 'complete', legalActions: 0, retainedActions: 0, legalByKind: emptyCounts(), retainedByKind: emptyCounts() });
const exhausted = (budget: Budget): boolean => {
  if (budget.nodes >= budget.maxNodes) {
    if (budget.stopReason === 'complete') budget.stopReason = 'node-limit';
    return true;
  }
  if (nowMs() >= budget.deadline) {
    budget.stopReason = 'time-limit';
    return true;
  }
  return false;
};
const diagnosticsOf = (budget: Budget): SearchPhaseDiagnostics => ({
  nodes: budget.nodes,
  stopReason: budget.stopReason,
  legalActions: budget.legalActions,
  retainedActions: budget.retainedActions,
  legalByKind: { ...budget.legalByKind },
  retainedByKind: { ...budget.retainedByKind },
});
const mergeDiagnostics = (target: SearchPhaseDiagnostics, source: SearchPhaseDiagnostics): void => {
  target.nodes += source.nodes;
  target.legalActions += source.legalActions;
  target.retainedActions += source.retainedActions;
  for (const kind of GAME_ACTION_KINDS) {
    target.legalByKind[kind] += source.legalByKind[kind];
    target.retainedByKind[kind] += source.retainedByKind[kind];
  }
  if (source.stopReason === 'time-limit') target.stopReason = 'time-limit';
  else if (source.stopReason === 'node-limit' && target.stopReason === 'complete') target.stopReason = 'node-limit';
};

const commander = (state: GameState, player: PlayerId): UnitState | undefined =>
  state.units.find((unit) => unit.owner === player && unit.definitionId === 'commander');
const material = (state: GameState, player: PlayerId): number =>
  state.units.filter((unit) => unit.owner === player).reduce((sum, unit) => sum + strategicUnitValue(unit), 0);
const controlledDeploymentSites = (state: GameState, player: PlayerId) =>
  state.sites.filter((site) => site.owner === player && (site.type === 'keep' || site.type === 'fort'));
const freeDeploymentSites = (state: GameState, player: PlayerId): number =>
  controlledDeploymentSites(state, player).filter((site) => !state.units.some((unit) => sameCoord(unit.coord, site.coord))).length;
const blockedDeploymentSites = (state: GameState, player: PlayerId): number =>
  controlledDeploymentSites(state, player).filter((site) => state.units.some((unit) => unit.owner === player && sameCoord(unit.coord, site.coord))).length;
const playableUnitCards = (state: GameState, player: PlayerId): number => {
  const runtime = state.players[player];
  return runtime.hand.filter((rawCardId) => {
    const card = CARD_DEFINITIONS[rawCardId as keyof typeof CARD_DEFINITIONS];
    return card?.type === 'unit' && card.cost <= runtime.mana;
  }).length;
};
const siteControlValue = (state: GameState, player: PlayerId): number => state.sites.reduce((score, site) => {
  if (site.owner !== player) return score;
  return score + (site.type === 'keep' ? 6 : site.type === 'well' ? 4 : 3);
}, 0);
const threatenedCaptureValue = (state: GameState, player: PlayerId): number => state.sites.reduce((score, site) => {
  if (site.owner === player) return score;
  const occupant = state.units.find((unit) => unit.owner === player && sameCoord(unit.coord, site.coord));
  if (!occupant) return score;
  return score + (site.type === 'keep' ? 8 : site.type === 'well' ? 5 : 4);
}, 0);
const approximateThreatCount = (state: GameState, attacker: PlayerId, target: Coord): number => state.units.filter((unit) => {
  if (unit.owner !== attacker || unit.exhausted) return false;
  const definition = unitDefinition(unit);
  const hillBonus = definition.range > 1 && terrainAt(unit.coord) === 'hill' ? 1 : 0;
  return hexDistance(unit.coord, target) <= definition.move + definition.range + hillBonus;
}).length;
const approximateIncomingDamage = (state: GameState, attacker: PlayerId, target: UnitState | undefined): number => {
  if (!target) return 99;
  return state.units.reduce((damage, unit) => {
    if (unit.owner !== attacker || unit.exhausted) return damage;
    const definition = unitDefinition(unit);
    const hillBonus = definition.range > 1 && terrainAt(unit.coord) === 'hill' ? 1 : 0;
    return hexDistance(unit.coord, target.coord) <= definition.move + definition.range + hillBonus
      ? damage + definition.attack
      : damage;
  }, 0);
};
const lethalExposureValue = (state: GameState, player: PlayerId): number => {
  const enemy = opponentOf(player);
  return state.units.reduce((score, target) => {
    if (target.owner !== player || target.definitionId === 'commander') return score;
    const lethal = state.units.some((unit) => {
      if (unit.owner !== enemy || unit.exhausted) return false;
      const definition = unitDefinition(unit);
      const hillBonus = definition.range > 1 && terrainAt(unit.coord) === 'hill' ? 1 : 0;
      return definition.attack >= target.hp
        && hexDistance(unit.coord, target.coord) <= definition.move + definition.range + hillBonus;
    });
    return score + (lethal ? strategicUnitValue(target) : 0);
  }, 0);
};
const commanderScreen = (state: GameState, player: PlayerId): number => {
  const leader = commander(state, player);
  if (!leader) return 0;
  return state.units.filter((unit) => unit.owner === player
    && unit.definitionId !== 'commander'
    && hexDistance(unit.coord, leader.coord) <= 2).length;
};
const nearestEnemyDistance = (state: GameState, unit: UnitState): number => {
  const distances = state.units.filter((candidate) => candidate.owner !== unit.owner)
    .map((candidate) => hexDistance(unit.coord, candidate.coord));
  return distances.length > 0 ? Math.min(...distances) : 20;
};
const nearestObjectiveDistance = (state: GameState, player: PlayerId, unit: UnitState): number => {
  const distances = state.sites.filter((site) => site.owner !== player)
    .map((site) => hexDistance(unit.coord, site.coord));
  return distances.length > 0 ? Math.min(...distances) : 12;
};
const contestedSiteDistance = (state: GameState, player: PlayerId, coord: Coord): number => {
  const distances = state.sites
    .filter((site) => site.owner !== player && (site.type === 'well' || site.type === 'fort'))
    .map((site) => hexDistance(coord, site.coord));
  return distances.length > 0 ? Math.min(...distances) : 12;
};
const isRangedUnit = (definition: { range: number; traits: string[] }): boolean =>
  definition.range >= 2 || definition.traits.includes('Ranged');
const isVillage = (coord: Coord): boolean =>
  MAP_DECORATIONS.some((decoration) => decoration.type === 'village' && sameCoord(decoration.coord, coord));
const captureSiteBonus = (
  state: GameState,
  actor: PlayerId,
  destination: Coord,
  habits: PortfolioPlannerProfile['scoring']['habits'],
): number => {
  const site = state.sites.find((candidate) => candidate.owner !== actor && sameCoord(candidate.coord, destination));
  if (!site) return 0;
  const kindBonus = site.type === 'well' ? habits.captureWell : site.type === 'fort' ? habits.captureFort : 0;
  return 8_000 + kindBonus;
};
const terrainPostureBonus = (
  definition: { range: number; traits: string[]; maxHp: number },
  destination: Coord,
  hp: number,
  habits: PortfolioPlannerProfile['scoring']['habits'],
): number => {
  const hillBonus = isRangedUnit(definition) && terrainAt(destination) === 'hill' ? habits.hillRanged : 0;
  const villageBonus = hp < definition.maxHp && isVillage(destination) ? habits.villageHeal : 0;
  return hillBonus + villageBonus;
};
const mapControlPressure = (state: GameState, actor: PlayerId): number => {
  const units = state.units.filter((unit) => unit.owner === actor);
  if (units.length === 0) return 0;
  return state.sites.reduce((score, site) => {
    if (site.type !== 'well' && site.type !== 'fort') return score;
    if (site.owner === actor) return score + 12;
    const distance = Math.min(...units.map((unit) => hexDistance(unit.coord, site.coord)));
    const siteWeight = site.type === 'well' ? 1.25 : 1;
    return score + Math.max(0, 10 - distance) * siteWeight;
  }, 0);
};

const doctrineUrgency = (
  state: GameState,
  actor: PlayerId,
  doctrine: PlannerV3Doctrine,
  profile: PortfolioPlannerProfile,
): number => {
  const enemy = opponentOf(actor);
  const ownCommander = commander(state, actor);
  const enemyCommander = commander(state, enemy);
  const ownDanger = approximateIncomingDamage(state, enemy, ownCommander);
  const enemyHp = enemyCommander?.hp ?? 0;
  const deploymentEmergency = freeDeploymentSites(state, actor) === 0 && playableUnitCards(state, actor) > 0;
  const blockedDeployments = blockedDeploymentSites(state, actor);
  const siteDeficit = siteControlValue(state, enemy) - siteControlValue(state, actor);
  switch (doctrine) {
    case 'assassinate': return (enemyHp <= 5 ? 20 : 4) + Math.max(0, 8 - enemyHp) * 2;
    case 'deployment-tempo': return deploymentEmergency ? 28 : state.players[actor].mana >= 5 ? 10 + blockedDeployments * 3 : 3 + blockedDeployments * 3;
    case 'objective-rush': return 7 + Math.max(0, siteDeficit) * 2;
    case 'attrition': return 6 + Math.max(0, lethalExposureValue(state, enemy) / 350);
    case 'fortress': return ownDanger >= (ownCommander?.hp ?? 10) ? 30 : ownDanger > 0 ? 16 : 3;
    case 'mana-engine': return 4 + state.sites.filter((site) => site.type === 'well' && site.owner !== actor).length * 3
      + (state.players[actor].hand.includes('profaneWell') ? profile.scoring.habits.profaneWellInHandUrgency : 0);
    case 'mobility-flank': return 5 + state.units.filter((unit) => unit.owner === actor && unitDefinition(unit).move >= 3).length;
    case 'ability-combo': return 4 + state.units.filter((unit) => unit.owner === actor && unitDefinition(unit).ability).length * 2;
    case 'balanced': return 8;
  }
};

const commonActionScore = (
  state: GameState,
  actor: PlayerId,
  action: AiAction,
  profile: PortfolioPlannerProfile,
): number => {
  const enemy = opponentOf(actor);
  const habits = profile.scoring.habits;
  if (action.kind === 'attack') {
    const attacker = findUnit(state, action.unitId);
    const target = findUnit(state, action.targetId);
    if (!attacker || !target) return -100_000;
    const lethal = unitDefinition(attacker).attack >= target.hp;
    return (target.definitionId === 'commander' ? 80_000 : 0)
      + (lethal ? 12_000 : 0)
      + strategicUnitValue(target) * 2;
  }
  if (action.kind === 'move') {
    const unit = findUnit(state, action.unitId);
    if (!unit) return -100_000;
    const freesDeployment = controlledDeploymentSites(state, actor).some((site) => sameCoord(site.coord, unit.coord))
      && playableUnitCards(state, actor) > 0;
    const danger = approximateThreatCount(state, enemy, action.destination);
    const objectiveAfter = state.sites.filter((site) => site.owner !== actor)
      .map((site) => hexDistance(action.destination, site.coord));
    const retreat = unit.definitionId === 'commander'
      && objectiveAfter.length > 0
      && Math.min(...objectiveAfter) > nearestObjectiveDistance(state, actor, unit);
    const definition = unitDefinition(unit);
    const approach = Math.max(0, contestedSiteDistance(state, actor, unit.coord)
      - contestedSiteDistance(state, actor, action.destination));
    return (freesDeployment ? 14_000 : 0)
      + captureSiteBonus(state, actor, action.destination, habits)
      + terrainPostureBonus(definition, action.destination, unit.hp, habits)
      + approach * habits.siteApproach
      - danger * 450
      - (retreat ? habits.commanderRetreatPenalty * 80 : 0);
  }
  if (action.kind === 'summon') {
    const card = CARD_DEFINITIONS[action.cardId];
    const definition = card.type === 'unit' ? UNIT_DEFINITIONS[card.unitId] : undefined;
    const enemyCommander = commander(state, enemy);
    const danger = approximateThreatCount(state, enemy, action.destination);
    const lethalDanger = definition && state.units.some((unit) => {
      if (unit.owner !== enemy || unit.exhausted) return false;
      const enemyDefinition = unitDefinition(unit);
      return enemyDefinition.attack >= definition.maxHp
        && hexDistance(unit.coord, action.destination) <= enemyDefinition.move + enemyDefinition.range;
    });
    return 4_000 + card.cost * 550
      + (card.cost >= 4 ? habits.expensiveSummonBonus * card.cost : 0)
      + (definition ? terrainPostureBonus(definition, action.destination, definition.maxHp, habits) : 0)
      + captureSiteBonus(state, actor, action.destination, habits)
      + (enemyCommander ? Math.max(0, 12 - hexDistance(action.destination, enemyCommander.coord)) * 120 : 0)
      - danger * 500 - (lethalDanger ? 12_000 : 0);
  }
  if (action.kind === 'curse') {
    const target = findUnit(state, action.targetId);
    return target?.definitionId === 'commander'
      ? 8_000 + habits.curseCommanderAction
      : 3_500 + (target ? strategicUnitValue(target) : 0);
  }
  if (action.kind === 'thunder') {
    const affected = state.units.filter((unit) => hexDistance(unit.coord, action.destination) <= 1);
    const enemyValue = affected
      .filter((unit) => unit.owner !== actor)
      .reduce((score, unit) => score + 850 + strategicUnitValue(unit), 0);
    const friendlyValue = affected
      .filter((unit) => unit.owner === actor)
      .reduce((score, unit) => score + 1_000 + strategicUnitValue(unit), 0);
    return 2_500 + enemyValue - friendlyValue;
  }
  if (action.kind === 'displace') {
    const target = findUnit(state, action.targetId);
    const targetSite = target && state.sites.some((site) => site.owner === target.owner && sameCoord(site.coord, target.coord));
    const commanderObjectiveAfter = target && state.sites.filter((site) => site.owner !== actor)
      .map((site) => hexDistance(action.destination, site.coord));
    const ownCommanderRetreat = Boolean(target?.owner === actor && target.definitionId === 'commander'
      && approximateIncomingDamage(state, enemy, target) === 0
      && commanderObjectiveAfter && commanderObjectiveAfter.length > 0
      && Math.min(...commanderObjectiveAfter) > nearestObjectiveDistance(state, actor, target));
    return 3_500 + (targetSite ? 4_000 : 0) + (target?.definitionId === 'commander' ? 3_000 : 0)
      - (ownCommanderRetreat ? habits.selfDisplaceCommanderPenalty : 0);
  }
  if (action.kind === 'rally') return 4_000;
  if (action.kind === 'soulLink') {
    const ownCommander = commander(state, actor);
    const unthreatened = approximateIncomingDamage(state, enemy, ownCommander) === 0;
    return 3_800 - (unthreatened ? habits.unthreatenedSoulLinkPenalty * 30 : 0);
  }
  if (action.kind === 'invoke') {
    const onObjective = state.sites.some((site) => site.owner !== actor && sameCoord(site.coord, action.destination));
    const beastCount = state.units.filter((unit) => unit.owner === actor && unit.definitionId === 'invokedBeast').length;
    return 4_500 - approximateThreatCount(state, enemy, action.destination) * 350
      + (onObjective ? habits.invokeOnObjectiveBonus : 0)
      + captureSiteBonus(state, actor, action.destination, habits)
      - beastCount * habits.extraBeastPenalty * 80;
  }
  if (action.kind === 'tactic') {
    if (action.cardId === 'raiseFort') return 7_000;
    if (action.cardId === 'profaneWell') return 6_500 + habits.profaneWellAction;
    if (action.cardId === 'graveLock') return 5_500;
    if (action.cardId === 'buildBridge') return 3_800;
    if (action.cardId === 'scorch') return 3_200;
  }
  return 1_000;
};

const doctrineActionBias = (state: GameState, actor: PlayerId, action: AiAction, doctrine: PlannerV3Doctrine): number => {
  const enemy = opponentOf(actor);
  const ownCommander = commander(state, actor);
  const enemyCommander = commander(state, enemy);
  const unit = 'unitId' in action ? findUnit(state, action.unitId) : undefined;
  switch (doctrine) {
    case 'assassinate': {
      if (action.kind === 'attack') return findUnit(state, action.targetId)?.definitionId === 'commander' ? 35_000 : 2_000;
      if (action.kind === 'move' && unit && enemyCommander) {
        return (hexDistance(unit.coord, enemyCommander.coord) - hexDistance(action.destination, enemyCommander.coord)) * 2_200;
      }
      if (action.kind === 'curse' && findUnit(state, action.targetId)?.definitionId === 'commander') return 12_000;
      if (action.kind === 'displace' && findUnit(state, action.targetId)?.definitionId === 'commander') return 8_000;
      return action.kind === 'summon' ? 1_500 : 0;
    }
    case 'deployment-tempo':
      if (action.kind === 'summon') return 10_000 + CARD_DEFINITIONS[action.cardId].cost * 700;
      if (action.kind === 'move' && unit && controlledDeploymentSites(state, actor).some((site) => sameCoord(site.coord, unit.coord))) return 18_000;
      return action.kind === 'invoke' ? 4_000 : 0;
    case 'objective-rush':
      if (action.kind === 'move') {
        const capture = state.sites.find((site) => site.owner !== actor && sameCoord(site.coord, action.destination));
        if (capture) return capture.type === 'keep' ? 16_000 : capture.type === 'well' ? 11_000 : 8_000;
        if (unit) return (nearestObjectiveDistance(state, actor, unit)
          - Math.min(12, ...state.sites.filter((site) => site.owner !== actor).map((site) => hexDistance(action.destination, site.coord)))) * 1_500;
      }
      if (action.kind === 'tactic' && action.cardId === 'raiseFort') return 8_000;
      return 0;
    case 'attrition':
      if (action.kind === 'attack') {
        const target = findUnit(state, action.targetId);
        return target ? strategicUnitValue(target) * 2.5 + (target.hp <= 2 ? 4_000 : 0) : 0;
      }
      if (action.kind === 'move' && unit) return (nearestEnemyDistance(state, unit) - Math.min(20, ...state.units.filter((target) => target.owner === enemy).map((target) => hexDistance(action.destination, target.coord)))) * 650;
      return action.kind === 'curse' ? 4_000 : 0;
    case 'fortress':
      if (action.kind === 'move' && unit && ownCommander) {
        const before = hexDistance(unit.coord, ownCommander.coord);
        const after = hexDistance(action.destination, ownCommander.coord);
        return (before - after) * 1_500 - approximateThreatCount(state, enemy, action.destination) * 600;
      }
      if (action.kind === 'summon' && ownCommander) return Math.max(0, 7 - hexDistance(action.destination, ownCommander.coord)) * 1_200;
      if (action.kind === 'attack') return 5_000;
      if (action.kind === 'soulLink' || action.kind === 'rally') return 5_000;
      return 0;
    case 'mana-engine':
      if (action.kind === 'tactic' && action.cardId === 'profaneWell') return 14_000;
      if (action.kind === 'move') {
        const well = state.sites.some((site) => site.type === 'well' && site.owner !== actor && sameCoord(site.coord, action.destination));
        return well ? 15_000 : 0;
      }
      if (action.kind === 'summon') return CARD_DEFINITIONS[action.cardId].cost <= 3 ? 5_000 : 500;
      return 0;
    case 'mobility-flank':
      if (action.kind === 'move' && unit) {
        const mobility = unitDefinition(unit).move;
        const approach = enemyCommander
          ? hexDistance(unit.coord, enemyCommander.coord) - hexDistance(action.destination, enemyCommander.coord)
          : 0;
        return mobility * 700 + approach * 900;
      }
      if (action.kind === 'tactic' && action.cardId === 'buildBridge') return 12_000;
      if (action.kind === 'displace') return 7_000;
      return 0;
    case 'ability-combo':
      if (action.kind === 'curse' || action.kind === 'displace' || action.kind === 'rally'
        || action.kind === 'soulLink' || action.kind === 'thunder' || action.kind === 'invoke') return 10_000;
      if (action.kind === 'tactic') return 6_000;
      return action.kind === 'attack' ? 3_000 : 0;
    case 'balanced':
      return action.kind === 'attack' ? 4_000
        : action.kind === 'summon' ? 3_000
          : action.kind === 'move' ? 2_000
            : 1_500;
  }
};

const doctrineStateScore = (
  initial: GameState,
  state: GameState,
  actor: PlayerId,
  doctrine: PlannerV3Doctrine,
  actions: AiAction[],
  profile: PortfolioPlannerProfile,
): number => {
  const enemy = opponentOf(actor);
  const weights = profile.scoring;
  const base = evaluateStrategicPosition(state, actor).outlook * weights.outlook;
  const ownCommanderBefore = commander(initial, actor);
  const ownCommanderAfter = commander(state, actor);
  const enemyCommanderBefore = commander(initial, enemy);
  const enemyCommanderAfter = commander(state, enemy);
  const enemyCommanderDamage = (enemyCommanderBefore?.hp ?? 0) - (enemyCommanderAfter?.hp ?? 0);
  const ownCommanderDamage = (ownCommanderBefore?.hp ?? 0) - (ownCommanderAfter?.hp ?? 0);
  const materialSwing = (material(state, actor) - material(initial, actor))
    - (material(state, enemy) - material(initial, enemy));
  const siteSwing = (siteControlValue(state, actor) - siteControlValue(initial, actor))
    - (siteControlValue(state, enemy) - siteControlValue(initial, enemy));
  const manaSpent = Math.max(0, initial.players[actor].mana - state.players[actor].mana);
  const deployGain = freeDeploymentSites(state, actor) - freeDeploymentSites(initial, actor);
  const exposureImprovement = lethalExposureValue(initial, actor) - lethalExposureValue(state, actor);
  const abilityActions = actions.filter((action) => action.kind === 'curse' || action.kind === 'displace'
    || action.kind === 'rally' || action.kind === 'soulLink' || action.kind === 'thunder' || action.kind === 'invoke').length;
  const tacticActions = actions.filter((action) => action.kind === 'tactic').length;
  const urgency = doctrineUrgency(initial, actor, doctrine, profile) * weights.urgency;
  let doctrineBonus = 0;
  switch (doctrine) {
    case 'assassinate': doctrineBonus = enemyCommanderDamage * weights.doctrines.assassinate.enemyCommanderDamage
      - ownCommanderDamage * weights.doctrines.assassinate.ownCommanderDamage; break;
    case 'deployment-tempo': doctrineBonus = manaSpent * weights.doctrines.deploymentTempo.manaSpent
      + deployGain * weights.doctrines.deploymentTempo.deploymentGain
      + (state.units.filter((unit) => unit.owner === actor).length - initial.units.filter((unit) => unit.owner === actor).length)
        * weights.doctrines.deploymentTempo.unitGain; break;
    case 'objective-rush': doctrineBonus = siteSwing * weights.doctrines.objectiveRush.siteSwing
      + threatenedCaptureValue(state, actor) * weights.doctrines.objectiveRush.threatenedCapture; break;
    case 'attrition': doctrineBonus = materialSwing * weights.doctrines.attrition.materialSwing
      + exposureImprovement * weights.doctrines.attrition.exposureImprovement; break;
    case 'fortress': doctrineBonus = -ownCommanderDamage * weights.doctrines.fortress.ownCommanderDamage
      - approximateIncomingDamage(state, enemy, ownCommanderAfter) * weights.doctrines.fortress.incomingDamage
      + commanderScreen(state, actor) * weights.doctrines.fortress.commanderScreen; break;
    case 'mana-engine': doctrineBonus = (state.sites.filter((site) => site.owner === actor && site.type === 'well').length
      - initial.sites.filter((site) => site.owner === actor && site.type === 'well').length) * weights.doctrines.manaEngine.wellGain
      + state.pendingManaWells.filter((well) => well.owner === actor).length * weights.doctrines.manaEngine.pendingWell
      + manaSpent * weights.doctrines.manaEngine.manaSpent; break;
    case 'mobility-flank': doctrineBonus = siteSwing * weights.doctrines.mobilityFlank.siteSwing
      + actions.filter((action) => action.kind === 'move').length * weights.doctrines.mobilityFlank.moveAction; break;
    case 'ability-combo': doctrineBonus = abilityActions * weights.doctrines.abilityCombo.abilityAction
      + tacticActions * weights.doctrines.abilityCombo.tacticAction; break;
    case 'balanced': doctrineBonus = materialSwing * weights.doctrines.balanced.materialSwing
      + siteSwing * weights.doctrines.balanced.siteSwing
      + manaSpent * weights.doctrines.balanced.manaSpent
      + actions.length * weights.doctrines.balanced.action; break;
  }
  const emergencyPenalty = freeDeploymentSites(state, actor) === 0 && playableUnitCards(state, actor) > 0
    ? weights.blockedDeploymentPenalty
    : 0;
  const habits = weights.habits;
  const pendingWellGain = (state.pendingManaWells.filter((well) => well.owner === actor).length
    - initial.pendingManaWells.filter((well) => well.owner === actor).length) * habits.pendingWell;
  const unusedProfaneWell = initial.players[actor].hand.includes('profaneWell')
    && initial.players[actor].mana >= 2
    && !actions.some((action) => action.kind === 'tactic' && action.cardId === 'profaneWell')
    ? habits.unusedProfaneWellPenalty
    : 0;
  const canCurseCommander = initial.units.some((unit) => {
    if (unit.owner !== actor || unit.definitionId !== 'necromancer' || unit.exhausted) return false;
    const target = commander(initial, enemy);
    return Boolean(target) && hexDistance(unit.coord, target!.coord) <= unitDefinition(unit).move + unitDefinition(unit).range;
  });
  const unusedCurse = canCurseCommander && !actions.some((action) => action.kind === 'curse')
    ? habits.unusedCursePenalty
    : 0;
  const leftoverMana = state.players[actor].mana;
  const leftoverPlayable = leftoverMana > 0 && state.players[actor].hand.some((cardId) => {
    const card = CARD_DEFINITIONS[cardId as keyof typeof CARD_DEFINITIONS];
    return Boolean(card) && card.cost <= leftoverMana;
  });
  const unusedMana = leftoverPlayable ? leftoverMana * habits.unusedManaPlayablePenalty : 0;
  const unthreatenedSoulLink = actions.some((action) => action.kind === 'soulLink')
    && approximateIncomingDamage(initial, enemy, ownCommanderBefore) === 0
    ? habits.unthreatenedSoulLinkPenalty
    : 0;
  const commanderRetreat = ownCommanderBefore && ownCommanderAfter
    && approximateIncomingDamage(initial, enemy, ownCommanderBefore) === 0
    && ownCommanderBefore.hp >= (unitDefinition(ownCommanderBefore).maxHp)
    ? Math.max(0, nearestObjectiveDistance(state, actor, ownCommanderAfter)
      - nearestObjectiveDistance(initial, actor, ownCommanderBefore)) * habits.commanderRetreatPenalty
    : 0;
  const posture = state.units.reduce((score, unit) => {
    if (unit.owner !== actor) return score;
    return score + terrainPostureBonus(unitDefinition(unit), unit.coord, unit.hp, habits) * 0.08;
  }, 0);
  const controlPressure = (mapControlPressure(state, actor) - mapControlPressure(initial, actor))
    * habits.mapControlPressure;
  return base + urgency + doctrineBonus + actions.length * weights.action - emergencyPenalty
    + pendingWellGain + posture + controlPressure
    - unusedProfaneWell - unusedCurse - unusedMana - unthreatenedSoulLink - commanderRetreat;
};

const recordSelection = (budget: Budget, stats: ReturnType<typeof selectCandidateActions>['stats'], retained: AiAction[]): void => {
  budget.legalActions += stats.legalActions;
  budget.retainedActions += retained.length;
  for (const kind of GAME_ACTION_KINDS) {
    budget.legalByKind[kind] += stats.legalByKind[kind];
    budget.retainedByKind[kind] += retained.filter((action) => action.kind === kind).length;
  }
};

const doctrineActions = (
  state: GameState,
  actor: PlayerId,
  doctrine: PlannerV3Doctrine,
  budget: Budget,
  profile: PortfolioPlannerProfile,
): AiAction[] => {
  const selection = selectCandidateActions(state, actor, true);
  const ranked = [...selection.actions].sort((left, right) =>
    commonActionScore(state, actor, right, profile) + doctrineActionBias(state, actor, right, doctrine)
    - commonActionScore(state, actor, left, profile) - doctrineActionBias(state, actor, left, doctrine));
  const retained = ranked.slice(0, profile.search.retainedActions);
  if (profile.search.representActionKinds) {
    const representedKinds = new Set(retained.map((action) => action.kind));
    for (const action of ranked) {
      if (retained.length >= profile.search.maxRetainedActions) break;
      if (representedKinds.has(action.kind)) continue;
      retained.push(action);
      representedKinds.add(action.kind);
    }
  }
  const representedUnits = new Set(retained.filter((action) => action.kind === 'move').map((action) => action.unitId));
  for (const action of ranked) {
    if (retained.length >= profile.search.maxRetainedActions) break;
    if (action.kind !== 'move' || representedUnits.has(action.unitId)) continue;
    retained.push(action);
    representedUnits.add(action.unitId);
  }
  recordSelection(budget, selection.stats, retained);
  return retained;
};

const finishTurn = (state: GameState, actor: PlayerId): GameState => {
  const ended = cloneState(state);
  if (!ended.winner && ended.currentPlayer === actor) endTurn(ended, () => 0.5);
  return ended;
};

const buildDoctrineCandidates = (
  initial: GameState,
  actor: PlayerId,
  doctrine: PlannerV3Doctrine,
  options: Required<AiSearchOptions>,
  budget: Budget,
  profile: PortfolioPlannerProfile,
): DoctrineCandidate[] => {
  const root = cloneState(initial);
  let beam: DoctrineNode[] = [{ state: root, actions: [], score: doctrineStateScore(initial, root, actor, doctrine, [], profile) }];
  let best: DoctrineNode = beam[0];
  let alternatives: DoctrineNode[] = [best];
  for (let depth = 0; depth < options.maxDepth && beam.length > 0 && !exhausted(budget); depth += 1) {
    const next: DoctrineNode[] = [];
    for (const node of beam) {
      if (exhausted(budget)) break;
      const actions = doctrineActions(node.state, actor, doctrine, budget, profile);
      for (const action of actions.slice(0, profile.search.expandedActionsPerNode)) {
        if (exhausted(budget)) break;
        const child = cloneState(node.state);
        const result = applyAiAction(child, action);
        if (!result.ok) continue;
        budget.nodes += 1;
        const childActions = [...node.actions, action];
        const score = doctrineStateScore(initial, child, actor, doctrine, childActions, profile);
        const candidate = { state: child, actions: childActions, score };
        next.push(candidate);
        if (score > best.score) best = candidate;
      }
    }
    next.sort((left, right) => right.score - left.score);
    if (profile.search.candidatesPerDoctrine > 1) {
      const unique = new Map<string, DoctrineNode>();
      for (const candidate of [...alternatives, ...next].sort((left, right) => right.score - left.score)) {
        const key = JSON.stringify(candidate.actions);
        if (!unique.has(key)) unique.set(key, candidate);
      }
      alternatives = [...unique.values()].slice(0, profile.search.candidatesPerDoctrine * 6);
    }
    beam = next.slice(0, Math.max(1, Math.min(3, options.beamWidth)));
  }
  const finalists = profile.search.candidatesPerDoctrine === 1 ? [best] : alternatives;
  return finalists.map((candidate) => {
    const endedState = finishTurn(candidate.state, actor);
    return {
      ...candidate,
      doctrine,
      endedState,
      strategic: evaluateStrategicPosition(endedState, actor),
      score: doctrineStateScore(initial, endedState, actor, doctrine, candidate.actions, profile),
    };
  }).sort((left, right) => right.score - left.score)
    .slice(0, profile.search.candidatesPerDoctrine);
};

const tacticalRank = (assessment: TacticalAssessment): number => assessment.tier === 'forced-win' ? 3
  : assessment.tier === 'safe' ? 2
    : assessment.tier === 'unsafe' ? 1
      : 0;
const conservativeAssessment = (state: GameState, perspective: PlayerId): TacticalAssessment => {
  const assessment = assessTacticalOutcome(state, state, perspective, []);
  if (assessment.tier === 'forced-win' || assessment.tier === 'forced-loss') return assessment;
  return { ...assessment, tier: 'unsafe', score: Math.min(-70, assessment.score), worstResponseStrategicOutlook: -100 };
};
const strengthenMaterialLoss = (
  beforeResponse: GameState,
  afterResponse: GameState,
  perspective: PlayerId,
  assessment: TacticalAssessment,
  profile: PortfolioPlannerProfile,
): TacticalAssessment => {
  if (assessment.tier !== 'safe') return assessment;
  const lost = material(beforeResponse, perspective) - material(afterResponse, perspective);
  const deploymentLost = freeDeploymentSites(beforeResponse, perspective) > 0
    && freeDeploymentSites(afterResponse, perspective) === 0;
  if (lost < profile.scoring.materialLossThreshold && !deploymentLost) return assessment;
  return {
    ...assessment,
    tier: 'unsafe',
    score: Math.min(-20, assessment.score - lost / profile.scoring.materialLossDivisor
      - (deploymentLost ? profile.scoring.deploymentLossPenalty : 0)),
  };
};

const applyResponseSequence = (
  start: GameState,
  sequence: AiAction[],
  responder: PlayerId,
): GameState | undefined => {
  const state = cloneState(start);
  for (const action of sequence) {
    const result = applyAiAction(state, action);
    if (!result.ok) return undefined;
  }
  return finishTurn(state, responder);
};

const auditCandidate = (
  initial: GameState,
  candidate: DoctrineCandidate,
  perspective: PlayerId,
  budget: Budget,
  profile: PortfolioPlannerProfile,
): AuditedCandidate => {
  const responder = opponentOf(perspective);
  if (candidate.endedState.winner || candidate.endedState.currentPlayer !== responder) {
    return { ...candidate, tactical: assessTacticalOutcome(initial, candidate.endedState, perspective, []), responseSequencesChecked: 0, assessed: true };
  }

  const rootSelection = selectCandidateActions(candidate.endedState, responder, false);
  const immediate = rootSelection.actions.filter((action) => action.kind === 'attack')
    .sort((left, right) => commonActionScore(candidate.endedState, responder, right, profile) - commonActionScore(candidate.endedState, responder, left, profile))
    .slice(0, 12)
    .map((action) => [action]);
  const moveSetups = rootSelection.actions.filter((action) => action.kind === 'move')
    .sort((left, right) => commonActionScore(candidate.endedState, responder, right, profile) - commonActionScore(candidate.endedState, responder, left, profile))
    .slice(0, 10);
  const displaceSetups = rootSelection.actions.filter((action) => action.kind === 'displace').slice(0, 5);
  recordSelection(budget, rootSelection.stats, [...immediate.flat(), ...moveSetups, ...displaceSetups]);

  const sequences: AiAction[][] = [...immediate];
  for (const setup of [...moveSetups, ...displaceSetups]) {
    if (exhausted(budget)) break;
    const afterSetup = cloneState(candidate.endedState);
    const setupResult = applyAiAction(afterSetup, setup);
    if (!setupResult.ok) continue;
    budget.nodes += 1;
    const followup = selectCandidateActions(afterSetup, responder, false);
    const attacks = followup.actions.filter((action) => action.kind === 'attack')
      .sort((left, right) => commonActionScore(afterSetup, responder, right, profile) - commonActionScore(afterSetup, responder, left, profile))
      .slice(0, profile.search.responseActionsPerNode);
    recordSelection(budget, followup.stats, attacks);
    for (const attack of attacks) sequences.push([setup, attack]);
  }

  let worst: TacticalAssessment | undefined;
  let checked = 0;
  for (const sequence of sequences) {
    if (exhausted(budget)) break;
    const after = applyResponseSequence(candidate.endedState, sequence, responder);
    if (!after) continue;
    budget.nodes += sequence.length;
    checked += 1;
    const assessment = strengthenMaterialLoss(
      candidate.endedState,
      after,
      perspective,
      assessTacticalOutcome(initial, after, perspective, sequence),
      profile,
    );
    if (!worst
      || tacticalRank(assessment) < tacticalRank(worst)
      || (tacticalRank(assessment) === tacticalRank(worst)
        && assessment.worstResponseStrategicOutlook < worst.worstResponseStrategicOutlook)) {
      worst = assessment;
    }
  }

  const rootHadResponses = rootSelection.actions.length > 0;
  const assessed = checked > 0 || !rootHadResponses;
  return {
    ...candidate,
    tactical: worst ?? (assessed
      ? assessTacticalOutcome(initial, candidate.endedState, perspective, [])
      : conservativeAssessment(candidate.endedState, perspective)),
    responseSequencesChecked: checked,
    assessed,
  };
};

interface ResponseNode {
  state: GameState;
  actions: AiAction[];
  score: number;
}

const diverseResponseActions = (
  state: GameState,
  responder: PlayerId,
  actions: AiAction[],
  limit: number,
  profile: PortfolioPlannerProfile,
): AiAction[] => {
  const ranked = [...actions].sort((left, right) =>
    commonActionScore(state, responder, right, profile) - commonActionScore(state, responder, left, profile));
  const primaryCount = Math.max(1, limit - 3);
  const retained = ranked.slice(0, primaryCount);
  const representedKinds = new Set(retained.map((action) => action.kind));
  for (const action of ranked) {
    if (retained.length >= limit) break;
    if (representedKinds.has(action.kind)) continue;
    retained.push(action);
    representedKinds.add(action.kind);
  }
  for (const action of ranked) {
    if (retained.length >= limit) break;
    if (retained.includes(action)) continue;
    retained.push(action);
  }
  return retained;
};

const auditCandidateWithResponseBeam = (
  initial: GameState,
  candidate: DoctrineCandidate,
  perspective: PlayerId,
  options: Required<AiSearchOptions>,
  budget: Budget,
  profile: PortfolioPlannerProfile,
): AuditedCandidate => {
  const responder = opponentOf(perspective);
  if (candidate.endedState.winner || candidate.endedState.currentPlayer !== responder) {
    return { ...candidate, tactical: assessTacticalOutcome(initial, candidate.endedState, perspective, []), responseSequencesChecked: 0, assessed: true };
  }

  let frontier: ResponseNode[] = [{ state: cloneState(candidate.endedState), actions: [], score: 0 }];
  let worst: TacticalAssessment | undefined;
  let checked = 0;
  let rootHadResponses = false;

  for (let depth = 0; depth < options.responseDepth && frontier.length > 0 && !exhausted(budget); depth += 1) {
    const next: ResponseNode[] = [];
    for (const node of frontier) {
      if (exhausted(budget)) break;
      const selection = selectCandidateActions(node.state, responder, false);
      if (depth === 0 && node.actions.length === 0) rootHadResponses = selection.actions.length > 0;
      const retained = diverseResponseActions(
        node.state,
        responder,
        selection.actions,
        profile.search.responseActionsPerNode,
        profile,
      );
      recordSelection(budget, selection.stats, retained);
      for (const action of retained) {
        if (exhausted(budget)) break;
        const child = cloneState(node.state);
        const result = applyAiAction(child, action);
        if (!result.ok) continue;
        budget.nodes += 1;
        const actions = [...node.actions, action];
        const ended = finishTurn(child, responder);
        const assessment = strengthenMaterialLoss(
          candidate.endedState,
          ended,
          perspective,
          assessTacticalOutcome(initial, ended, perspective, actions),
          profile,
        );
        checked += 1;
        if (!worst
          || tacticalRank(assessment) < tacticalRank(worst)
          || (tacticalRank(assessment) === tacticalRank(worst)
            && assessment.worstResponseStrategicOutlook < worst.worstResponseStrategicOutlook)
          || (tacticalRank(assessment) === tacticalRank(worst)
            && assessment.worstResponseStrategicOutlook === worst.worstResponseStrategicOutlook
            && assessment.score < worst.score)) {
          worst = assessment;
        }
        if (!child.winner && child.currentPlayer === responder) {
          next.push({
            state: child,
            actions,
            score: evaluateStrategicPosition(child, responder).outlook,
          });
        }
      }
    }
    const unique = new Map<string, ResponseNode>();
    for (const node of next.sort((left, right) => right.score - left.score)) {
      const key = JSON.stringify(node.state);
      if (!unique.has(key)) unique.set(key, node);
    }
    frontier = [...unique.values()].slice(0, Math.max(1, options.responseBeamWidth));
  }

  const assessed = checked > 0 || !rootHadResponses;
  return {
    ...candidate,
    tactical: worst ?? (assessed
      ? assessTacticalOutcome(initial, candidate.endedState, perspective, [])
      : conservativeAssessment(candidate.endedState, perspective)),
    responseSequencesChecked: checked,
    assessed,
  };
};

const compareAuditedCandidates = (left: AuditedCandidate, right: AuditedCandidate): number => {
  const tactical = tacticalRank(right.tactical) - tacticalRank(left.tactical);
  if (tactical !== 0) return tactical;
  const assessed = Number(right.assessed) - Number(left.assessed);
  if (assessed !== 0) return assessed;
  const response = right.tactical.worstResponseStrategicOutlook - left.tactical.worstResponseStrategicOutlook;
  if (response !== 0) return response;
  const score = right.score - left.score;
  if (score !== 0) return score;
  return right.actions.length - left.actions.length;
};

const compareV4Candidates = (
  left: AuditedCandidate,
  right: AuditedCandidate,
  profile: PortfolioPlannerProfile,
): number => {
  const tactical = tacticalRank(right.tactical) - tacticalRank(left.tactical);
  if (tactical !== 0) return tactical;
  const assessed = Number(right.assessed) - Number(left.assessed);
  if (assessed !== 0) return assessed;
  const response = right.tactical.worstResponseStrategicOutlook - left.tactical.worstResponseStrategicOutlook;
  if (response !== 0) return response;
  const combined = right.score + right.tactical.score * profile.scoring.tacticalScore
    - left.score - left.tactical.score * profile.scoring.tacticalScore;
  return combined !== 0 ? combined : right.actions.length - left.actions.length;
};

const compareV6Candidates = (
  left: AuditedCandidate,
  right: AuditedCandidate,
  profile: PortfolioPlannerProfile,
): number => {
  const tactical = tacticalRank(right.tactical) - tacticalRank(left.tactical);
  if (tactical !== 0) return tactical;
  const assessed = Number(right.assessed) - Number(left.assessed);
  if (assessed !== 0) return assessed;
  const combined = right.score
    + right.tactical.score * profile.scoring.tacticalScore
    + right.tactical.worstResponseStrategicOutlook * profile.scoring.responseOutlook
    - left.score
    - left.tactical.score * profile.scoring.tacticalScore
    - left.tactical.worstResponseStrategicOutlook * profile.scoring.responseOutlook;
  return combined !== 0 ? combined : right.actions.length - left.actions.length;
};

const proportionalBudgets = (total: number, weights: number[], minimum: number): number[] => {
  const count = Math.max(1, weights.length);
  const base = Math.min(minimum, Math.floor(total / count));
  const remaining = Math.max(0, total - base * count);
  const weightTotal = weights.reduce((sum, weight) => sum + Math.max(1, weight), 0);
  const budgets = weights.map((weight) => base + Math.floor(remaining * Math.max(1, weight) / weightTotal));
  let unallocated = Math.max(0, Math.floor(total - budgets.reduce((sum, budget) => sum + budget, 0)));
  for (let index = 0; unallocated > 0; index = (index + 1) % budgets.length) {
    budgets[index] += 1;
    unallocated -= 1;
  }
  return budgets;
};

const candidateFingerprint = (candidate: DoctrineCandidate): string => JSON.stringify(candidate.endedState);

const diverseCandidates = (candidates: DoctrineCandidate[]): DoctrineCandidate[] => {
  const bestByDoctrine = PORTFOLIO_DOCTRINES.flatMap((doctrine) => {
    const matches = candidates.filter((candidate) => candidate.doctrine === doctrine)
      .sort((left, right) => right.score - left.score);
    return matches.slice(0, 1);
  });
  const ordered = [...bestByDoctrine, ...[...candidates].sort((left, right) => right.score - left.score)];
  const seen = new Set<string>();
  const unique: DoctrineCandidate[] = [];
  for (const candidate of ordered) {
    const fingerprint = candidateFingerprint(candidate);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    unique.push(candidate);
  }
  return unique;
};

export const planPortfolioAiTurn = (
  state: GameState,
  profile: PortfolioPlannerProfile,
  overrides: AiSearchOptions = {},
): AiPlan => {
  const actor = state.currentPlayer;
  const options: Required<AiSearchOptions> = { ...profile.liveOptions, ...overrides };
  if (state.winner) {
    const strategic = evaluateStrategicPosition(state, actor);
    return { actions: [], strategic, tactical: assessTacticalOutcome(state, state, actor), diagnostics: { strategy: emptyDiagnostics(), tactical: emptyDiagnostics() } };
  }

  const strategyDiagnostics = emptyDiagnostics();
  const doctrineScores: Partial<Record<PlannerV3Doctrine, number>> = {};
  const candidates: DoctrineCandidate[] = [];
  const urgencies = PORTFOLIO_DOCTRINES.map((doctrine) =>
    Math.sqrt(Math.max(1, doctrineUrgency(state, actor, doctrine, profile))));
  const nodeBudgets = profile.search.adaptiveDoctrineBudgets
    ? proportionalBudgets(options.strategyMaxNodes, urgencies, 12)
    : PORTFOLIO_DOCTRINES.map(() => Math.max(40, Math.floor(options.strategyMaxNodes / PORTFOLIO_DOCTRINES.length)));
  const timeBudgets = profile.search.adaptiveDoctrineBudgets
    ? proportionalBudgets(options.strategyMaxPlanningMs, urgencies, 4)
    : PORTFOLIO_DOCTRINES.map(() => Math.max(8, options.strategyMaxPlanningMs / PORTFOLIO_DOCTRINES.length));
  let doctrinesCompleted = 0;

  for (const [index, doctrine] of PORTFOLIO_DOCTRINES.entries()) {
    const budget = createBudget(nodeBudgets[index], timeBudgets[index]);
    const doctrineCandidates = buildDoctrineCandidates(state, actor, doctrine, options, budget, profile);
    doctrineScores[doctrine] = Math.round(doctrineCandidates[0]?.score ?? -100_000);
    candidates.push(...doctrineCandidates);
    mergeDiagnostics(strategyDiagnostics, diagnosticsOf(budget));
    if (budget.stopReason === 'complete') doctrinesCompleted += 1;
  }

  const deduplicated = profile.search.candidatesPerDoctrine === 1 ? candidates : diverseCandidates(candidates);
  const candidatesToAudit = deduplicated.slice(0, profile.search.maxAuditedCandidates);
  const tacticalDiagnostics = emptyDiagnostics();
  const audited: AuditedCandidate[] = [];
  const minimumCandidateNodes = profile.search.responseMode === 'setups' ? 35 : 1;
  const minimumCandidateMs = profile.search.responseMode === 'setups' ? 8 : 1;
  const perCandidateNodes = Math.max(minimumCandidateNodes, Math.floor(options.tacticalMaxNodes / Math.max(1, candidatesToAudit.length)));
  const perCandidateMs = Math.max(minimumCandidateMs, options.tacticalMaxPlanningMs / Math.max(1, candidatesToAudit.length));
  let responseSequencesChecked = 0;
  for (const candidate of candidatesToAudit) {
    const budget = createBudget(perCandidateNodes, perCandidateMs);
    const result = profile.search.responseMode === 'beam'
      ? auditCandidateWithResponseBeam(state, candidate, actor, options, budget, profile)
      : auditCandidate(state, candidate, actor, budget, profile);
    audited.push(result);
    responseSequencesChecked += result.responseSequencesChecked;
    mergeDiagnostics(tacticalDiagnostics, diagnosticsOf(budget));
  }
  audited.sort(profile.id === 'v3-portfolio'
    ? compareAuditedCandidates
    : profile.id === 'v6-portfolio'
      ? (left, right) => compareV6Candidates(left, right, profile)
      : (left, right) => compareV4Candidates(left, right, profile));
  const best = audited[0];
  const diagnostics: PortfolioDiagnostics = {
    strategy: strategyDiagnostics,
    tactical: tacticalDiagnostics,
    planner: profile.id,
    selectedDoctrine: best?.doctrine ?? 'balanced',
    doctrineScores,
    doctrinesCompleted,
    candidatesGenerated: candidates.length,
    candidatesAfterDeduplication: deduplicated.length,
    tacticalCandidatesAssessed: audited.filter((candidate) => candidate.assessed).length,
    responseSequencesChecked,
  };
  return {
    actions: best?.actions ?? [],
    strategic: best?.strategic ?? evaluateStrategicPosition(state, actor),
    tactical: best?.tactical ?? conservativeAssessment(state, actor),
    diagnostics,
  };
};

export const planAiTurnV3 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan =>
  planPortfolioAiTurn(state, PLANNER_V3_PROFILE, overrides);
