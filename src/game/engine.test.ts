import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS, FACTION_DECKS } from '../data/cards';
import { MAP_GARRISONS, MAP_HEIGHT, MAP_SITES, MAP_WIDTH, STARTING_UNITS, TERRAIN } from '../data/map';
import type { Coord, GameState, PlayerId, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  attackUnit,
  coordKey,
  createGameState,
  curseUnit,
  effectiveMove,
  effectiveRange,
  endTurn,
  getAttackTargets,
  getReachableCoords,
  getRestoreTargets,
  getSoulLinkTargets,
  getValidSummonCoords,
  hexDistance,
  isPassable,
  isStoppedByBlocking,
  MAX_MANA,
  moveUnit,
  playUnitCard,
  rallyAdjacentAllies,
  restoreAdjacentAlly,
  soulLinkUnit,
  STARTING_MANA,
  terrainAt,
  unitDefinition,
} from './engine';

const fixedRandom = () => 0.25;

const makeUnit = (
  id: string,
  definitionId: UnitDefinitionId,
  owner: PlayerId,
  coord: Coord,
  overrides: Partial<UnitState> = {},
): UnitState => ({
  id,
  definitionId,
  owner,
  coord,
  hp: definitionId === 'commander' ? 10 : UNIT_DEFINITIONS[definitionId].maxHp,
  exhausted: false,
  moved: false,
  attacked: false,
  movementSpent: 0,
  postAttackMoved: false,
  moveBonus: 0,
  curses: [],
  ...overrides,
});

const freshState = (): GameState => createGameState(fixedRandom);

describe('faction rosters and decks', () => {
  it('uses faction-specific Commander definitions without changing the board commander id', () => {
    const human = makeUnit('hc', 'commander', 1, { q: 2, r: 6 });
    const undead = makeUnit('uc', 'commander', 2, { q: 8, r: 6 });
    expect(unitDefinition(human)).toMatchObject({
      name: 'Human Commander', faction: 'human', traits: ['Blocking', 'Retaliates'], ability: 'Rally',
    });
    expect(unitDefinition(undead)).toMatchObject({
      name: 'Undead Commander', faction: 'undead', traits: ['Blocking', 'DarkReflection'], ability: 'SoulLink',
    });
  });

  it('matches the agreed Human and Undead unit stats', () => {
    expect(UNIT_DEFINITIONS.longbowRanger).toMatchObject({ maxHp: 1, attack: 1, range: 3, traits: ['Ranged', 'Assist', 'SetShot'] });
    expect(UNIT_DEFINITIONS.boneArcher).toMatchObject({ maxHp: 1, attack: 1, range: 3, traits: ['Ranged', 'Assist', 'SetShot'] });
    expect(UNIT_DEFINITIONS.silverwingCavalry).toMatchObject({ maxHp: 5, attack: 4, move: 4, traits: ['Flying', 'AgileAssault'] });
    expect(UNIT_DEFINITIONS.necromancer).toMatchObject({ range: 3, traits: ['Ranged', 'Necromancy', 'Invoker'], ability: 'Curse' });
    expect(UNIT_DEFINITIONS.graveKnight).toMatchObject({ maxHp: 5, attack: 3, ability: 'Cleave' });
    expect(UNIT_DEFINITIONS.vampire).toMatchObject({ maxHp: 4, attack: 3, move: 3, ability: 'BloodDrain' });
    expect(UNIT_DEFINITIONS.wraith).toMatchObject({ maxHp: 3, attack: 2, move: 4, traits: ['Phase'] });
    expect(UNIT_DEFINITIONS.bannerCaptain).toMatchObject({ cost: 4, maxHp: 4, traits: [] });
    expect(UNIT_DEFINITIONS.windAdept).toMatchObject({ cost: 3, maxHp: 2, attack: 1, move: 3, range: 2, ability: 'Displace' });
  });

  it('keeps both prototype faction decks at 10 legal cards and exposes every current unit', () => {
    for (const faction of ['human', 'undead'] as const) {
      const deck = FACTION_DECKS[faction];
      expect(deck).toHaveLength(10);
      for (const cardId of new Set(deck)) {
        expect(deck.filter((candidate) => candidate === cardId).length).toBeLessThanOrEqual(2);
        expect([faction, 'shared']).toContain(CARD_DEFINITIONS[cardId].faction);
      }
    }
    expect(new Set(FACTION_DECKS.human)).toEqual(new Set([
      'royalGuard', 'longbowRanger', 'silverwingCavalry', 'lightMage', 'bannerCaptain', 'windAdept',
      'scorch', 'raiseFort', 'buildBridge',
    ]));
    expect(new Set(FACTION_DECKS.undead)).toEqual(new Set([
      'skeletalInfantry', 'boneArcher', 'necromancer', 'banshee', 'vampire', 'wraith', 'graveKnight',
      'graveLock', 'profaneWell', 'buildBridge',
    ]));
  });

  it('rejects a cross-faction card', () => {
    const state = freshState();
    state.players[1].hand = ['skeletalInfantry'];
    state.players[1].mana = 7;
    const target = getValidSummonCoords(state, 1)[0];
    const result = playUnitCard(state, 0, target);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('undead faction');
  });

  it('starting non-Commander units match their owner faction', () => {
    const state = freshState();
    for (const unit of state.units) {
      if (unit.definitionId === 'commander') continue;
      expect(unitDefinition(unit).faction).toBe(state.players[unit.owner].faction);
    }
  });
});

