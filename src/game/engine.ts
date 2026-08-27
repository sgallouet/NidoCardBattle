import { CARD_DEFINITIONS, FACTION_DECKS, type CardDefinitionId } from '../data/cards';
import { MAP_DECORATIONS, MAP_GARRISONS, MAP_HEIGHT, MAP_SITES, MAP_WIDTH, STARTING_UNITS, TERRAIN } from '../data/map';
import type {
  ActionResult,
  CardDefinition,
  Coord,
  GameState,
  PlayerId,
  Terrain,
  UnitState,
} from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';

const HAND_LIMIT = 6;
export const STARTING_MANA = 3;
export const MAX_MANA = 10;

export const coordKey = ({ q, r }: Coord): string => `${q},${r}`;

export const sameCoord = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;

export const isInsideMap = ({ q, r }: Coord): boolean => q >= 0 && q < MAP_WIDTH && r >= 0 && r < MAP_HEIGHT;

export const terrainAt = (coord: Coord): Terrain => TERRAIN[coord.r][coord.q];

export const isPassable = (coord: Coord): boolean => {
  if (!isInsideMap(coord)) return false;
  const terrain = terrainAt(coord);
  return terrain !== 'water' && terrain !== 'cliff' && terrain !== 'mountain';
};

export const isBuiltBridge = (state: GameState, coord: Coord): boolean =>
  state.builtBridges.some((bridge) => sameCoord(bridge, coord));

export const isScorchedForest = (state: GameState, coord: Coord): boolean =>
  state.scorchedForests.some((forest) => sameCoord(forest, coord));

export const effectiveTerrainAt = (state: GameState, coord: Coord): Terrain => {
  if (isBuiltBridge(state, coord)) return 'bridge';
  if (isScorchedForest(state, coord) && terrainAt(coord) === 'forest') return 'plain';
  return terrainAt(coord);
};

export const isPassableInState = (state: GameState, coord: Coord): boolean => {
  if (!isInsideMap(coord)) return false;
  const terrain = effectiveTerrainAt(state, coord);
  return terrain !== 'water' && terrain !== 'cliff' && terrain !== 'mountain';
};

export const isGraveLocked = (state: GameState, coord: Coord): boolean =>
  state.tileEffects.some((effect) => effect.kind === 'graveLock' && sameCoord(effect.coord, coord));

export const neighbors = (coord: Coord): Coord[] => {
  const even = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const odd = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  return (coord.r % 2 === 0 ? even : odd)
    .map(([dq, dr]) => ({ q: coord.q + dq, r: coord.r + dr }))
    .filter(isInsideMap);
};

const toCube = (coord: Coord): [number, number, number] => {
  const x = coord.q - (coord.r - (coord.r & 1)) / 2;
  const z = coord.r;
  return [x, -x - z, z];
};

const fromCube = ([x, , z]: [number, number, number]): Coord => ({
  q: x + (z - (z & 1)) / 2,
  r: z,
});

export const hexDistance = (a: Coord, b: Coord): number => {
  const ac = toCube(a);
  const bc = toCube(b);
  return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
};

const shuffle = <T>(values: T[], random: () => number): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const cardDefinition = (id: string): CardDefinition => CARD_DEFINITIONS[id as CardDefinitionId];

const definitionFor = (definitionId: string, owner: PlayerId) => {
  if (definitionId === 'commander') {
    return owner === 1 ? UNIT_DEFINITIONS.humanCommander : UNIT_DEFINITIONS.undeadCommander;
  }
  return UNIT_DEFINITIONS[definitionId as UnitDefinitionId];
};

export const unitDefinition = (unit: UnitState) => definitionFor(unit.definitionId, unit.owner);

export const unitAt = (state: GameState, coord: Coord): UnitState | undefined =>
  state.units.find((unit) => sameCoord(unit.coord, coord));

export const findUnit = (state: GameState, id: string): UnitState | undefined =>
  state.units.find((unit) => unit.id === id);

const createUnit = (
  state: Pick<GameState, 'nextUnitId'>,
  definitionId: string,
  owner: PlayerId,
  coord: Coord,
  exhausted: boolean,
): UnitState => {
  const definition = definitionFor(definitionId, owner);
  const unit: UnitState = {
    id: `unit-${state.nextUnitId}`,
    definitionId,
    owner,
    hp: definition.maxHp,
    coord: { ...coord },
    exhausted,
    moved: false,
    attacked: false,
    movementSpent: 0,
    postAttackMoved: false,
    moveBonus: 0,
    curses: [],
  };
  state.nextUnitId += 1;
  return unit;
};

const drawCard = (state: GameState, playerId: PlayerId, random: () => number): void => {
  const player = state.players[playerId];
  if (player.deck.length === 0 && player.discard.length > 0) {
    player.deck = shuffle(player.discard, random);
    player.discard = [];
  }
  const drawn = player.deck.pop();
  if (!drawn) return;
  if (player.hand.length >= HAND_LIMIT) player.discard.push(drawn);
  else player.hand.push(drawn);
};

