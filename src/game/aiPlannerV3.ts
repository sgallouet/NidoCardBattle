import { CARD_DEFINITIONS } from '../data/cards';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS } from '../data/units';
import { GAME_ACTION_KINDS } from './actions';
import {
  COMMON_AI_OPTIONS,
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
import { endTurn, findUnit, hexDistance, terrainAt, unitDefinition } from './engine';

export type PlannerV3Doctrine =
  | 'assassinate'
  | 'deployment-tempo'
  | 'objective-rush'
  | 'attrition'
  | 'fortress'
  | 'mana-engine'
  | 'mobility-flank'
  | 'ability-combo'
  | 'balanced';

const DOCTRINES: readonly PlannerV3Doctrine[] = [
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

export const LIVE_AI_OPTIONS_V3: Required<AiSearchOptions> = {
  ...COMMON_AI_OPTIONS,
  beamWidth: 3,
  maxDepth: 6,
  strategyMaxNodes: 2_600,
  strategyMaxPlanningMs: 160,
  candidatePlans: DOCTRINES.length,
  responseBeamWidth: 3,
  responseDepth: 2,
  tacticalMaxNodes: 1_200,
  tacticalMaxPlanningMs: 120,
};

interface V3Diagnostics {
  strategy: SearchPhaseDiagnostics;
  tactical: SearchPhaseDiagnostics;
  planner: 'v3-portfolio';
  selectedDoctrine: PlannerV3Doctrine;
  doctrineScores: Partial<Record<PlannerV3Doctrine, number>>;
  doctrinesCompleted: number;
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
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const emptyCounts = (): ActionKindCounts => ({ summon: 0, tactic: 0, move: 0, attack: 0, displace: 0, rally: 0, soulLink: 0, curse: 0, invoke: 0 });
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

const doctrineUrgency = (state: GameState, actor: PlayerId, doctrine: PlannerV3Doctrine): number => {
  const enemy = opponentOf(actor);
  const ownCommander = commander(state, actor);
  const enemyCommander = commander(state, enemy);
  const ownDanger = approximateIncomingDamage(state, enemy, ownCommander);
  const enemyHp = enemyCommander?.hp ?? 0;
  const deploymentEmergency = freeDeploymentSites(state, actor) === 0 && playableUnitCards(state, actor) > 0;
  const siteDeficit = siteControlValue(state, enemy) - siteControlValue(state, actor);
  switch (doctrine) {
    case 'assassinate': return (enemyHp <= 5 ? 20 : 4) + Math.max(0, 8 - enemyHp) * 2;
    case 'deployment-tempo': return deploymentEmergency ? 28 : state.players[actor].mana >= 5 ? 10 : 3;
    case 'objective-rush': return 7 + Math.max(0, siteDeficit) * 2;
    case 'attrition': return 6 + Math.max(0, lethalExposureValue(state, enemy) / 350);
    case 'fortress': return ownDanger >= (ownCommander?.hp ?? 10) ? 30 : ownDanger > 0 ? 16 : 3;
    case 'mana-engine': return 4 + state.sites.filter((site) => site.type === 'well' && site.owner !== actor).length * 3;
    case 'mobility-flank': return 5 + state.units.filter((unit) => unit.owner === actor && unitDefinition(unit).move >= 3).length;
    case 'ability-combo': return 4 + state.units.filter((unit) => unit.owner === actor && unitDefinition(unit).ability).length * 2;
    case 'balanced': return 8;
  }
};

const commonActionScore = (state: GameState, actor: PlayerId, action: AiAction): number => {
  const enemy = opponentOf(actor);
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
    const capture = state.sites.some((site) => site.owner !== actor && sameCoord(site.coord, action.destination));
    const danger = approximateThreatCount(state, enemy, action.destination);
    return (freesDeployment ? 14_000 : 0) + (capture ? 8_000 : 0) - danger * 450;
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
      + (enemyCommander ? Math.max(0, 12 - hexDistance(action.destination, enemyCommander.coord)) * 120 : 0)
      - danger * 500 - (lethalDanger ? 12_000 : 0);
  }
  if (action.kind === 'curse') {
    const target = findUnit(state, action.targetId);
    return target?.definitionId === 'commander' ? 8_000 : 3_500 + (target ? strategicUnitValue(target) : 0);
  }
  if (action.kind === 'displace') {
    const target = findUnit(state, action.targetId);
    const targetSite = target && state.sites.some((site) => site.owner === target.owner && sameCoord(site.coord, target.coord));
    return 3_500 + (targetSite ? 4_000 : 0) + (target?.definitionId === 'commander' ? 3_000 : 0);
  }
  if (action.kind === 'rally') return 4_000;
  if (action.kind === 'soulLink') return 3_800;
  if (action.kind === 'invoke') return 4_500 - approximateThreatCount(state, enemy, action.destination) * 350;
  if (action.kind === 'tactic') {
    if (action.cardId === 'raiseFort') return 7_000;
    if (action.cardId === 'profaneWell') return 6_500;
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
      if (action.kind === 'raiseFort') return 8_000;
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
      if (action.kind === 'buildBridge') return 12_000;
      if (action.kind === 'displace') return 7_000;
      return 0;
    case 'ability-combo':
      if (action.kind === 'curse' || action.kind === 'displace' || action.kind === 'rally'
        || action.kind === 'soulLink' || action.kind === 'invoke') return 10_000;
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
): number => {
  const enemy = opponentOf(actor);
  const base = evaluateStrategicPosition(state, actor).outlook * 4;
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
    || action.kind === 'rally' || action.kind === 'soulLink' || action.kind === 'invoke').length;
  const tacticActions = actions.filter((action) => action.kind === 'tactic').length;
  const urgency = doctrineUrgency(initial, actor, doctrine) * 10;
  let doctrineBonus = 0;
  switch (doctrine) {
    case 'assassinate': doctrineBonus = enemyCommanderDamage * 180 - ownCommanderDamage * 120; break;
    case 'deployment-tempo': doctrineBonus = manaSpent * 70 + deployGain * 220 + (state.units.filter((unit) => unit.owner === actor).length - initial.units.filter((unit) => unit.owner === actor).length) * 130; break;
    case 'objective-rush': doctrineBonus = siteSwing * 150 + threatenedCaptureValue(state, actor) * 70; break;
    case 'attrition': doctrineBonus = materialSwing / 5 + exposureImprovement / 8; break;
    case 'fortress': doctrineBonus = -ownCommanderDamage * 180 - approximateIncomingDamage(state, enemy, ownCommanderAfter) * 80 + commanderScreen(state, actor) * 60; break;
    case 'mana-engine': doctrineBonus = (state.sites.filter((site) => site.owner === actor && site.type === 'well').length - initial.sites.filter((site) => site.owner === actor && site.type === 'well').length) * 350 + state.pendingManaWells.filter((well) => well.owner === actor).length * 160 + manaSpent * 35; break;
    case 'mobility-flank': doctrineBonus = siteSwing * 90 + actions.filter((action) => action.kind === 'move').length * 45; break;
    case 'ability-combo': doctrineBonus = abilityActions * 130 + tacticActions * 80; break;
    case 'balanced': doctrineBonus = materialSwing / 10 + siteSwing * 80 + manaSpent * 25 + actions.length * 25; break;
  }
  const emergencyPenalty = freeDeploymentSites(state, actor) === 0 && playableUnitCards(state, actor) > 0 ? 260 : 0;
  return base + urgency + doctrineBonus + actions.length * 18 - emergencyPenalty;
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
): AiAction[] => {
  const selection = selectCandidateActions(state, actor, true);
  const ranked = [...selection.actions].sort((left, right) =>
    commonActionScore(state, actor, right) + doctrineActionBias(state, actor, right, doctrine)
    - commonActionScore(state, actor, left) - doctrineActionBias(state, actor, left, doctrine));
  const retained = ranked.slice(0, 8);
  const representedUnits = new Set(retained.filter((action) => action.kind === 'move').map((action) => action.unitId));
  for (const action of ranked) {
    if (retained.length >= 11) break;
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

const buildDoctrineCandidate = (
  initial: GameState,
  actor: PlayerId,
  doctrine: PlannerV3Doctrine,
  options: Required<AiSearchOptions>,
  budget: Budget,
): DoctrineCandidate => {
  const root = cloneState(initial);
  let beam: DoctrineNode[] = [{ state: root, actions: [], score: doctrineStateScore(initial, root, actor, doctrine, []) }];
  let best: DoctrineNode = beam[0];
  for (let depth = 0; depth < options.maxDepth && beam.length > 0 && !exhausted(budget); depth += 1) {
    const next: DoctrineNode[] = [];
    for (const node of beam) {
      if (exhausted(budget)) break;
      const actions = doctrineActions(node.state, actor, doctrine, budget);
      for (const action of actions.slice(0, 5)) {
        if (exhausted(budget)) break;
        const child = cloneState(node.state);
        const result = applyAiAction(child, action);
        if (!result.ok) continue;
        budget.nodes += 1;
        const childActions = [...node.actions, action];
        const score = doctrineStateScore(initial, child, actor, doctrine, childActions);
        const candidate = { state: child, actions: childActions, score };
        next.push(candidate);
        if (score > best.score) best = candidate;
      }
    }
    next.sort((left, right) => right.score - left.score);
    beam = next.slice(0, Math.max(1, Math.min(3, options.beamWidth)));
  }
  const endedState = finishTurn(best.state, actor);
  return {
    ...best,
    doctrine,
    endedState,
    strategic: evaluateStrategicPosition(endedState, actor),
    score: doctrineStateScore(initial, endedState, actor, doctrine, best.actions),
  };
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
): TacticalAssessment => {
  if (assessment.tier !== 'safe') return assessment;
  const lost = material(beforeResponse, perspective) - material(afterResponse, perspective);
  const deploymentLost = freeDeploymentSites(beforeResponse, perspective) > 0
    && freeDeploymentSites(afterResponse, perspective) === 0;
  if (lost < 240 && !deploymentLost) return assessment;
  return { ...assessment, tier: 'unsafe', score: Math.min(-20, assessment.score - lost / 25 - (deploymentLost ? 25 : 0)) };
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
  options: Required<AiSearchOptions>,
  budget: Budget,
): AuditedCandidate => {
  const responder = opponentOf(perspective);
  if (candidate.endedState.winner || candidate.endedState.currentPlayer !== responder) {
    return { ...candidate, tactical: assessTacticalOutcome(initial, candidate.endedState, perspective, []), responseSequencesChecked: 0, assessed: true };
  }

  const rootSelection = selectCandidateActions(candidate.endedState, responder, false);
  const immediate = rootSelection.actions.filter((action) => action.kind === 'attack')
    .sort((left, right) => commonActionScore(candidate.endedState, responder, right) - commonActionScore(candidate.endedState, responder, left))
    .slice(0, 12)
    .map((action) => [action]);
  const moveSetups = rootSelection.actions.filter((action) => action.kind === 'move')
    .sort((left, right) => commonActionScore(candidate.endedState, responder, right) - commonActionScore(candidate.endedState, responder, left))
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
      .sort((left, right) => commonActionScore(afterSetup, responder, right) - commonActionScore(afterSetup, responder, left))
      .slice(0, 4);
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

export const planAiTurnV3 = (state: GameState, overrides: AiSearchOptions = {}): AiPlan => {
  const actor = state.currentPlayer;
  const options: Required<AiSearchOptions> = { ...LIVE_AI_OPTIONS_V3, ...overrides };
  if (state.winner) {
    const strategic = evaluateStrategicPosition(state, actor);
    return { actions: [], strategic, tactical: assessTacticalOutcome(state, state, actor), diagnostics: { strategy: emptyDiagnostics(), tactical: emptyDiagnostics() } };
  }

  const strategyDiagnostics = emptyDiagnostics();
  const doctrineScores: Partial<Record<PlannerV3Doctrine, number>> = {};
  const candidates: DoctrineCandidate[] = [];
  const perDoctrineNodes = Math.max(40, Math.floor(options.strategyMaxNodes / DOCTRINES.length));
  const perDoctrineMs = Math.max(8, options.strategyMaxPlanningMs / DOCTRINES.length);
  let doctrinesCompleted = 0;

  for (const doctrine of DOCTRINES) {
    const budget = createBudget(perDoctrineNodes, perDoctrineMs);
    const candidate = buildDoctrineCandidate(state, actor, doctrine, options, budget);
    doctrineScores[doctrine] = Math.round(candidate.score);
    candidates.push(candidate);
    mergeDiagnostics(strategyDiagnostics, diagnosticsOf(budget));
    if (budget.stopReason === 'complete') doctrinesCompleted += 1;
  }

  const tacticalDiagnostics = emptyDiagnostics();
  const audited: AuditedCandidate[] = [];
  const perCandidateNodes = Math.max(35, Math.floor(options.tacticalMaxNodes / Math.max(1, candidates.length)));
  const perCandidateMs = Math.max(8, options.tacticalMaxPlanningMs / Math.max(1, candidates.length));
  let responseSequencesChecked = 0;
  for (const candidate of candidates) {
    const budget = createBudget(perCandidateNodes, perCandidateMs);
    const result = auditCandidate(state, candidate, actor, options, budget);
    audited.push(result);
    responseSequencesChecked += result.responseSequencesChecked;
    mergeDiagnostics(tacticalDiagnostics, diagnosticsOf(budget));
  }
  audited.sort(compareAuditedCandidates);
  const best = audited[0];
  const diagnostics: V3Diagnostics = {
    strategy: strategyDiagnostics,
    tactical: tacticalDiagnostics,
    planner: 'v3-portfolio',
    selectedDoctrine: best?.doctrine ?? 'balanced',
    doctrineScores,
    doctrinesCompleted,
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
