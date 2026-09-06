import { MAP_DECORATIONS } from '../data/map';
import type { GameState, PlayerId, UnitState } from '../data/types';
import { effectiveRange, effectiveTerrainAt, getValidSummonCoords, hexDistance, sameCoord, unitDefinition } from './engine';
import { createV9Evaluator } from './aiV9Evaluation';

export const createV10Evaluator = (initial?: GameState) => {
  const { travel, unitValue: baseValue } = createV9Evaluator();
  const unitValue = (unit: UnitState) => unit.definitionId === 'commander' ? 10_000 + unit.hp * 340 : baseValue(unit);
  // Freeze operational targets for a think; opponent movement cannot improve our plan by dragging its target.
  const mission = (state: GameState, player: PlayerId) => {
    const board = initial ?? state;
    const army = board.units.filter((u) => u.owner === player);
    const foes = board.units.filter((u) => u.owner !== player);
    const leader = army.find((u) => u.definitionId === 'commander');
    const enemyLeader = foes.find((u) => u.definitionId === 'commander');
    const pressure = (at: UnitState['coord']) => foes.reduce((n, u) => n + Math.max(0, 5 - hexDistance(at, u.coord)) * unitDefinition(u).attack, 0);
    const contested = board.sites.filter((site) => site.owner !== player).sort((a, b) =>
      Math.min(...army.map((u) => travel(board, u, a.coord))) - (a.type === 'fort' ? 1 : 0)
      - Math.min(...army.map((u) => travel(board, u, b.coord))) + (b.type === 'fort' ? 1 : 0));
    const threatened = board.sites.filter((site) => site.owner === player && pressure(site.coord) > 0)
      .sort((a, b) => pressure(b.coord) - pressure(a.coord))[0];
    const lead = board.sites.reduce((n, site) => n + (site.owner === player ? 1 : site.owner ? -1 : 0), 0);
    const target = board.countdown?.player === player ? leader?.coord
      : board.countdown || lead >= 2 ? enemyLeader?.coord
      : threatened?.coord ?? contested[0]?.coord ?? enemyLeader?.coord;
    const runners = new Map<string, UnitState['coord']>();
    for (const site of contested.slice(0, 2)) {
      const runner = army.filter((u) => !runners.has(u.id) && u.definitionId !== 'commander')
        .sort((a, b) => travel(board, a, site.coord) - travel(board, b, site.coord))[0];
      if (runner) runners.set(runner.id, site.coord);
    }
    return { target, runners };
  };
  const missions = initial ? { 1: mission(initial, 1), 2: mission(initial, 2) } : undefined;
  const position = (state: GameState, unit: UnitState): number => {
    const d = unitDefinition(unit);
    const enemies = state.units.filter((other) => other.owner !== unit.owner);
    const friends = state.units.filter((other) => other.owner === unit.owner && other.id !== unit.id);
    const nearest = Math.min(20, ...enemies.map((other) => hexDistance(unit.coord, other.coord)));
    const leader = unit.definitionId === 'commander';
    const preserveLeader = leader && unit.hp <= 6;
    let value = 0;
    const operation = missions?.[unit.owner] ?? mission(state, unit.owner);
    const target = operation.runners.get(unit.id) ?? operation.target;
    const pursuingCountdown = state.countdown?.player === unit.owner;
    const activity = leader ? ((pursuingCountdown || preserveLeader) ? 0 : Math.min(1, Math.max(0, (unit.hp - 3) / 5))) : 1;
    if (target) value += Math.max(0, 12 - travel(state, unit, target)) * (leader ? 90 : 70) * activity;
    if (nearest <= 5 && !leader) value += Math.max(0, 5 - nearest) * d.attack * 12;
    if (leader && unit.hp >= 6 && !pursuingCountdown) value += friends.filter((ally) => hexDistance(unit.coord, ally.coord) <= 2).length * 45;
    let incoming = 0;
    for (const enemy of enemies) {
      const enemyDefinition = unitDefinition(enemy);
      const distance = hexDistance(unit.coord, enemy.coord);
      const reach = effectiveRange(enemy) + (enemyDefinition.traits.includes('SetShot') ? 0 : enemyDefinition.move);
      if (distance > reach) continue;
      const immediate = distance <= effectiveRange(enemy);
      incoming += enemyDefinition.attack * (preserveLeader || immediate || enemyDefinition.traits.includes('Flying') ? 1 : 0.45);
    }
    const linked = unit.soulLinkTargetId ? friends.find((ally) => ally.id === unit.soulLinkTargetId) : undefined;
    const exposedHp = unit.hp + (linked?.hp ?? 0);
    value -= Math.min(incoming, exposedHp) * (preserveLeader ? 400 : leader ? 95 : 28);
    if (incoming >= exposedHp) value -= preserveLeader ? 8_000 : leader ? 2_500 : unitValue(unit) * 0.6;
    value -= Math.min(unit.hp, (unit.curses ?? []).reduce((sum, curse) => sum + curse.remainingTurns, 0)) * (leader ? 160 : 85);
    if (d.traits.includes('Assist') && nearest <= effectiveRange(unit) + 2) value += Math.min(2, friends.filter((ally) => hexDistance(unit.coord, ally.coord) <= 2).length) * 70;
    if (d.traits.includes('HealingAura')) value += friends.reduce((sum, ally) => sum + (hexDistance(unit.coord, ally.coord) === 1 && ally.hp < unitDefinition(ally).maxHp ? 90 : 0), 0);
    if (d.traits.includes('Ranged') && effectiveTerrainAt(state, unit.coord) === 'hill' && nearest <= 6) value += 90;
    for (const decoration of MAP_DECORATIONS) {
      if (!sameCoord(decoration.coord, unit.coord)) continue;
      if (decoration.type === 'ruin') value += 300;
      if (decoration.type === 'village' && unit.hp < d.maxHp) value += leader ? 220 : 90;
    }
    return value;
  };
  const side = (state: GameState, player: PlayerId): number => {
    const units = state.units.filter((unit) => unit.owner === player);
    const runtime = state.players[player];
    let value = units.reduce((sum, unit) => sum + unitValue(unit) + position(state, unit), 0);
    value += runtime.mana * 120 + runtime.hand.length * 30;
    const siteValue = (type: GameState['sites'][number]['type']) => type === 'fort' ? 850 : type === 'well' ? 750 : 950;
    for (const site of state.sites) if (site.owner === player) {
      const power = (owner: PlayerId) => state.units.filter((u) => u.owner === owner).reduce((sum, u) =>
        sum + (unitDefinition(u).attack + u.hp * 0.3) / (1 + travel(state, u, site.coord)), 0);
      const friendly = power(player), enemy = power(player === 1 ? 2 : 1);
      const hold = enemy === 0 ? 1 : Math.min(1, friendly / enemy);
      const usable = site.type === 'well' || getValidSummonCoords(state, player).length > 0;
      value += siteValue(site.type) * (0.25 + hold * 0.75) * (usable ? 1 : 0.75);
    }
    const pairs = state.sites.filter((site) => site.owner !== player).flatMap((site) => units.map((unit) => ({
      site, unit, value: siteValue(site.type) * 0.7 / (1 + travel(state, unit, site.coord)),
    }))).sort((a, b) => b.value - a.value);
    const assignedUnits = new Set<string>();
    const assignedSites = new Set<string>();
    for (const pair of pairs) {
      if (assignedUnits.has(pair.unit.id) || assignedSites.has(pair.site.id)) continue;
      assignedUnits.add(pair.unit.id); assignedSites.add(pair.site.id); value += pair.value;
    }
    value += state.pendingManaWells.filter((well) => well.owner === player).reduce((sum, well) => sum + 600 / (1 + well.remainingTurns * 0.5), 0);
    if (runtime.mana >= 2 && runtime.hand.length && !getValidSummonCoords(state, player).length) value -= 400;
    return value;
  };
  const evaluate = (state: GameState, player: PlayerId): number => {
    if (state.winner) return state.winner === player ? 1_000_000 : -1_000_000;
    const countdown = state.countdown ? (state.countdown.player === player ? 1 : -1) * (12_000 + state.countdown.checkpoints * 6_000) : 0;
    return side(state, player) - side(state, player === 1 ? 2 : 1) + countdown;
  };
  return { evaluate, position, travel, unitValue };
};