const beginTurn = (state: GameState, random: () => number): void => {
  state.tileEffects = state.tileEffects.filter((effect) => effect.expiresAtTurn > state.turnNumber);
  const playerId = state.currentPlayer;
  for (const unit of state.units) {
    if (unit.owner !== playerId) continue;
    if (unit.definitionId === 'commander') unit.soulLinkTargetId = undefined;
    unit.exhausted = false;
    unit.moved = false;
    unit.attacked = false;
    unit.movementSpent = 0;
    unit.postAttackMoved = false;
    unit.moveBonus = 0;
  }

  for (const village of MAP_DECORATIONS.filter((decoration) => decoration.type === 'village')) {
    const occupant = unitAt(state, village.coord);
    if (!occupant || occupant.owner !== playerId) continue;
    occupant.hp = Math.min(unitDefinition(occupant).maxHp, occupant.hp + 1);
  }

  const occupiedRuins = MAP_DECORATIONS.filter((decoration) => {
    if (decoration.type !== 'ruin') return false;
    return unitAt(state, decoration.coord)?.owner === playerId;
  }).length;
  const playerTurn = Math.ceil(state.turnNumber / 2);
  let manaIncome = occupiedRuins;
  if (playerTurn > 1) {
    const controlledKeeps = state.sites.filter((site) => site.type === 'keep' && site.owner === playerId).length;
    const controlledWells = state.sites.filter((site) => site.type === 'well' && site.owner === playerId).length;
    const wellIncome = playerTurn % 3 === 0 ? controlledWells * 2 : 0;
    manaIncome += controlledKeeps + wellIncome;
  }
  state.players[playerId].mana = Math.min(MAX_MANA, state.players[playerId].mana + manaIncome);
  drawCard(state, playerId, random);
};

export const createGameState = (random: () => number = Math.random): GameState => {
  const state: GameState = {
    currentPlayer: 1,
    turnNumber: 1,
    players: {
      1: { id: 1, faction: 'human', mana: STARTING_MANA, deck: shuffle(FACTION_DECKS.human, random), hand: [], discard: [] },
      2: { id: 2, faction: 'undead', mana: STARTING_MANA, deck: shuffle(FACTION_DECKS.undead, random), hand: [], discard: [] },
    },
    units: [],
    sites: MAP_SITES.map((site) => ({ ...site, coord: { ...site.coord }, owner: site.initialOwner })),
    builtBridges: [],
    scorchedForests: [],
    pendingManaWells: [],
    tileEffects: [],
    countdown: null,
    winner: null,
    nextUnitId: 1,
    nextSiteId: 1,
  };

  for (const startingUnit of STARTING_UNITS) {
    state.units.push(createUnit(state, startingUnit.definitionId, startingUnit.owner, startingUnit.coord, false));
  }
  for (let draw = 0; draw < 4; draw += 1) {
    drawCard(state, 1, random);
    drawCard(state, 2, random);
  }
  beginTurn(state, random);
  return state;
};

const movementCost = (state: GameState, unit: UnitState, coord: Coord): number =>
  unitDefinition(unit).traits.includes('Flying') || effectiveTerrainAt(state, coord) !== 'forest' ? 1 : 1 / 0.7;

const canTraverse = (state: GameState, unit: UnitState, coord: Coord): boolean => {
  if (!isInsideMap(coord)) return false;
  if (effectiveTerrainAt(state, coord) === 'mountain') return false;
  return unitDefinition(unit).traits.includes('Flying') || isPassableInState(state, coord);
};

export const effectiveMove = (unit: UnitState): number => unitDefinition(unit).move + (unit.moveBonus ?? 0);

export const isStoppedByBlocking = (state: GameState, unit: UnitState, coord: Coord): boolean => {
  if (unitDefinition(unit).traits.includes('Phase')) return false;
  return neighbors(coord).some((neighbor) => {
    const adjacent = unitAt(state, neighbor);
    return adjacent !== undefined
      && adjacent.owner !== unit.owner
      && unitDefinition(adjacent).traits.includes('Blocking');
  });
};

interface MovementSearch {
  reachable: Map<string, number>;
  previous: Map<string, Coord>;
}

const canStartMovementPhase = (unit: UnitState): boolean => {
  if (unit.exhausted) return false;
  const agile = unitDefinition(unit).traits.includes('AgileAssault');
  if (!agile) return !unit.moved && !unit.attacked;
  if (unit.attacked) return !unit.postAttackMoved && (unit.movementSpent ?? 0) < effectiveMove(unit);
  return !unit.moved;
};

