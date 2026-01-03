export interface Position {
  row: number;
  col: number;
}

export interface UnitStats {
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
  isBot?: boolean;
  botId?: string;
}

export interface GameState {
  grid: Tile[][];
  players: Player[];
  currentPlayer: number;
  turnNumber: number;
  freeDeploymentsRemaining: number;
  hasActedThisTurn: boolean;
  lastAction?: LastAction;
}

export interface LastAction {
  type: 'MOVE' | 'ATTACK' | 'DEPLOY' | 'ROTATE' | 'END_TURN';
  by: 0 | 1;
  unitId?: string;
  targetId?: string;
  to?: Position;
  unitType?: UnitStats['type'];
}
