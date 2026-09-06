import { MAP_DECORATIONS } from '../data/map';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { canTraverse, coordKey, effectiveRange, effectiveTerrainAt, getValidSummonCoords, hexDistance, movementCost, neighbors, sameCoord, unitDefinition } from './engine';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';

// Per-think cache: strategic travel excludes transient occupants; action legality does not.
export const createV9Evaluator = () => {
  const routes = new Map<string, Map<string, number>>();
  const travel = (state: GameState, unit: UnitState, target: Coord): number => {
    const key = `${unitDefinition(unit).traits.includes('Flying')}:${coordKey(target)}:${JSON.stringify(state.builtBridges)}:${JSON.stringify(state.scorchedForests)}`;
    let distances = routes.get(key);
    if (!distances) {
      distances = new Map([[coordKey(target), 0]]);
      const queue = [{ coord: target, cost: 0 }];
      while (queue.length) {
        queue.sort((a, b) => a.cost - b.cost);
        const node = queue.shift()!;
        if (node.cost > distances.get(coordKey(node.coord))!) continue;
        for (const coord of neighbors(node.coord)) {
          if (!canTraverse(state, unit, coord) || !canTraverse(state, unit, node.coord)) continue;
          const cost = node.cost + movementCost(state, unit, node.coord);
          if (cost >= (distances.get(coordKey(coord)) ?? Infinity)) continue;
          distances.set(coordKey(coord), cost);
          queue.push({ coord, cost });
        }
      }
      routes.set(key, distances);
    }
    return (distances.get(coordKey(unit.coord)) ?? 60) / unitDefinition(unit).move;
  };

  const unitValue = (unit: UnitState): number => {
    const d = unitDefinition(unit);
    if (unit.definitionId === 'commander') return 10_000 + unit.hp * 420;
    const base = 190 + d.cost * 115 + d.attack * 65 + d.maxHp * 40 + d.range * 30
      + (d.traits.includes('Assist') ? 90 : 0) + (d.traits.includes('Invoker') ? 180 : 0);
    return base * (0.45 + 0.55 * unit.hp / d.maxHp);
  };

  const position = (state: GameState, unit: UnitState): number => {
    const d = unitDefinition(unit);
    const foes = state.units.filter((other) => other.owner !== unit.owner);
    const nearest = Math.min(20, ...foes.map((other) => hexDistance(unit.coord, other.coord)));
    let score = 0;
    if (unit.definitionId !== 'commander') {
      const targets = foes.filter((other) => other.definitionId === 'commander');
      if (!targets.length) targets.push(...foes);
      const distance = Math.min(30, ...targets.map((other) => travel(state, unit, other.coord)));
      score += Math.max(0, 12 - distance) * (25 + d.attack * 8);
    }
    if (d.traits.includes('Ranged') && effectiveTerrainAt(state, unit.coord) === 'hill') score += nearest <= 7 ? 100 : 20;
    for (const decoration of MAP_DECORATIONS) {
      if (!sameCoord(decoration.coord, unit.coord)) continue;
      if (decoration.type === 'ruin') score += 230;
      if (decoration.type === 'village' && unit.hp < d.maxHp) score += unit.definitionId === 'commander' ? 270 : 110;
    }
    const friends = state.units.filter((other) => other.owner === unit.owner && other.id !== unit.id);
    if (d.traits.includes('Assist') && nearest <= effectiveRange(unit) + 2) {
      score += Math.min(2, friends.filter((other) => hexDistance(unit.coord, other.coord) <= 2).length) * 45;
    }
    if (d.traits.includes('HealingAura')) score += friends.reduce((sum, other) => sum
      + (hexDistance(unit.coord, other.coord) === 1 ? Math.min(1, unitDefinition(other).maxHp - other.hp) * 95 : 0), 0);
    // Only immediate geometry here. Actual movement, attacks and combinations are searched.
    const directDamage = foes.reduce((sum, other) => sum
      + (hexDistance(unit.coord, other.coord) <= effectiveRange(other) ? unitDefinition(other).attack : 0), 0);
    score -= Math.min(unit.hp, directDamage) * (unit.definitionId === 'commander' ? 160 : 25);
    score -= Math.min(unit.hp, (unit.curses ?? []).reduce((sum, curse) => sum + curse.remainingTurns, 0))
      * (unit.definitionId === 'commander' ? 220 : 65);
    return score;
  };

  const side = (state: GameState, player: PlayerId): number => {
    const own = state.players[player];
    const units = state.units.filter((unit) => unit.owner === player);
    let value = units.reduce((sum, unit) => sum + unitValue(unit) + position(state, unit), 0);
    value += own.mana * 150 + own.hand.length * 35;
    for (const site of state.sites) {
      if (site.owner === player) value += site.type === 'keep' ? 850 : site.type === 'well' ? 700 : 600;
    }
    const assigned = new Set<string>();
    for (const site of state.sites.filter((site) => site.owner !== player)) {
      const runners = units.filter((unit) => !assigned.has(unit.id)).map((unit) => ({ unit, distance: travel(state, unit, site.coord) }));
      runners.sort((a, b) => a.distance - b.distance);
      const runner = runners[0];
      if (!runner) continue;
      assigned.add(runner.unit.id);
      value += (site.type === 'well' ? 650 : 550) / (1 + runner.distance);
    }
    value += state.pendingManaWells.filter((well) => well.owner === player)
      .reduce((sum, well) => sum + 500 / (1 + well.remainingTurns * 0.4), 0);
    const spawn = getValidSummonCoords(state, player);
    if (own.hand.some((id) => {
      const card = CARD_DEFINITIONS[id as CardDefinitionId];
      return card?.type === 'unit' && card.cost <= own.mana;
    }) && !spawn.length) value -= 500;
    return value;
  };
  const evaluate = (state: GameState, player: PlayerId): number => {
    if (state.winner) return state.winner === player ? 1_000_000 : -1_000_000;
    const countdown = state.countdown ? (state.countdown.player === player ? 1 : -1) * (12_000 + state.countdown.checkpoints * 6_000) : 0;
    return side(state, player) - side(state, player === 1 ? 2 : 1) + countdown;
  };
  return { evaluate, position, travel, unitValue };
};