const searchMovement = (state: GameState, unitId: string): MovementSearch => {
  const unit = findUnit(state, unitId);
  if (!unit || unit.owner !== state.currentPlayer || !canStartMovementPhase(unit) || isGraveLocked(state, unit.coord)) {
    return { reachable: new Map(), previous: new Map() };
  }

  const reachable = new Map<string, number>([[coordKey(unit.coord), 0]]);
  const previous = new Map<string, Coord>();
  const queue: Array<{ coord: Coord; cost: number }> = [{ coord: unit.coord, cost: 0 }];
  const moveRemaining = effectiveMove(unit) - (unit.movementSpent ?? 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;
    if (current.cost > (reachable.get(coordKey(current.coord)) ?? Number.POSITIVE_INFINITY)) continue;

    for (const next of neighbors(current.coord)) {
      if (isGraveLocked(state, next) || !canTraverse(state, unit, next) || unitAt(state, next)) continue;
      const nextCost = current.cost + movementCost(state, unit, next);
      if (nextCost > moveRemaining + 0.0001) continue;
      const key = coordKey(next);
      if (nextCost >= (reachable.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      reachable.set(key, nextCost);
      previous.set(key, current.coord);
      if (!isStoppedByBlocking(state, unit, next)) queue.push({ coord: next, cost: nextCost });
    }
  }

  return { reachable, previous };
};

export const getReachableCoords = (state: GameState, unitId: string): Map<string, number> => {
  const unit = findUnit(state, unitId);
  if (!unit) return new Map();
  const { reachable } = searchMovement(state, unitId);
  reachable.delete(coordKey(unit.coord));
  return reachable;
};

export const moveUnit = (state: GameState, unitId: string, destination: Coord): ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, message: 'That unit is no longer on the board.' };
  const start = { ...unit.coord };
  const movement = searchMovement(state, unitId);
  const spent = movement.reachable.get(coordKey(destination));
  if (spent === undefined || sameCoord(start, destination)) {
    return { ok: false, message: 'That hex is not reachable.' };
  }

  const path = [{ ...destination }];
  while (!sameCoord(path[path.length - 1], start)) {
    const previous = movement.previous.get(coordKey(path[path.length - 1]));
    if (!previous) throw new Error('Reachable movement destination is missing its resolved path.');
    path.push({ ...previous });
  }
  path.reverse();

  unit.coord = { ...destination };
  unit.movementSpent = (unit.movementSpent ?? 0) + spent;
  if (unit.attacked && unitDefinition(unit).traits.includes('AgileAssault')) unit.postAttackMoved = true;
  else unit.moved = true;
  return { ok: true, message: `${unitDefinition(unit).name} moved.`, path };
};

export const effectiveRange = (unit: UnitState): number => {
  const definition = unitDefinition(unit);
  return definition.traits.includes('Ranged') && terrainAt(unit.coord) === 'hill'
    ? definition.range + 1
    : definition.range;
};

export const getAttackTargets = (state: GameState, unitId: string): UnitState[] => {
  const unit = findUnit(state, unitId);
  if (!unit || unit.owner !== state.currentPlayer || unit.exhausted || unit.attacked) return [];
  const definition = unitDefinition(unit);
  if (definition.traits.includes('SetShot') && (unit.movementSpent ?? 0) > 0) return [];
  const range = effectiveRange(unit);
  return state.units.filter((target) => target.owner !== unit.owner && hexDistance(unit.coord, target.coord) <= range);
};

const commanderAlive = (state: GameState, player: PlayerId): boolean =>
  state.units.some((unit) => unit.owner === player && unit.definitionId === 'commander' && unit.hp > 0);

const opponentOf = (player: PlayerId): PlayerId => player === 1 ? 2 : 1;

const removeDeadUnit = (state: GameState, unit: UnitState, sourcePlayer: PlayerId): void => {
  if (unit.definitionId === 'commander') {
    if (state.countdown?.player === unit.owner) state.countdown = null;
    if (sourcePlayer !== unit.owner && commanderAlive(state, sourcePlayer)) {
      state.countdown = { player: sourcePlayer, checkpoints: 0 };
    }
  }
  state.units = state.units.filter((candidate) => candidate.id !== unit.id);
  for (const commander of state.units) {
    if (commander.soulLinkTargetId === unit.id) commander.soulLinkTargetId = undefined;
  }
  if (!state.units.some((candidate) => candidate.owner === unit.owner)) {
    state.winner = opponentOf(unit.owner);
    state.countdown = null;
  }
};

const applyRawDamage = (state: GameState, target: UnitState, amount: number, sourcePlayer: PlayerId): number => {
  const actual = Math.min(Math.max(0, amount), Math.max(0, target.hp));
  target.hp -= amount;
  if (target.hp <= 0) removeDeadUnit(state, target, sourcePlayer);
  return actual;
};

interface DamageOptions {
  sourceUnitId?: string;
  directAttack?: boolean;
  bypassSoulLink?: boolean;
}