describe('map baseline', () => {
  it('keeps the compact prototype map and legal sites', () => {
    expect(MAP_WIDTH).toBe(18);
    expect(MAP_HEIGHT).toBe(13);
    expect(TERRAIN.flat()).toHaveLength(234);
    expect(MAP_SITES.filter((site) => site.type === 'keep')).toHaveLength(2);
    expect(MAP_SITES.filter((site) => site.type === 'fort')).toHaveLength(2);
    expect(MAP_SITES.filter((site) => site.type === 'well')).toHaveLength(4);
    expect(MAP_GARRISONS).toHaveLength(6);
    for (const site of MAP_SITES) expect(isPassable(site.coord)).toBe(true);
    for (const garrison of MAP_GARRISONS) {
      const fort = MAP_SITES.find((site) => site.id === garrison.fortId)!;
      expect(fort.type).toBe('fort');
      expect(hexDistance(fort.coord, garrison.coord)).toBe(1);
      expect(isPassable(garrison.coord)).toBe(true);
    }
    for (const unit of STARTING_UNITS) expect(isPassable(unit.coord)).toBe(true);
  });

  it('keeps bridges passable and water and mountains blocked for normal units', () => {
    expect(terrainAt({ q: 8, r: 4 })).toBe('bridge');
    expect(isPassable({ q: 8, r: 4 })).toBe(true);
    expect(isPassable({ q: 8, r: 3 })).toBe(false);
    expect(terrainAt({ q: 5, r: 5 })).toBe('mountain');
    expect(isPassable({ q: 5, r: 5 })).toBe(false);
  });

  it('applies Hill range only to units with the Ranged trait', () => {
    const ranger = makeUnit('ranger', 'longbowRanger', 1, { q: 6, r: 3 });
    const mage = makeUnit('mage', 'lightMage', 1, { q: 6, r: 3 });
    expect(terrainAt(ranger.coord)).toBe('hill');
    expect(effectiveRange(ranger)).toBe(4);
    expect(effectiveRange(mage)).toBe(2);
  });
});

describe('stored mana economy', () => {
  it('starts both players at 3 mana and carries unspent mana into daily Keep income', () => {
    const state = freshState();
    expect(state.players[1].mana).toBe(STARTING_MANA);
    expect(state.players[2].mana).toBe(STARTING_MANA);

    endTurn(state, fixedRandom);
    expect(state.players[2].mana).toBe(3);
    endTurn(state, fixedRandom);
    expect(state.players[1].mana).toBe(4);
  });

  it('pays each controlled Well 2 mana every third player turn and caps storage at 10', () => {
    const state = freshState();
    state.sites.find((site) => site.id === 'well-northwest')!.owner = 1;

    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.currentPlayer).toBe(1);
    expect(state.players[1].mana).toBe(7);

    state.players[1].mana = MAX_MANA;
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.players[1].mana).toBe(MAX_MANA);
  });
});

