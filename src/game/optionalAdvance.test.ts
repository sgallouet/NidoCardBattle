import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import type { Coord, UnitState } from '../data/types';
import { applyGameAction, getLegalGameActions } from './actions';
import { snapshotBattleState } from './battleLog';
import { attackUnit, coordKey, createGameState, displaceUnit, endTurn, getReachableCoords, moveUnit, neighbors, terrainAt, thunderAtCoord } from './engine';
import { planAiTurnV9 } from './aiPlannerV9';

const unit = (id: string, definitionId: UnitDefinitionId, owner: 1 | 2, coord: Coord, extra: Partial<UnitState> = {}): UnitState => ({
  id, definitionId, owner, coord, hp: UNIT_DEFINITIONS[definitionId].maxHp,
  exhausted: false, moved: false, attacked: false, ...extra,
});
const scenario = (definitionId: UnitDefinitionId = 'royalGuard') => {
  const state = createGameState(() => 0.25);
  const attacker = unit('attacker', definitionId, 1, { q: 8, r: 4 });
  const defender = unit('defender', 'skeletalInfantry', 2, { q: 9, r: 4 }, { hp: 1 });
  state.units = [attacker, defender, unit('enemy-commander', 'commander', 2, { q: 15, r: 4 })];
  state.sites = [];
  return { state, attacker, defender };
};