const dealDamage = (
  state: GameState,
  target: UnitState,
  amount: number,
  ranged: boolean,
  sourcePlayer: PlayerId,
  options: DamageOptions = {},
): number => {
  const adjusted = ranged && effectiveTerrainAt(state, target.coord) === 'forest'
    ? Math.max(0, Math.round(amount * 0.7))
    : amount;
  if (adjusted <= 0) return 0;

  const targetDef = unitDefinition(target);
  if (!options.bypassSoulLink
    && target.definitionId === 'commander'
    && targetDef.ability === 'SoulLink'
    && target.soulLinkTargetId) {
    const linked = findUnit(state, target.soulLinkTargetId);
    if (linked
      && linked.owner === target.owner
      && unitDefinition(linked).faction === 'undead'
      && hexDistance(target.coord, linked.coord) === 1) {
      const linkedHpBefore = linked.hp;
      let dealt = applyRawDamage(state, linked, adjusted, sourcePlayer);
      const overflow = Math.max(0, adjusted - Math.max(0, linkedHpBefore));
      const survivingCommander = findUnit(state, target.id);
      if (overflow > 0 && survivingCommander) {
        dealt += applyRawDamage(state, survivingCommander, overflow, sourcePlayer);
      }
      return dealt;
    }
    target.soulLinkTargetId = undefined;
  }

  const dealt = applyRawDamage(state, target, adjusted, sourcePlayer);
  if (options.directAttack && targetDef.traits.includes('DarkReflection') && dealt > 0 && options.sourceUnitId) {
    const source = findUnit(state, options.sourceUnitId);
    const reflected = Math.round(dealt * 0.3);
    if (source && source.owner !== target.owner && reflected > 0) {
      dealDamage(state, source, reflected, false, target.owner, { bypassSoulLink: false });
    }
  }
  return dealt;
};

const CUBE_DIRECTIONS: Array<[number, number, number]> = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
];

const isRearAssist = (attacker: UnitState, defender: UnitState, assister: UnitState): boolean => {
  if (hexDistance(defender.coord, assister.coord) !== 1) return false;
  const targetCube = toCube(defender.coord);
  let attackDirection = CUBE_DIRECTIONS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const direction of CUBE_DIRECTIONS) {
    const towardAttacker = fromCube([
      targetCube[0] + direction[0],
      targetCube[1] + direction[1],
      targetCube[2] + direction[2],
    ]);
    const distance = hexDistance(towardAttacker, attacker.coord);
    if (distance < bestDistance) {
      bestDistance = distance;
      attackDirection = direction;
    }
  }
  const behind = fromCube([
    targetCube[0] - attackDirection[0],
    targetCube[1] - attackDirection[1],
    targetCube[2] - attackDirection[2],
  ]);
  return sameCoord(assister.coord, behind);
};

const assistDamage = (state: GameState, attacker: UnitState, defender: UnitState): number =>
  state.units
    .filter((unit) => unit.id !== attacker.id
      && unit.owner === attacker.owner
      && !unit.exhausted
      && unitDefinition(unit).traits.includes('Assist')
      && hexDistance(unit.coord, defender.coord) <= effectiveRange(unit))
    .reduce((total, assister) => total + (isRearAssist(attacker, defender, assister) ? 2 : 1), 0);

export const attackUnit = (state: GameState, attackerId: string, defenderId: string): ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const attacker = findUnit(state, attackerId);
  const defender = findUnit(state, defenderId);
  if (!attacker || !defender) return { ok: false, message: 'That attack is no longer available.' };
  if (!getAttackTargets(state, attackerId).some((target) => target.id === defenderId)) {
    return { ok: false, message: 'That unit is not a valid attack target.' };
  }

  const attackerDef = unitDefinition(attacker);
  const defenderDef = unitDefinition(defender);
  const defenderCoord = { ...defender.coord };
  const cleaveTargetIds = attackerDef.ability === 'Cleave'
    ? state.units
      .filter((target) => target.owner !== attacker.owner
        && target.id !== defender.id
        && hexDistance(attacker.coord, target.coord) === 1)
      .map((target) => target.id)
    : [];

  attacker.attacked = true;
  const dealt = dealDamage(state, defender, attackerDef.attack, attackerDef.traits.includes('Ranged'), attacker.owner, {
    sourceUnitId: attacker.id,
    directAttack: true,
  });
  const killedByPrimaryAttack = findUnit(state, defenderId) === undefined;

  if (killedByPrimaryAttack
    && attackerDef.traits.includes('Necromancy')
    && !isGraveLocked(state, defenderCoord)
    && !unitAt(state, defenderCoord)) {
    state.units.push(createUnit(state, 'skeletalInfantry', attacker.owner, defenderCoord, true));
  }

  for (const targetId of cleaveTargetIds) {
    const target = findUnit(state, targetId);
    if (!target) continue;
    dealDamage(state, target, attackerDef.attack, false, attacker.owner, {
      sourceUnitId: attacker.id,
      directAttack: true,
    });
  }

  let assisted = 0;
  const survivingDefender = findUnit(state, defenderId);
  if (survivingDefender
    && !attackerDef.traits.includes('Ranged')
    && hexDistance(attacker.coord, defenderCoord) === 1) {
    const bonus = assistDamage(state, attacker, survivingDefender);
    if (bonus > 0) assisted = dealDamage(state, survivingDefender, bonus, false, attacker.owner);
  }

  const survivingAttacker = findUnit(state, attackerId);
  if (survivingAttacker && dealt > 0 && attackerDef.ability === 'BloodDrain') {
    survivingAttacker.hp = Math.min(attackerDef.maxHp, survivingAttacker.hp + 1);
  }

  const defenderAfterDamage = findUnit(state, defenderId);
  const attackerAfterDamage = findUnit(state, attackerId);
  if (defenderAfterDamage
    && attackerAfterDamage
    && defenderDef.traits.includes('Retaliates')
    && hexDistance(attackerAfterDamage.coord, defenderAfterDamage.coord) <= effectiveRange(defenderAfterDamage)) {
    const retaliation = attackerDef.traits.includes('AgileAssault')
      ? Math.ceil(defenderDef.attack * 0.5)
      : defenderDef.attack;
    dealDamage(state, attackerAfterDamage, retaliation, defenderDef.traits.includes('Ranged'), defenderAfterDamage.owner, {
      sourceUnitId: defenderAfterDamage.id,
      directAttack: true,
    });
  }

  const assistText = assisted > 0 ? ` + ${assisted} Assist` : '';
  const victoryText = state.winner ? ` Player ${state.winner} wins the match.` : '';
  return { ok: true, message: `${attackerDef.name} attacked ${defenderDef.name} for ${dealt}${assistText}.${victoryText}` };
};