describe('Blocking, Flying and Phase', () => {
  it('Blocking stops normal movement but Phase ignores it', () => {
    const state = freshState();
    const normal = makeUnit('normal', 'banshee', 1, { q: 0, r: 8 });
    const phase = makeUnit('phase', 'wraith', 1, { q: 0, r: 8 });
    const blocker = makeUnit('blocker', 'skeletalInfantry', 2, { q: 2, r: 8 });
    state.units = [normal, blocker];
    expect(isStoppedByBlocking(state, normal, { q: 1, r: 8 })).toBe(true);
    state.units = [phase, blocker];
    expect(isStoppedByBlocking(state, phase, { q: 1, r: 8 })).toBe(false);
  });

  it('Flying can cross water but not mountains', () => {
    const state = freshState();
    const flyer = makeUnit('flyer', 'silverwingCavalry', 1, { q: 8, r: 4 });
    state.units = [flyer];
    expect(getReachableCoords(state, flyer.id).has(coordKey({ q: 8, r: 3 }))).toBe(true);
    flyer.coord = { q: 4, r: 5 };
    expect(getReachableCoords(state, flyer.id).has(coordKey({ q: 5, r: 5 }))).toBe(false);
  });
});

describe('Set Shot activation', () => {
  it.each([
    ['longbowRanger', 1, 2],
    ['boneArcher', 2, 1],
  ] as const)('blocks %s normal attack after movement', (definitionId, owner, enemyOwner) => {
    const state = freshState();
    state.currentPlayer = owner;
    const archer = makeUnit('archer', definitionId, owner, { q: 3, r: 10 });
    const target = makeUnit('target', 'skeletalInfantry', enemyOwner, { q: 5, r: 8 });
    state.units = [archer, target];

    expect(moveUnit(state, archer.id, { q: 4, r: 9 }).ok).toBe(true);
    expect(archer.moved).toBe(true);
    expect(archer.attacked).toBe(false);
    expect(getAttackTargets(state, archer.id)).toEqual([]);
    expect(attackUnit(state, archer.id, target.id).ok).toBe(false);
  });

  it('still allows a moved archer to contribute Assist', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'windAdept', 1, { q: 4, r: 6 });
    const archer = makeUnit('archer', 'longbowRanger', 1, { q: 6, r: 6 }, { moved: true, movementSpent: 1 });
    const defender = makeUnit('defender', 'necromancer', 2, { q: 5, r: 6 });
    state.units = [attacker, archer, defender];

    expect(attackUnit(state, attacker.id, defender.id).ok).toBe(true);
    expect(defender.hp).toBe(1); // 1 primary + 2 rear Assist from the moved Ranger.
  });
});

describe('Assist positioning', () => {
  it('adds +1 from a normal assisting position', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'windAdept', 1, { q: 4, r: 6 });
    const assister = makeUnit('assist', 'royalGuard', 1, { q: 5, r: 5 });
    const defender = makeUnit('defender', 'necromancer', 2, { q: 5, r: 6 });
    state.units = [attacker, assister, defender];
    attackUnit(state, attacker.id, defender.id);
    expect(defender.hp).toBe(2); // 1 primary + 1 Assist
  });

  it('adds +2 when the assister is directly behind the target', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'windAdept', 1, { q: 4, r: 6 });
    const assister = makeUnit('assist', 'royalGuard', 1, { q: 6, r: 6 });
    const defender = makeUnit('defender', 'necromancer', 2, { q: 5, r: 6 });
    state.units = [attacker, assister, defender];
    attackUnit(state, attacker.id, defender.id);
    expect(defender.hp).toBe(1); // 1 primary + 2 rear Assist
  });

  it('does not Assist while Exhausted', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'windAdept', 1, { q: 4, r: 6 });
    const assister = makeUnit('assist', 'royalGuard', 1, { q: 6, r: 6 }, { exhausted: true });
    const defender = makeUnit('defender', 'necromancer', 2, { q: 5, r: 6 });
    state.units = [attacker, assister, defender];
    attackUnit(state, attacker.id, defender.id);
    expect(defender.hp).toBe(3);
  });
});

