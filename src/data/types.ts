export type PlayerId = 1 | 2;
export type Faction = 'human' | 'undead';
export type CardFaction = Faction | 'shared';
export type UnitFaction = Faction | 'shared';
export type Terrain = 'plain' | 'forest' | 'hill' | 'water' | 'cliff' | 'mountain' | 'bridge';
export type SiteType = 'keep' | 'fort' | 'well';
export type Trait =
  | 'Blocking'
  | 'Retaliates'
  | 'Invoker'
  | 'Ranged'
  | 'SetShot'
  | 'Flying'
  | 'AgileAssault'
  | 'DarkReflection'
  | 'Necromancy'
  | 'Phase'
  | 'Assist';
export type Ability =
  | 'Displace'
  | 'Restore'
  | 'Thunder'
  | 'Rally'
  | 'SoulLink'
  | 'Curse'
  | 'BloodDrain'
  | 'Cleave';

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

export interface CurseStatus {
  sourcePlayer: PlayerId;
  remainingTurns: number;
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
  movementSpent?: number;
  postAttackMoved?: boolean;
  moveBonus?: number;
  soulLinkTargetId?: string;
  invokedPetId?: string;
  curses?: CurseStatus[];
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

export type TacticEffect =
  | {
    kind: 'damage';
    amount: number;
    target: 'enemy';
  }
  | {
    kind: 'heal';
    amount: number;
    target: 'friendly';
  }
  | {
    kind: 'graveLock';
    target: 'tile';
  }
  | {
    kind: 'buildBridge';
    target: 'water';
  }
  | {
    kind: 'scorch';
    target: 'forest';
  }
  | {
    kind: 'raiseFort';
    target: 'constructibleLand';
  }
  | {
    kind: 'profaneWell';
    target: 'friendlyUnit';
  };

export interface TacticCard {
  id: string;
  name: string;
  faction: CardFaction;
  type: 'tactic';
  cost: number;
  effect: TacticEffect;
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

export interface GraveLockTileEffect {
  kind: 'graveLock';
  coord: Coord;
  sourcePlayer: PlayerId;
  expiresAtTurn: number;
}

export type TileEffect = GraveLockTileEffect;

export interface PendingManaWell {
  id: string;
  coord: Coord;
  owner: PlayerId;
  remainingTurns: number;
  createdTurnNumber: number;
}

export interface GameState {
  currentPlayer: PlayerId;
  turnNumber: number;
  players: Record<PlayerId, PlayerState>;
  units: UnitState[];
  sites: SiteState[];
  builtBridges: Coord[];
  scorchedForests: Coord[];
  pendingManaWells: PendingManaWell[];
  tileEffects: TileEffect[];
  countdown: VictoryCountdown | null;
  winner: PlayerId | null;
  nextUnitId: number;
  nextSiteId: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  summonedUnitId?: string;
  path?: Coord[];
}