export const getDisplaceTargets = (state: GameState, unitId: string): UnitState[] => {
  const actor = findUnit(state, unitId);
  if (!actor || actor.owner !== state.currentPlayer || actor.exhausted || actor.attacked) return [];
  if (unitDefinition(actor).ability !== 'Displace') return [];
  return state.units.filter((target) => target.id !== actor.id
    && !isGraveLocked(state, target.coord)
    && hexDistance(actor.coord, target.coord) === 1);
};

export const getRestoreTargets = (state: GameState, sourceId: string): UnitState[] => {
  const source = findUnit(state, sourceId);
  if (!source || unitDefinition(source).ability !== 'Restore') return [];
  return state.units.filter((target) => target.id !== source.id
    && target.owner === source.owner
    && hexDistance(source.coord, target.coord) === 1
    && target.hp < unitDefinition(target).maxHp);
};

export const restoreAdjacentAlly = (state: GameState, sourceId: string, targetId: string): ActionResult => {
  const source = findUnit(state, sourceId);
  const target = findUnit(state, targetId);
  if (!source || !target || !getRestoreTargets(state, sourceId).some((candidate) => candidate.id === targetId)) {
    return { ok: false, message: 'Choose a damaged adjacent ally.' };
  }
  target.hp = Math.min(unitDefinition(target).maxHp, target.hp + 2);
  return { ok: true, message: `${unitDefinition(source).name} restored 2 HP to ${unitDefinition(target).name}.` };
};

export const getDisplaceDestinations = (state: GameState, actorId: string, targetId: string): Coord[] => {
  const actor = findUnit(state, actorId);
  const target = findUnit(state, targetId);
  if (!actor || !target || !getDisplaceTargets(state, actorId).some((candidate) => candidate.id === targetId)) return [];
  return neighbors(actor.coord).filter((coord) => isPassableInState(state, coord)
    && !isGraveLocked(state, coord)
    && !unitAt(state, coord)
    && !sameCoord(coord, target.coord));
};

export const displaceUnit = (state: GameState, actorId: string, targetId: string, destination: Coord): ActionResult => {
  const actor = findUnit(state, actorId);
  const target = findUnit(state, targetId);
  if (!actor || !target) return { ok: false, message: 'That displacement is no longer available.' };
  if (!getDisplaceDestinations(state, actorId, targetId).some((coord) => sameCoord(coord, destination))) {
    return { ok: false, message: 'That is not a valid displacement destination.' };
  }
  target.coord = { ...destination };
  actor.attacked = true;
  return { ok: true, message: `${unitDefinition(actor).name} displaced ${unitDefinition(target).name}.` };
};

export const getRallyTargets = (state: GameState, actorId: string): UnitState[] => {
  const actor = findUnit(state, actorId);
  if (!actor || actor.owner !== state.currentPlayer || actor.exhausted || actor.attacked || unitDefinition(actor).ability !== 'Rally') return [];
  return state.units.filter((target) => target.id !== actor.id
    && target.owner === actor.owner
    && !target.exhausted
    && (target.movementSpent ?? 0) === 0
    && hexDistance(actor.coord, target.coord) === 1);
};