describe('Silverwing Cavalry Agile Assault', () => {
  it('moves, attacks with half retaliation, then uses remaining movement', () => {
    const state = freshState();
    const cavalry = makeUnit('cavalry', 'silverwingCavalry', 1, { q: 2, r: 6 });
    const knight = makeUnit('knight', 'graveKnight', 2, { q: 5, r: 6 });
    state.units = [cavalry, knight];

    expect(moveUnit(state, cavalry.id, { q: 4, r: 6 }).ok).toBe(true);
    expect(cavalry.movementSpent).toBe(2);
    expect(attackUnit(state, cavalry.id, knight.id).ok).toBe(true);
    expect(knight.hp).toBe(1);
    expect(cavalry.hp).toBe(3); // 3 retaliation becomes ceil(1.5) = 2
    expect(getReachableCoords(state, cavalry.id).has(coordKey({ q: 3, r: 6 }))).toBe(true);
    expect(moveUnit(state, cavalry.id, { q: 3, r: 6 }).ok).toBe(true);
    expect(cavalry.postAttackMoved).toBe(true);
  });

  it('is still summoned Exhausted because Charge no longer exists', () => {
    const state = freshState();
    state.players[1].hand = ['silverwingCavalry'];
    state.players[1].mana = 6;
    const commander = state.units.find((unit) => unit.owner === 1 && unit.definitionId === 'commander')!;
    commander.coord = { q: 1, r: 9 };
    const result = playUnitCard(state, 0, getValidSummonCoords(state)[0]);
    expect(result.ok).toBe(true);
    expect(state.units.find((unit) => unit.id === result.summonedUnitId)?.exhausted).toBe(true);
  });
});

describe('Commander faction abilities', () => {
  it('Human Rally gives eligible adjacent allies +1 Move for the turn', () => {
    const state = freshState();
    const commander = makeUnit('commander', 'commander', 1, { q: 5, r: 6 });
    const cavalry = makeUnit('cavalry', 'silverwingCavalry', 1, { q: 6, r: 6 });
    state.units = [commander, cavalry];
    expect(rallyAdjacentAllies(state, commander.id).ok).toBe(true);
    expect(effectiveMove(cavalry)).toBe(5);
    expect(commander.attacked).toBe(true);
  });

  it('Undead Dark Reflection returns 30% of direct attack damage and does not retaliate', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'royalGuard', 1, { q: 4, r: 6 });
    const commander = makeUnit('commander', 'commander', 2, { q: 5, r: 6 });
    state.units = [attacker, commander];
    attackUnit(state, attacker.id, commander.id);
    expect(commander.hp).toBe(8);
    expect(attacker.hp).toBe(2); // round(2 * 0.3) = 1 reflected, no 3-DMG retaliation
  });

  it('Soul Link redirects damage and overflow without triggering Dark Reflection', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const commander = makeUnit('commander', 'commander', 2, { q: 5, r: 6 });
    const skeleton = makeUnit('skeleton', 'skeletalInfantry', 2, { q: 6, r: 6 });
    const attacker = makeUnit('attacker', 'silverwingCavalry', 1, { q: 4, r: 6 });
    state.units = [commander, skeleton, attacker];
    expect(getSoulLinkTargets(state, commander.id).map((unit) => unit.id)).toEqual([skeleton.id]);
    expect(soulLinkUnit(state, commander.id, skeleton.id).ok).toBe(true);

    state.currentPlayer = 1;
    attackUnit(state, attacker.id, commander.id);
    expect(state.units.some((unit) => unit.id === skeleton.id)).toBe(false);
    expect(commander.hp).toBe(8); // 2 absorbed by skeleton, 2 overflow
    expect(attacker.hp).toBe(5); // redirected damage never reflects
  });
});

