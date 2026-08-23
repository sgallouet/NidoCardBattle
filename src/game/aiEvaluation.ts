import type { GameState, PlayerId, UnitState } from '../data/types';
import { hexDistance, terrainAt, unitDefinition } from './engine';

export interface StrategicComponents {
  economy: number;
  army: number;
  objectives: number;
  position: number;
  commander: number;
  victory: number;
}

export interface StrategicEvaluation {
  /** Explainable outlook only; Stage 1 deliberately does not claim this is a probability. */
  outlook: number;
  components: StrategicComponents;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const scaled = (raw: number, scale: number, range: number): number =>
  Math.tanh(raw / scale) * range;

const opponentOf = (player: PlayerId): PlayerId => player === 1 ? 2 : 1;

const commander = (state: GameState, player: PlayerId): UnitState | undefined =>
  state.units.find((unit) => unit.owner === player && unit.definitionId === 'commander');

export const strategicUnitValue = (unit: UnitState): number => {
  const definition = unitDefinition(unit);
  if (unit.definitionId === 'commander') return 0;
  const base = (definition.cost + 1) * 110
    + definition.attack * 45
    + definition.maxHp * 28
    + definition.move * 16
    + definition.range * 20
    + definition.traits.length * 24
    + (definition.ability ? 55 : 0);
  const health = 0.45 + 0.55 * Math.max(0, unit.hp) / definition.maxHp;
  const readiness = unit.exhausted ? 0.9 : unit.attacked && unit.moved ? 0.96 : 1;
  return base * health * readiness;
};

const projectedIncome = (state: GameState, player: PlayerId): number => {
  const playerTurn = Math.ceil(state.turnNumber / 2);
  const keeps = state.sites.filter((site) => site.owner === player && site.type === 'keep').length;
  const wells = state.sites.filter((site) => site.owner === player && site.type === 'well').length;
  let income = keeps * 3;
  for (let offset = 1; offset <= 3; offset += 1) {
    if ((playerTurn + offset) % 3 === 0) income += wells * 2;
  }
  return income;
};

const controlledSpawnCapacity = (state: GameState, player: PlayerId): number =>
  state.sites.filter((site) => site.owner === player
    && (site.type === 'keep' || site.type === 'fort')
    && !state.units.some((unit) => unit.coord.q === site.coord.q && unit.coord.r === site.coord.r)).length;

const commanderPressure = (state: GameState, attacker: PlayerId, target: UnitState): number =>
  state.units.reduce((pressure, unit) => {
    if (unit.owner !== attacker || unit.exhausted) return pressure;
    const definition = unitDefinition(unit);
    const hillRange = definition.range > 1 && terrainAt(unit.coord) === 'hill' ? 1 : 0;
    const reach = definition.move + definition.range + hillRange;
    if (hexDistance(unit.coord, target.coord) > reach) return pressure;
    return pressure + definition.attack;
  }, 0);

const nearestForceDistance = (state: GameState, player: PlayerId, target: UnitState): number => {
  const distances = state.units
    .filter((unit) => unit.owner === player && unit.definitionId !== 'commander')
    .map((unit) => hexDistance(unit.coord, target.coord));
  return distances.length > 0 ? Math.min(...distances) : 20;
};

const closingForcePressure = (state: GameState, player: PlayerId, target: UnitState): number =>
  state.units.reduce((pressure, unit) => {
    if (unit.owner !== player || unit.definitionId === 'commander') return pressure;
    const distance = hexDistance(unit.coord, target.coord);
    if (distance > 7) return pressure;
    const definition = unitDefinition(unit);
    return pressure + Math.max(0, 8 - distance) * (definition.attack + definition.range * 0.5);
  }, 0);

const boardEffectPositionValue = (state: GameState, perspective: PlayerId): number => {
  const opponent = opponentOf(perspective);
  let raw = 0;
  for (const effect of state.tileEffects) {
    const occupant = state.units.find((unit) => unit.coord.q === effect.coord.q && unit.coord.r === effect.coord.r);
    if (occupant) raw += occupant.owner === perspective ? -180 : 180;
    const sign = effect.sourcePlayer === perspective ? 1 : -1;
    const enemyCommander = commander(state, effect.sourcePlayer === perspective ? opponent : perspective);
    if (enemyCommander) raw += sign * Math.max(0, 5 - hexDistance(effect.coord, enemyCommander.coord)) * 30;
  }
  for (const bridge of state.builtBridges) {
    const ownDistance = Math.min(12, ...state.units
      .filter((unit) => unit.owner === perspective)
      .map((unit) => hexDistance(unit.coord, bridge)));
    const enemyDistance = Math.min(12, ...state.units
      .filter((unit) => unit.owner === opponent)
      .map((unit) => hexDistance(unit.coord, bridge)));
    raw += (enemyDistance - ownDistance) * 12;
  }
  return raw;
};

export const evaluateStrategicPosition = (
  state: GameState,
  perspective: PlayerId,
): StrategicEvaluation => {
  const opponent = opponentOf(perspective);
  if (state.winner === perspective) {
    return {
      outlook: 100,
      components: { economy: 0, army: 0, objectives: 0, position: 0, commander: 0, victory: 100 },
    };
  }
  if (state.winner === opponent) {
    return {
      outlook: -100,
      components: { economy: 0, army: 0, objectives: 0, position: 0, commander: 0, victory: -100 },
    };
  }

  const own = state.players[perspective];
  const enemy = state.players[opponent];
  const economyRaw = (own.mana - enemy.mana) * 35
    + projectedIncome(state, perspective) * 28
    - projectedIncome(state, opponent) * 28
    + (controlledSpawnCapacity(state, perspective) - controlledSpawnCapacity(state, opponent)) * 45
    + own.hand.length * 24
    + own.deck.length * 6;

  const armyRaw = state.units.reduce((total, unit) =>
    total + (unit.owner === perspective ? 1 : -1) * strategicUnitValue(unit), 0);

  let objectiveRaw = 0;
  for (const site of state.sites) {
    const sign = site.owner === perspective ? 1 : site.owner === opponent ? -1 : 0;
    if (site.type === 'keep') objectiveRaw += sign * 420;
    if (site.type === 'well') objectiveRaw += sign * 320;
    if (site.type === 'fort') objectiveRaw += sign * 240;
  }
  for (const pending of state.pendingManaWells) {
    const sign = pending.owner === perspective ? 1 : -1;
    objectiveRaw += sign * Math.max(80, 240 - pending.remainingTurns * 40);
  }

  const ownCommander = commander(state, perspective);
  const enemyCommander = commander(state, opponent);
  let commanderRaw = 0;
  let positionRaw = boardEffectPositionValue(state, perspective);
  if (!ownCommander) commanderRaw -= 40_000;
  if (!enemyCommander) commanderRaw += 36_000;
  if (ownCommander && enemyCommander) {
    const ownHealth = ownCommander.hp / unitDefinition(ownCommander).maxHp;
    const enemyHealth = enemyCommander.hp / unitDefinition(enemyCommander).maxHp;
    commanderRaw += (ownHealth - enemyHealth) * 36_000;
    commanderRaw -= commanderPressure(state, opponent, ownCommander) * 700;
    commanderRaw += commanderPressure(state, perspective, enemyCommander) * 700;

    const ownApproach = nearestForceDistance(state, perspective, enemyCommander);
    const enemyApproach = nearestForceDistance(state, opponent, ownCommander);
    positionRaw += (enemyApproach - ownApproach) * 180;
    positionRaw += closingForcePressure(state, perspective, enemyCommander) * 75;
    positionRaw -= closingForcePressure(state, opponent, ownCommander) * 75;
  }

  let victoryRaw = 0;
  if (state.countdown?.player === perspective) victoryRaw += 12_000 + state.countdown.checkpoints * 8_000;
  if (state.countdown?.player === opponent) victoryRaw -= 16_000 + state.countdown.checkpoints * 10_000;

  const components: StrategicComponents = {
    economy: scaled(economyRaw, 900, 14),
    army: scaled(armyRaw, 2_200, 20),
    objectives: scaled(objectiveRaw, 1_100, 16),
    position: scaled(positionRaw, 1_800, 20),
    commander: scaled(commanderRaw, 7_000, 36),
    victory: scaled(victoryRaw, 14_000, 40),
  };
  const outlook = clamp(Object.values(components).reduce((sum, value) => sum + value, 0), -100, 100);
  return { outlook, components };
};