export const rallyAdjacentAllies = (state: GameState, actorId: string): ActionResult => {
  const actor = findUnit(state, actorId);
  if (!actor || actor.owner !== state.currentPlayer || actor.exhausted || actor.attacked || unitDefinition(actor).ability !== 'Rally') {
    return { ok: false, message: 'Rally is not available.' };
  }
  const targets = getRallyTargets(state, actorId);
  for (const target of targets) target.moveBonus = (target.moveBonus ?? 0) + 1;
  actor.attacked = true;
  return { ok: true, message: `Rally gave ${targets.length} adjacent ${targets.length === 1 ? 'ally' : 'allies'} +1 Move this turn.` };
};

export const getSoulLinkTargets = (state: GameState, actorId: string): UnitState[] => {
  const actor = findUnit(state, actorId);
  if (!actor || actor.owner !== state.currentPlayer || actor.exhausted || actor.attacked || unitDefinition(actor).ability !== 'SoulLink') return [];
  return state.units.filter((target) => target.id !== actor.id
    && target.owner === actor.owner
    && unitDefinition(target).faction === 'undead'
    && hexDistance(actor.coord, target.coord) === 1);
};

export const soulLinkUnit = (state: GameState, actorId: string, targetId: string): ActionResult => {
  const actor = findUnit(state, actorId);
  const target = findUnit(state, targetId);
  if (!actor || !target || !getSoulLinkTargets(state, actorId).some((candidate) => candidate.id === targetId)) {
    return { ok: false, message: 'Choose an adjacent Undead ally for Soul Link.' };
  }
  actor.soulLinkTargetId = target.id;
  actor.attacked = true;
  return { ok: true, message: `${unitDefinition(actor).name} linked its life to ${unitDefinition(target).name} until its next turn.` };
};

export const getCurseTargets = (state: GameState, actorId: string): UnitState[] => {
  const actor = findUnit(state, actorId);
  if (!actor || actor.owner !== state.currentPlayer || actor.exhausted || actor.attacked || unitDefinition(actor).ability !== 'Curse') return [];
  return state.units.filter((target) => target.owner !== actor.owner
    && hexDistance(actor.coord, target.coord) <= effectiveRange(actor));
};

export const curseUnit = (state: GameState, actorId: string, targetId: string): ActionResult => {
  const actor = findUnit(state, actorId);
  const target = findUnit(state, targetId);
  if (!actor || !target || !getCurseTargets(state, actorId).some((candidate) => candidate.id === targetId)) {
    return { ok: false, message: 'Choose an enemy within Curse range.' };
  }
  target.curses = [...(target.curses ?? []), { sourcePlayer: actor.owner, remainingTurns: 3 }];
  actor.attacked = true;
  return { ok: true, message: `${unitDefinition(actor).name} cursed ${unitDefinition(target).name} for 3 turns.` };
};

export const getInvokeDestinations = (state: GameState, actorId: string): Coord[] => {
  const actor = findUnit(state, actorId);
  if (!actor
    || state.winner
    || actor.owner !== state.currentPlayer
    || actor.exhausted
    || actor.attacked
    || !unitDefinition(actor).traits.includes('Invoker')) return [];
  if (actor.invokedPetId && findUnit(state, actor.invokedPetId)) return [];
  return neighbors(actor.coord).filter((coord) => isPassableInState(state, coord)
    && !isGraveLocked(state, coord)
    && !unitAt(state, coord));
};

export const invokeBeast = (state: GameState, actorId: string, destination: Coord): ActionResult => {
  const actor = findUnit(state, actorId);
  if (actor?.invokedPetId && findUnit(state, actor.invokedPetId)) {
    return { ok: false, message: 'This Invoker already has a living Invoked Beast.' };
  }
  if (!actor || !getInvokeDestinations(state, actorId).some((coord) => sameCoord(coord, destination))) {
    return { ok: false, message: 'Choose a free adjacent hex for the Invoked Beast.' };
  }
  actor.attacked = true;
  const summoned = createUnit(state, 'invokedBeast', actor.owner, destination, true);
  actor.invokedPetId = summoned.id;
  state.units.push(summoned);
  return {
    ok: true,
    message: 'Invoked Beast was summoned exhausted.',
    summonedUnitId: summoned.id,
  };
};

export const getValidSummonCoords = (state: GameState, playerId: PlayerId = state.currentPlayer): Coord[] => {
  const siteCoords = state.sites
    .filter((site) => site.owner === playerId
      && (site.type === 'keep' || site.type === 'fort')
      && !isGraveLocked(state, site.coord)
      && !unitAt(state, site.coord))
    .map((site) => ({ ...site.coord }));
  const garrisonCoords = MAP_GARRISONS
    .filter((garrison) => getGarrisonOwner(state, garrison.fortId) === playerId
      && !isGraveLocked(state, garrison.coord)
      && !unitAt(state, garrison.coord))
    .map((garrison) => ({ ...garrison.coord }));
  const unique = new Map<string, Coord>();
  for (const coord of [...siteCoords, ...garrisonCoords]) unique.set(coordKey(coord), coord);
  return [...unique.values()];
};