describe('Necromancer', () => {
  it('raises an Exhausted Skeletal Infantry when its direct attack kills', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const necromancer = makeUnit('necro', 'necromancer', 2, { q: 4, r: 6 });
    const victim = makeUnit('victim', 'longbowRanger', 1, { q: 6, r: 6 });
    state.units = [necromancer, victim];
    expect(attackUnit(state, necromancer.id, victim.id).ok).toBe(true);
    const raised = state.units.find((unit) => unit.definitionId === 'skeletalInfantry');
    expect(raised).toBeDefined();
    expect(raised?.coord).toEqual({ q: 6, r: 6 });
    expect(raised?.owner).toBe(2);
    expect(raised?.exhausted).toBe(true);
  });

  it('provides free adjacent spawn destinations through Invoker', () => {
    const state = freshState();
    state.currentPlayer = 2;
    for (const site of state.sites) site.owner = null;
    const necromancer = makeUnit('necro', 'necromancer', 2, { q: 4, r: 6 });
    state.units = [necromancer];
    const destinations = getValidSummonCoords(state, 2);
    expect(destinations).toContainEqual({ q: 3, r: 6 });
    expect(destinations).not.toContainEqual(necromancer.coord);
  });

  it('Curse deals 1 damage at the end of the victim owner turn for 3 turns', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const necromancer = makeUnit('necro', 'necromancer', 2, { q: 4, r: 6 });
    const victim = makeUnit('victim', 'royalGuard', 1, { q: 6, r: 6 });
    state.units = [necromancer, victim];
    expect(curseUnit(state, necromancer.id, victim.id).ok).toBe(true);
    expect(victim.curses?.[0].remainingTurns).toBe(3);

    endTurn(state, fixedRandom); // Undead ends: no damage to Human victim yet.
    expect(victim.hp).toBe(3);
    endTurn(state, fixedRandom); // Human ends: tick 1.
    expect(victim.hp).toBe(2);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom); // tick 2.
    expect(victim.hp).toBe(1);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom); // tick 3, lethal.
    expect(state.units.some((unit) => unit.id === victim.id)).toBe(false);
  });
});

describe('Undead specialist attacks', () => {
  it('Grave Knight Cleave damages every adjacent enemy but not distant enemies', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const knight = makeUnit('knight', 'graveKnight', 2, { q: 5, r: 6 });
    const primary = makeUnit('primary', 'royalGuard', 1, { q: 6, r: 6 });
    const adjacent = makeUnit('adjacent', 'lightMage', 1, { q: 5, r: 5 });
    const far = makeUnit('far', 'lightMage', 1, { q: 2, r: 6 });
    state.units = [knight, primary, adjacent, far];
    attackUnit(state, knight.id, primary.id);
    expect(state.units.some((unit) => unit.id === primary.id)).toBe(false);
    expect(state.units.some((unit) => unit.id === adjacent.id)).toBe(false);
    expect(far.hp).toBe(3);
    expect(knight.hp).toBe(5); // primary died, so no retaliation
  });

  it('Vampire Blood Drain restores 1 HP once after dealing normal attack damage', () => {
    const state = freshState();
    state.currentPlayer = 2;
    const vampire = makeUnit('vampire', 'vampire', 2, { q: 4, r: 6 }, { hp: 2 });
    const victim = makeUnit('victim', 'lightMage', 1, { q: 5, r: 6 });
    state.units = [vampire, victim];
    attackUnit(state, vampire.id, victim.id);
    expect(vampire.hp).toBe(3);
  });
});