describe('UNC4 and UDR6', () => {
  it('exposes UNC4 through the shared action boundary and state snapshot', () => {
    const { state, attacker, defender } = scenario();
    expect(attackUnit(state, attacker.id, defender.id).ok).toBe(true);
    const action = { kind: 'move' as const, unitId: attacker.id, destination: defender.coord };
    expect(getLegalGameActions(state)).toContainEqual(action);
    expect(snapshotBattleState(state).units.find((entry) => entry.id === attacker.id)?.pendingAdvance).toEqual([9, 4]);
    expect(applyGameAction(state, action).ok).toBe(true);
    expect(getLegalGameActions(state).some((entry) => 'unitId' in entry && entry.unitId === attacker.id)).toBe(false);
  });
  it('expires UNC4 at GRT7 without changing the attacker position', () => {
    const { state, attacker, defender } = scenario();
    attackUnit(state, attacker.id, defender.id);
    const position = { ...attacker.coord };
    endTurn(state, () => 0.25);
    expect(attacker.coord).toEqual(position);
    expect(attacker.pendingAdvance).toBeUndefined();
  });
  it('checks CRC4 and UNM3 again when UNC4 is chosen', () => {
    const { state, attacker, defender } = scenario();
    attackUnit(state, attacker.id, defender.id);
    state.tileEffects.push({ kind: 'graveLock', coord: defender.coord, sourcePlayer: 2, expiresAtTurn: 4 });
    expect(moveUnit(state, attacker.id, defender.coord).ok).toBe(false);
    state.tileEffects = [];
    state.units.push(unit('occupant', 'royalGuard', 1, defender.coord));
    expect(moveUnit(state, attacker.id, defender.coord).ok).toBe(false);
    expect(attacker.coord).toEqual({ q: 8, r: 4 });
  });
  it('applies MPC1 after automatic UNC4', () => {
    const { state, attacker, defender } = scenario();
    state.sites.push({ id: 'target', type: 'well', coord: defender.coord, owner: 2, initialOwner: 2 });
    attackUnit(state, attacker.id, defender.id);
    expect(attacker.coord).toEqual(defender.coord);
    expect(state.sites[0].owner).toBe(2);
    endTurn(state, () => 0.25);
    expect(state.sites[0].owner).toBe(1);
  });
  it('keeps UNT6 and UNC4 as alternative post-attack choices', () => {
    for (const advance of [false, true]) {
      const { state, attacker, defender } = scenario('silverwingCavalry');
      attacker.moved = true;
      attacker.movementSpent = 2;
      attackUnit(state, attacker.id, defender.id);
      const destination = advance ? defender.coord : { q: 8, r: 3 };
      expect(moveUnit(state, attacker.id, destination).ok).toBe(true);
      expect(attacker.pendingAdvance).toBeUndefined();
      expect(attacker.postAttackMoved).toBe(true);
      expect(getReachableCoords(state, attacker.id).size).toBe(0);
      expect(attacker.movementSpent).toBe(advance ? 2 : 3);
    }
  });
  it('removes UNC4 when UNB1 changes the attacker position', () => {
    const { state, attacker, defender } = scenario();
    state.units.push(unit('adept', 'windAdept', 1, { q: 8, r: 3 }));
    attackUnit(state, attacker.id, defender.id);
    expect(displaceUnit(state, 'adept', attacker.id, { q: 7, r: 3 }).ok).toBe(true);
    expect(attacker.pendingAdvance).toBeUndefined();
    expect(getReachableCoords(state, attacker.id).size).toBe(0);
  });
  it('does not grant UNC4 for UNT4 or UNB6', () => {
    const { state, attacker, defender } = scenario('longbowRanger');
    attackUnit(state, attacker.id, defender.id);
    expect(attacker.pendingAdvance).toBeUndefined();
    expect(getReachableCoords(state, attacker.id).size).toBe(0);
    const spell = scenario('lightMage');
    expect(thunderAtCoord(spell.state, spell.attacker.id, spell.defender.coord).ok).toBe(true);
    expect(spell.attacker.pendingAdvance).toBeUndefined();
  });
  it('lets the current planner choose UNC4 for MPC1', () => {
    const { state, attacker, defender } = scenario();
    attacker.moved = true;
    attacker.movementSpent = 2;
    state.sites.push({ id: 'target', type: 'well', coord: defender.coord, owner: 2, initialOwner: 2 });
    for (const player of [1, 2] as const) { state.players[player].hand = []; state.players[player].deck = []; }
    const plan = planAiTurnV9(state, {
      strategyMaxNodes: 300, tacticalMaxNodes: 120, strategyMaxPlanningMs: 8_000, tacticalMaxPlanningMs: 8_000,
    });
    const attack = plan.actions.findIndex((action) => action.kind === 'attack' && action.unitId === attacker.id);
    expect(attack).toBeGreaterThanOrEqual(0);
    for (const action of plan.actions) expect(applyGameAction(state, action).ok).toBe(true);
    endTurn(state, () => 0.25);
    expect(state.sites[0].owner).toBe(1);
  });
  it.each(['keep', 'fort', 'well'] as const)('supports UNC4 return from a %s without MPC1 capture', (type) => {
    const { state, attacker, defender } = scenario();
    const origin = { ...attacker.coord };
    attacker.moved = true;
    attacker.movementSpent = 2;
    state.sites.push({ id: 'target', type, coord: defender.coord, owner: 2, initialOwner: 2 });
    expect(attackUnit(state, attacker.id, defender.id).path).toEqual([origin, defender.coord]);
    expect([...getReachableCoords(state, attacker.id)]).toEqual([[coordKey(origin), 0]]);
    expect(moveUnit(state, attacker.id, origin).ok).toBe(true);
    expect(attacker.movementSpent).toBe(2);
    expect(getReachableCoords(state, attacker.id).size).toBe(0);
    endTurn(state, () => 0.25);
    expect(state.sites[0].owner).toBe(2);
  });
  it('checks UNM3 and CRC4 for the UNC4 return', () => {
    const { state, attacker, defender } = scenario();
    const origin = { ...attacker.coord };
    state.sites.push({ id: 'target', type: 'fort', coord: defender.coord, owner: null, initialOwner: null });
    attackUnit(state, attacker.id, defender.id);
    state.tileEffects.push({ kind: 'graveLock', coord: origin, sourcePlayer: 2, expiresAtTurn: 4 });
    expect(moveUnit(state, attacker.id, origin).ok).toBe(false);
    state.tileEffects = [];
    state.units.push(unit('occupant', 'royalGuard', 1, origin));
    expect(moveUnit(state, attacker.id, origin).ok).toBe(false);
  });
  it('applies the UNC4 return exception to UNT6', () => {
    const { state, attacker, defender } = scenario('silverwingCavalry');
    const origin = { ...attacker.coord };
    state.sites.push({ id: 'target', type: 'well', coord: defender.coord, owner: 1, initialOwner: 1 });
    attackUnit(state, attacker.id, defender.id);
    expect(attacker.postAttackMoved).toBe(true);
    expect([...getReachableCoords(state, attacker.id).keys()]).toEqual([coordKey(origin)]);
    expect(moveUnit(state, attacker.id, origin).ok).toBe(true);
    expect(getReachableCoords(state, attacker.id).size).toBe(0);
  });
  it('enforces UDR6 with MPT5 and preserves UNB10', () => {
    const { state, attacker, defender } = scenario();
    attacker.definitionId = 'vampire';
    attacker.hp = 2;
    expect(UNIT_DEFINITIONS.vampire.traits).not.toContain('Flying');
    expect(attackUnit(state, attacker.id, defender.id).bloodDrainHealed).toBe(true);
    expect(attacker.hp).toBe(3);
    attacker.attacked = false;
    delete attacker.pendingAdvance;
    attacker.coord = { q: 8, r: 6 };
    const reachable = [...getReachableCoords(state, attacker.id).keys()].map((key) => {
      const [q, r] = key.split(',').map(Number); return { q, r };
    });
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.some((coord) => ['water', 'cliff', 'mountain'].includes(terrainAt(coord)))).toBe(false);
  });
  it('rejects UNC4 into MPT5 terrain for a ground attacker', () => {
    const { state, attacker, defender } = scenario();
    const water = Array.from({ length: 13 }, (_, r) => Array.from({ length: 18 }, (_, q) => ({ q, r })))
      .flat().find((coord) => terrainAt(coord) === 'water' && neighbors(coord).some((near) => terrainAt(near) === 'plain'))!;
    attacker.coord = neighbors(water).find((coord) => terrainAt(coord) === 'plain')!;
    defender.definitionId = 'silverwingCavalry';
    defender.coord = water;
    expect(attackUnit(state, attacker.id, defender.id).ok).toBe(true);
    expect(attacker.pendingAdvance).toBeUndefined();
    expect(getReachableCoords(state, attacker.id).has(coordKey(water))).toBe(false);
  });
});