export const getGarrisonOwner = (state: GameState, fortId: string): PlayerId | null =>
  state.sites.find((site) => site.id === fortId && site.type === 'fort')?.owner ?? null;

const hasSiteAt = (state: GameState, coord: Coord): boolean =>
  state.sites.some((site) => sameCoord(site.coord, coord))
  || MAP_GARRISONS.some((garrison) => sameCoord(garrison.coord, coord));

const hasPendingWellAt = (state: GameState, coord: Coord): boolean =>
  state.pendingManaWells.some((well) => sameCoord(well.coord, coord));

export const getTacticTargets = (state: GameState, cardId: string): UnitState[] => {
  const card = cardDefinition(cardId);
  if (card.type !== 'tactic') return [];
  if (card.effect.kind === 'profaneWell') {
    return state.units.filter((unit) => {
      const terrain = effectiveTerrainAt(state, unit.coord);
      return unit.owner === state.currentPlayer
        && unit.definitionId !== 'commander'
        && (terrain === 'plain' || terrain === 'forest' || terrain === 'hill')
        && !hasSiteAt(state, unit.coord)
        && !hasPendingWellAt(state, unit.coord);
    });
  }
  if (card.effect.target === 'friendly') {
    return state.units.filter((unit) => unit.owner === state.currentPlayer && unit.hp < unitDefinition(unit).maxHp);
  }
  if (card.effect.target === 'enemy') {
    return state.units.filter((unit) => unit.owner !== state.currentPlayer);
  }
  return [];
};

export const getTacticTargetCoords = (state: GameState, cardId: string): Coord[] => {
  const card = cardDefinition(cardId);
  if (card.type !== 'tactic') return [];
  const targets: Coord[] = [];
  for (let r = 0; r < MAP_HEIGHT; r += 1) {
    for (let q = 0; q < MAP_WIDTH; q += 1) {
      const coord = { q, r };
      if (card.effect.kind === 'graveLock') {
        if (isPassableInState(state, coord) && !isGraveLocked(state, coord)) targets.push(coord);
      } else if (card.effect.kind === 'buildBridge') {
        if (terrainAt(coord) === 'water' && !isBuiltBridge(state, coord) && !unitAt(state, coord)) targets.push(coord);
      } else if (card.effect.kind === 'scorch') {
        if (effectiveTerrainAt(state, coord) === 'forest') targets.push(coord);
      } else if (card.effect.kind === 'raiseFort') {
        const terrain = effectiveTerrainAt(state, coord);
        if ((terrain === 'plain' || terrain === 'hill')
          && !unitAt(state, coord)
          && !hasSiteAt(state, coord)
          && !hasPendingWellAt(state, coord)) {
          targets.push(coord);
        }
      }
    }
  }
  return targets;
};

const validateCardPlay = (state: GameState, handIndex: number): CardDefinition | ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const player = state.players[state.currentPlayer];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, message: 'That card is no longer in hand.' };
  const card = cardDefinition(cardId);
  if (card.faction !== 'shared' && card.faction !== player.faction) {
    return { ok: false, message: `That card belongs to the ${card.faction} faction.` };
  }
  if (player.mana < card.cost) return { ok: false, message: 'Not enough mana.' };
  return card;
};

const discardPlayedCard = (state: GameState, handIndex: number): void => {
  const player = state.players[state.currentPlayer];
  const [cardId] = player.hand.splice(handIndex, 1);
  player.discard.push(cardId);
};

export const playUnitCard = (state: GameState, handIndex: number, destination: Coord): ActionResult => {
  const validation = validateCardPlay(state, handIndex);
  if ('ok' in validation) return validation;
  if (validation.type !== 'unit') return { ok: false, message: 'That card does not summon a unit.' };
  if (!getValidSummonCoords(state).some((coord) => sameCoord(coord, destination))) {
    return { ok: false, message: 'Choose an eligible Keep, Fort, or Garrison.' };
  }
  const playerId = state.currentPlayer;
  state.players[playerId].mana -= validation.cost;
  const summoned = createUnit(state, validation.unitId, playerId, destination, true);
  state.units.push(summoned);
  discardPlayedCard(state, handIndex);
  return {
    ok: true,
    message: `${validation.name} was summoned exhausted.`,
    summonedUnitId: summoned.id,
  };
};

export const playTacticCard = (state: GameState, handIndex: number, targetId: string): ActionResult => {
  const validation = validateCardPlay(state, handIndex);
  if ('ok' in validation) return validation;
  if (validation.type !== 'tactic') return { ok: false, message: 'That card is not a tactic.' };
  const target = findUnit(state, targetId);
  if (!target || !getTacticTargets(state, validation.id).some((unit) => unit.id === targetId)) {
    return { ok: false, message: 'Choose a highlighted unit.' };
  }

  const playerId = state.currentPlayer;
  state.players[playerId].mana -= validation.cost;
  if (validation.effect.kind === 'damage') {
    dealDamage(state, target, validation.effect.amount, false, playerId);
  } else if (validation.effect.kind === 'heal') {
    target.hp = Math.min(unitDefinition(target).maxHp, target.hp + validation.effect.amount);
  } else if (validation.effect.kind === 'profaneWell') {
    const coord = { ...target.coord };
    removeDeadUnit(state, target, playerId);
    const id = `pending-well-${state.nextSiteId}`;
    state.nextSiteId += 1;
    state.pendingManaWells.push({
      id,
      coord,
      owner: playerId,
      remainingTurns: 3,
      createdTurnNumber: state.turnNumber,
    });
  } else {
    return { ok: false, message: 'That tactic targets a battlefield hex.' };
  }
  discardPlayedCard(state, handIndex);
  return { ok: true, message: `${validation.name} resolved.` };
};

