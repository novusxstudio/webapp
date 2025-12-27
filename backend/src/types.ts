// Core game types - strictly following the ruleset

export type PlayerId = 'A' | 'B';

export interface Position {
  row: number; // 1-5
  col: number; // 1-5
}

export interface UnitStats {
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  move: number;
  range: number;
}

export interface Unit {
  id: string;
  owner: PlayerId;
  position: Position;
  stats: UnitStats;
  name: string;
}

export type CardType = 'unit' | 'spell';

export interface Card {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  // For unit cards
  unitStats?: UnitStats;
  // For spell cards
  spellEffect?: 'lightning_strike' | 'healing_circle' | 'recruitment';
}

export interface PlayerState {
  id: PlayerId;
  coins: number;
  actions: number;
  hand: Card[];
  deck: Card[];
  discard: Card[];
}

export interface ControlPoint {
  position: Position;
  type: 'left' | 'center' | 'right';
  controlledBy: PlayerId | null;
}

export interface GameState {
  board: (Unit | null)[][]; // 5x5 grid, indexed [row-1][col-1]
  players: {
    A: PlayerState;
    B: PlayerState;
  };
  controlPoints: ControlPoint[];
  currentPlayer: PlayerId;
  turnPhase: 'action' | 'ended';
  winner: PlayerId | null;
  turnNumber: number;
}

// Action types
export type ActionType = 
  | 'move'
  | 'attack'
  | 'swap'
  | 'play_card'
  | 'draw_card'
  | 'sell_card'
  | 'end_turn';

export interface MoveAction {
  type: 'move';
  unitId: string;
  to: Position;
}

export interface AttackAction {
  type: 'attack';
  attackerId: string;
  targetId: string;
}

export interface SwapAction {
  type: 'swap';
  unitId1: string;
  unitId2: string;
}

export interface PlayCardAction {
  type: 'play_card';
  cardId: string;
  // For unit cards - where to spawn (column, row is determined by player)
  spawnCol?: number;
  // For spell cards
  targetUnitId?: string; // For lightning strike
  targetPosition?: Position; // For healing circle
}

export interface DrawCardAction {
  type: 'draw_card';
}

export interface SellCardAction {
  type: 'sell_card';
  cardId: string;
}

export interface EndTurnAction {
  type: 'end_turn';
}

export type GameAction = 
  | MoveAction
  | AttackAction
  | SwapAction
  | PlayCardAction
  | DrawCardAction
  | SellCardAction
  | EndTurnAction;

export interface ActionResult {
  success: boolean;
  error?: string;
  newState?: GameState;
}