describe('existing summon, restore, capture and victory rules', () => {
  it('applies GRV4 after attack damage removes the final opposing unit', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'royalGuard', 1, { q: 5, r: 5 });
    const humanCommander = makeUnit('human-commander', 'commander', 1, { q: 2, r: 6 });
    const finalEnemy = makeUnit('final-enemy', 'skeletalInfantry', 2, { q: 6, r: 5 }, { hp: 1 });
    state.units = [humanCommander, attacker, finalEnemy];

    const result = attackUnit(state, attacker.id, finalEnemy.id);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Player 1 wins');
    expect(state.winner).toBe(1);
    expect(state.countdown).toBe(null);
  });

  it('applies GRV2 while another opposing unit survives', () => {
    const state = freshState();
    const attacker = makeUnit('attacker', 'royalGuard', 1, { q: 5, r: 5 });
    const humanCommander = makeUnit('human-commander', 'commander', 1, { q: 2, r: 6 });
    const enemyCommander = makeUnit('enemy-commander', 'commander', 2, { q: 6, r: 5 }, { hp: 1 });
    const enemySurvivor = makeUnit('enemy-survivor', 'boneArcher', 2, { q: 10, r: 5 });
    state.units = [humanCommander, attacker, enemyCommander, enemySurvivor];

    attackUnit(state, attacker.id, enemyCommander.id);

    expect(state.winner).toBe(null);
    expect(state.countdown).toEqual({ player: 1, checkpoints: 0 });
  });

  it('applies GRV4 during end-of-turn curse resolution', () => {
    const state = freshState();
    const finalHuman = makeUnit('final-human', 'royalGuard', 1, { q: 5, r: 5 }, {
      hp: 1,
      curses: [{ sourcePlayer: 2, remainingTurns: 1 }],
    });
    const undeadCommander = makeUnit('undead-commander', 'commander', 2, { q: 10, r: 6 });
    state.units = [finalHuman, undeadCommander];
    const startingTurn = state.turnNumber;

    const result = endTurn(state, fixedRandom);

    expect(result).toEqual({ ok: true, message: 'Player 2 wins the match.' });
    expect(state.winner).toBe(2);
    expect(state.currentPlayer).toBe(1);
    expect(state.turnNumber).toBe(startingTurn);
  });

  it('starts with each Home Keep usable and exposes the starting Necromancer Invoker', () => {
    const state = freshState();
    const humanKeep = state.sites.find((site) => site.id === 'keep-1')!;
    const undeadKeep = state.sites.find((site) => site.id === 'keep-2')!;

    expect(getValidSummonCoords(state, 1)).toContainEqual(humanKeep.coord);
    expect(getValidSummonCoords(state, 2)).toContainEqual(undeadKeep.coord);
    expect(getValidSummonCoords(state, 2).length).toBeGreaterThan(1);

    state.players[1].hand = ['royalGuard'];
    expect(playUnitCard(state, 0, humanKeep.coord).ok).toBe(true);
  });

  it('summons on empty controlled fixed spawn sources when no Invoker is present', () => {
    const state = freshState();
    const keep = state.sites.find((site) => site.id === 'keep-1')!;
    const fort = state.sites.find((site) => site.id === 'fort-north')!;
    const garrisons = MAP_GARRISONS.filter((candidate) => candidate.fortId === fort.id);
    fort.owner = 1;

    state.units = [makeUnit('keep-occupant', 'commander', 1, { ...keep.coord })];
    expect(getValidSummonCoords(state, 1)).toEqual([fort.coord, ...garrisons.map((garrison) => garrison.coord)]);
    state.units = [makeUnit('fort-occupant', 'royalGuard', 1, { ...fort.coord })];
    expect(getValidSummonCoords(state, 1)).toEqual([keep.coord, ...garrisons.map((garrison) => garrison.coord)]);
    state.units.push(...garrisons.map((garrison, index) =>
      makeUnit(`garrison-occupant-${index}`, 'royalGuard', 1, { ...garrison.coord })));
    expect(getValidSummonCoords(state, 1)).toEqual([keep.coord]);
    state.units.push(makeUnit('keep-occupant', 'commander', 1, { ...keep.coord }));
    expect(getValidSummonCoords(state, 1)).toEqual([]);
  });

  it('does not let a Garrison capture its linked Fort directly', () => {
    const state = freshState();
    const fort = state.sites.find((site) => site.id === 'fort-north')!;
    const garrison = MAP_GARRISONS.find((candidate) => candidate.fortId === fort.id)!;
    state.units = [makeUnit('garrison-occupant', 'royalGuard', 1, { ...garrison.coord })];

    endTurn(state, fixedRandom);

    expect(fort.owner).toBe(null);
  });

  it('Light Mage Restore still heals an adjacent ally by 2', () => {
    const state = freshState();
    const mage = makeUnit('mage', 'lightMage', 1, { q: 5, r: 4 });
    const ally = makeUnit('ally', 'royalGuard', 1, { q: 6, r: 4 }, { hp: 1 });
    state.units = [mage, ally];
    expect(getRestoreTargets(state, mage.id).map((unit) => unit.id)).toEqual([ally.id]);
    expect(restoreAdjacentAlly(state, mage.id, ally.id).ok).toBe(true);
    expect(ally.hp).toBe(3);
  });

  it('captures sites only at end turn', () => {
    const state = freshState();
    const well = state.sites.find((site) => site.id === 'well-northwest')!;
    state.units = [makeUnit('capturer', 'lightMage', 1, { ...well.coord })];
    expect(well.owner).toBe(null);
    endTurn(state, fixedRandom);
    expect(well.owner).toBe(1);
  });

  it('wins after three surviving Commander checkpoints', () => {
    const state = freshState();
    state.countdown = { player: 1, checkpoints: 0 };
    endTurn(state, fixedRandom);
    expect(state.countdown?.checkpoints).toBe(1);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.countdown?.checkpoints).toBe(2);
    endTurn(state, fixedRandom);
    endTurn(state, fixedRandom);
    expect(state.winner).toBe(1);
  });
});
