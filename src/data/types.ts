export type PlayerId = 1 | 2;
export type Faction = 'human' | 'undead';
export type UnitFaction = Faction | 'shared';
export type Terrain = 'plain' | 'forest' | 'hill' | 'water' | 'cliff' | 'bridge';
export type SiteType = 'keep' | 'fort' | 'well';
export type Trait = 'Blocking' | 'Retaliates' | 'Invoker' | 'Ranged' | 'Flying' | 'Charge';
export type Ability = 'Displace' | 'Restore';

export interface Coord {
  q: number;
  r: number;
}

export interface UnitDefinition {
  id: string;
  name: string;
  faction: UnitFaction;
  cost: number;
  maxHp: number;
  attack: number;
  move: number;
  range: number;
  traits: Trait[];
  ability?: Ability;
  mark: string;
}

export interface UnitState {
  id: string;
  definitionId: string;
  owner: PlayerId;
  hp: number;
  coord: Coord;
  exhausted: boolean;
  moved: boolean;
  attacked: boolean;
}

export interface MapSite {
  id: string;
  type: SiteType;
  coord: Coord;
  initialOwner: PlayerId | null;
}

export interface SiteState extends MapSite {
  owner: PlayerId | null;
}

export interface UnitCard {
  id: string;
  name: string;
  faction: Faction;
  type: 'unit';
  cost: number;
  unitId: string;
}

export interface TacticCard {
  id: string;
  name: string;
  faction: Faction;
  type: 'tactic';
  cost: number;
  effect: {
    kind: 'damage' | 'heal';
    amount: number;
    target: 'enemy' | 'friendly';
  };
}

export type CardDefinition = UnitCard | TacticCard;

export interface PlayerState {
  id: PlayerId;
  faction: Faction;
  mana: number;
  deck: string[];
  hand: string[];
  discard: string[];
}

export interface VictoryCountdown {
  player: PlayerId;
  checkpoints: number;
}

export interface GameState {
  currentPlayer: PlayerId;
  turnNumber: number;
  players: Record<PlayerId, PlayerState>;
  units: UnitState[];
  sites: SiteState[];
  countdown: VictoryCountdown | null;
  winner: PlayerId | null;
  nextUnitId: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  summonedUnitId?: string;
  path?: Coord[];
}
