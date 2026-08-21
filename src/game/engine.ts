import { CARD_DEFINITIONS, PROTOTYPE_DECK, type CardDefinitionId } from '../data/cards';
import { MAP_HEIGHT, MAP_SITES, MAP_WIDTH, STARTING_UNITS, TERRAIN } from '../data/map';
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

export const coordKey = ({ q, r }: Coord): string => `${q},${r}`;

export const sameCoord = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;

export const isInsideMap = ({ q, r }: Coord): boolean => q >= 0 && q < MAP_WIDTH && r >= 0 && r < MAP_HEIGHT;

export const terrainAt = (coord: Coord): Terrain => TERRAIN[coord.r][coord.q];

export const isPassable = (coord: Coord): boolean => {
  if (!isInsideMap(coord)) return false;
  const terrain = terrainAt(coord);
  return terrain !== 'water' && terrain !== 'cliff';
};

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

export const unitDefinition = (unit: UnitState) => UNIT_DEFINITIONS[unit.definitionId as UnitDefinitionId];

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
  const definition = UNIT_DEFINITIONS[definitionId as UnitDefinitionId];
  const unit: UnitState = {
    id: `unit-${state.nextUnitId}`,
    definitionId,
    owner,
    hp: definition.maxHp,
    coord: { ...coord },
    exhausted,
    moved: false,
    attacked: false,
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
  const playerId = state.currentPlayer;
  for (const unit of state.units) {
    if (unit.owner !== playerId) continue;
    unit.exhausted = false;
    unit.moved = false;
    unit.attacked = false;
  }
  const wells = state.sites.filter((site) => site.type === 'well' && site.owner === playerId).length;
  state.players[playerId].mana = Math.min(7, 3 + wells);
  drawCard(state, playerId, random);
};

export const createGameState = (random: () => number = Math.random): GameState => {
  const state: GameState = {
    currentPlayer: 1,
    turnNumber: 1,
    players: {
      1: { id: 1, mana: 0, deck: shuffle(PROTOTYPE_DECK, random), hand: [], discard: [] },
      2: { id: 2, mana: 0, deck: shuffle(PROTOTYPE_DECK, random), hand: [], discard: [] },
    },
    units: [],
    sites: MAP_SITES.map((site) => ({ ...site, coord: { ...site.coord }, owner: site.initialOwner })),
    countdown: null,
    winner: null,
    nextUnitId: 1,
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

const movementCost = (unit: UnitState, coord: Coord): number =>
  unitDefinition(unit).traits.includes('Flying') || terrainAt(coord) !== 'forest' ? 1 : 1 / 0.7;

const canTraverse = (unit: UnitState, coord: Coord): boolean =>
  unitDefinition(unit).traits.includes('Flying') ? isInsideMap(coord) : isPassable(coord);

export const isStoppedByBlocking = (state: GameState, unit: UnitState, coord: Coord): boolean => {
  return neighbors(coord).some((neighbor) => {
    const adjacent = unitAt(state, neighbor);
    return adjacent !== undefined
      && adjacent.owner !== unit.owner
      && unitDefinition(adjacent).traits.includes('Blocking');
  });
};

export const getReachableCoords = (state: GameState, unitId: string): Map<string, number> => {
  const unit = findUnit(state, unitId);
  if (!unit || unit.owner !== state.currentPlayer || unit.exhausted || unit.moved || unit.attacked) return new Map();

  const reachable = new Map<string, number>([[coordKey(unit.coord), 0]]);
  const queue: Array<{ coord: Coord; cost: number }> = [{ coord: unit.coord, cost: 0 }];
  const move = unitDefinition(unit).move;

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;
    if (current.cost > (reachable.get(coordKey(current.coord)) ?? Number.POSITIVE_INFINITY)) continue;

    for (const next of neighbors(current.coord)) {
      if (!canTraverse(unit, next) || unitAt(state, next)) continue;
      const nextCost = current.cost + movementCost(unit, next);
      if (nextCost > move + 0.0001) continue;
      const key = coordKey(next);
      if (nextCost >= (reachable.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      reachable.set(key, nextCost);
      if (!isStoppedByBlocking(state, unit, next)) queue.push({ coord: next, cost: nextCost });
    }
  }

  reachable.delete(coordKey(unit.coord));
  return reachable;
};

export const moveUnit = (state: GameState, unitId: string, destination: Coord): ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, message: 'That unit is no longer on the board.' };
  if (!getReachableCoords(state, unitId).has(coordKey(destination))) {
    return { ok: false, message: 'That hex is not reachable.' };
  }
  unit.coord = { ...destination };
  unit.moved = true;
  return { ok: true, message: `${unitDefinition(unit).name} moved.` };
};

export const effectiveRange = (unit: UnitState): number => {
  const definition = unitDefinition(unit);
  return definition.range > 1 && terrainAt(unit.coord) === 'hill' ? definition.range + 1 : definition.range;
};

export const getAttackTargets = (state: GameState, unitId: string): UnitState[] => {
  const unit = findUnit(state, unitId);
  if (!unit || unit.owner !== state.currentPlayer || unit.exhausted || unit.attacked) return [];
  const range = effectiveRange(unit);
  return state.units.filter((target) => target.owner !== unit.owner && hexDistance(unit.coord, target.coord) <= range);
};

const commanderAlive = (state: GameState, player: PlayerId): boolean =>
  state.units.some((unit) => unit.owner === player && unit.definitionId === 'commander' && unit.hp > 0);

const removeDeadUnit = (state: GameState, unit: UnitState, sourcePlayer: PlayerId): void => {
  if (unit.definitionId === 'commander') {
    if (state.countdown?.player === unit.owner) state.countdown = null;
    if (sourcePlayer !== unit.owner && commanderAlive(state, sourcePlayer)) {
      state.countdown = { player: sourcePlayer, checkpoints: 0 };
    }
  }
  state.units = state.units.filter((candidate) => candidate.id !== unit.id);
};

const dealDamage = (state: GameState, target: UnitState, amount: number, ranged: boolean, sourcePlayer: PlayerId): number => {
  const adjusted = ranged && terrainAt(target.coord) === 'forest'
    ? Math.max(0, Math.round(amount * 0.7))
    : amount;
  target.hp -= adjusted;
  if (target.hp <= 0) removeDeadUnit(state, target, sourcePlayer);
  return adjusted;
};

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
  attacker.attacked = true;
  const dealt = dealDamage(state, defender, attackerDef.attack, attackerDef.range > 1, attacker.owner);
  const defenderSurvived = findUnit(state, defenderId) !== undefined;

  if (defenderSurvived
    && defenderDef.traits.includes('Retaliates')
    && hexDistance(attacker.coord, defender.coord) <= effectiveRange(defender)) {
    dealDamage(state, attacker, defenderDef.attack, defenderDef.range > 1, defender.owner);
  }

  return { ok: true, message: `${attackerDef.name} attacked ${defenderDef.name} for ${dealt}.` };
};

