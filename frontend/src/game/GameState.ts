export interface Position {
  row: number;
  col: number;
}

export interface UnitStats {
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  moveRange: number;
  attackRange: number;
  cost: number;
}

export interface Unit {
  id: string;
  ownerId: number;
  stats: UnitStats;
  position: Position;
}

export interface Tile {
  position: Position;
  unit: Unit | null;
}

export interface Player {
  id: number;
  coins: number;
  actionsRemaining: number;
  hand: string[];
  deck: string[];
  discard: string[];
}

export interface GameState {
  grid: Tile[][];
  players: Player[];
  currentPlayer: number;
  turnNumber: number;
}
