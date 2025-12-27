// Shared types between frontend and backend
export type PlayerId = 'A' | 'B';

export interface Position {
  row: number;
  col: number;
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

export interface Card {
  id: string;
  name: string;
  cost: number;
  type: 'unit' | 'spell';
  unitStats?: UnitStats;
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
  board: (Unit | null)[][];
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

export type GameAction = 
  | { type: 'move'; unitId: string; to: Position }
  | { type: 'attack'; attackerId: string; targetId: string }
  | { type: 'swap'; unitId1: string; unitId2: string }
  | { type: 'play_card'; cardId: string; spawnCol?: number; targetUnitId?: string; targetPosition?: Position }
  | { type: 'draw_card' }
  | { type: 'sell_card'; cardId: string }
  | { type: 'end_turn' };