export const getDisplaceTargets = (state: GameState, unitId: string): UnitState[] => {
  const actor = findUnit(state, unitId);
  if (!actor || actor.owner !== state.currentPlayer || actor.exhausted || actor.attacked) return [];
  if (unitDefinition(actor).ability !== 'Displace') return [];
  return state.units.filter((target) => target.id !== actor.id && hexDistance(actor.coord, target.coord) === 1);
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
  return neighbors(actor.coord).filter((coord) => isPassable(coord) && !unitAt(state, coord) && !sameCoord(coord, target.coord));
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

const spawnSourceCoords = (state: GameState, playerId: PlayerId): Coord[] => {
  const locations = state.sites
    .filter((site) => site.owner === playerId && (site.type === 'keep' || site.type === 'fort'))
    .map((site) => site.coord);
  const invokers = state.units
    .filter((unit) => unit.owner === playerId && unitDefinition(unit).traits.includes('Invoker'))
    .map((unit) => unit.coord);
  return [...locations, ...invokers];
};

export const getValidSummonCoords = (state: GameState, playerId: PlayerId = state.currentPlayer): Coord[] => {
  const valid = new Map<string, Coord>();
  for (const source of spawnSourceCoords(state, playerId)) {
    for (const coord of neighbors(source)) {
      if (isPassable(coord) && !unitAt(state, coord)) valid.set(coordKey(coord), coord);
    }
  }
  return [...valid.values()];
};

export const getTacticTargets = (state: GameState, cardId: string): UnitState[] => {
  const card = cardDefinition(cardId);
  if (card.type !== 'tactic') return [];
  return state.units.filter((unit) => card.effect.target === 'friendly'
    ? unit.owner === state.currentPlayer && unit.hp < unitDefinition(unit).maxHp
    : unit.owner !== state.currentPlayer);
};

const validateCardPlay = (state: GameState, handIndex: number): CardDefinition | ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const player = state.players[state.currentPlayer];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, message: 'That card is no longer in hand.' };
  const card = cardDefinition(cardId);
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
    return { ok: false, message: 'Choose a free hex beside a friendly spawn source.' };
  }
  const playerId = state.currentPlayer;
  state.players[playerId].mana -= validation.cost;
  const definition = UNIT_DEFINITIONS[validation.unitId as UnitDefinitionId];
  const exhausted = !definition.traits.includes('Charge');
  const summoned = createUnit(state, validation.unitId, playerId, destination, exhausted);
  state.units.push(summoned);
  discardPlayedCard(state, handIndex);
  return {
    ok: true,
    message: `${validation.name} was summoned${exhausted ? ' exhausted' : ' ready to charge'}.`,
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
  } else {
    target.hp = Math.min(unitDefinition(target).maxHp, target.hp + validation.effect.amount);
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

export const endTurn = (state: GameState, random: () => number = Math.random): ActionResult => {
  if (state.winner) return { ok: false, message: 'The match is over.' };
  const endingPlayer = state.currentPlayer;
  resolveCaptures(state, endingPlayer);
  state.players[endingPlayer].mana = 0;

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