export const playTacticCardAtCoord = (state: GameState, handIndex: number, destination: Coord): ActionResult => {
  const validation = validateCardPlay(state, handIndex);
  if ('ok' in validation) return validation;
  if (validation.type !== 'tactic') return { ok: false, message: 'That card is not a tactic.' };
  if (!getTacticTargetCoords(state, validation.id).some((coord) => sameCoord(coord, destination))) {
    return { ok: false, message: 'Choose a highlighted battlefield hex.' };
  }

  const playerId = state.currentPlayer;
  state.players[playerId].mana -= validation.cost;
  if (validation.effect.kind === 'graveLock') {
    state.tileEffects.push({
      kind: 'graveLock',
      coord: { ...destination },
      sourcePlayer: playerId,
      expiresAtTurn: state.turnNumber + 2,
    });
  } else if (validation.effect.kind === 'buildBridge') {
    state.builtBridges.push({ ...destination });
  } else if (validation.effect.kind === 'scorch') {
    state.scorchedForests.push({ ...destination });
  } else if (validation.effect.kind === 'raiseFort') {
    state.sites.push({
      id: `built-fort-${state.nextSiteId}`,
      type: 'fort',
      coord: { ...destination },
      initialOwner: playerId,
      owner: playerId,
    });
    state.nextSiteId += 1;
  } else {
    return { ok: false, message: 'That tactic requires a unit target.' };
  }
  discardPlayedCard(state, handIndex);
  return { ok: true, message: `${validation.name} resolved.` };
};

const resolveCaptures = (state: GameState, playerId: PlayerId): void => {
  for (const site of state.sites) {
    const occupant = unitAt(state, site.coord);
    if (occupant?.owner === playerId) site.owner = playerId;
  }
};

const resolveCurses = (state: GameState, playerId: PlayerId): void => {
  const targetIds = state.units.filter((unit) => unit.owner === playerId && (unit.curses?.length ?? 0) > 0).map((unit) => unit.id);
  for (const targetId of targetIds) {
    const target = findUnit(state, targetId);
    if (!target) continue;
    const curses = [...(target.curses ?? [])];
    const remaining = [];
    for (const curse of curses) {
      const currentTarget = findUnit(state, targetId);
      if (!currentTarget) break;
      dealDamage(state, currentTarget, 1, false, curse.sourcePlayer);
      if (findUnit(state, targetId) && curse.remainingTurns > 1) {
        remaining.push({ ...curse, remainingTurns: curse.remainingTurns - 1 });
      }
    }
    const survivor = findUnit(state, targetId);
    if (survivor) survivor.curses = remaining;
  }
};

const resolvePendingManaWells = (state: GameState, playerId: PlayerId): void => {
  const remaining = [];
  for (const pending of state.pendingManaWells) {
    if (pending.owner !== playerId || pending.createdTurnNumber === state.turnNumber) {
      remaining.push(pending);
      continue;
    }
    const turnsLeft = pending.remainingTurns - 1;
    if (turnsLeft > 0) {
      remaining.push({ ...pending, remainingTurns: turnsLeft });
      continue;
    }
    state.sites.push({
      id: `profane-${pending.id}`,
      type: 'well',
      coord: { ...pending.coord },
      initialOwner: pending.owner,
      owner: pending.owner,
    });
  }
  state.pendingManaWells = remaining;
};

export const endTurn = (state: GameState, random: () => number = Math.random): ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const endingPlayer = state.currentPlayer;
  resolveCaptures(state, endingPlayer);
  resolveCurses(state, endingPlayer);
  if (state.winner) return { ok: true, message: `Player ${state.winner} wins the match.` };
  resolvePendingManaWells(state, endingPlayer);
  if (state.countdown?.player === endingPlayer && commanderAlive(state, endingPlayer)) {
    state.countdown.checkpoints += 1;
    if (state.countdown.checkpoints >= 3) {
      state.winner = endingPlayer;
      return { ok: true, message: `Player ${endingPlayer} wins the match.` };
    }
  }

  state.currentPlayer = endingPlayer === 1 ? 2 : 1;
  state.turnNumber += 1;
  beginTurn(state, random);
  return { ok: true, message: `Player ${state.currentPlayer}'s turn.` };
};
