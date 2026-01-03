export interface Position {
  row: number;
  col: number;
}

export interface UnitStats {
  // Deterministic one-shot system: only movement/attack ranges and type
  moveRange: number;
  attackRange: number;
  type: 'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman';
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
  deploymentsRemaining: number; // Starts at 10 per player
  // Track how many of each unit type have been deployed (max 3 per type)
  deploymentCounts?: Record<string, number>;
}

export interface GameState {
  grid: Tile[][];
  players: Player[];
  currentPlayer: number;
  turnNumber: number;
  freeDeploymentsRemaining: number;
  hasActedThisTurn: boolean;
  // Optional: sent by server for logging
  lastAction?: {
    type: string;
    by: number;
    unitId?: string;
    targetId?: string;
    unitType?: string;
    to?: Position;
    [key: string]: unknown;
  };
}
