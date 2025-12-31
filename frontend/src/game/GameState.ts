export interface Position {
  row: number;
  col: number;
}

export interface UnitStats {
  // Deterministic one-shot system: only movement/attack ranges and type
  moveRange: number;
  attackRange: number;
  type: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer';
}

export interface Unit {
  id: string;
  ownerId: number;
  stats: UnitStats;
  position: Position;
  actedThisTurn?: boolean;
}

export interface Tile {
  position: Position;
  unit: Unit | null;
}

export interface Player {
  id: number;
  actionsRemaining: number;
}

export interface GameState {
  grid: Tile[][];
  players: Player[];
  currentPlayer: number;
  turnNumber: number;
  freeDeploymentsRemaining: number;
  hasActedThisTurn: boolean;
}
