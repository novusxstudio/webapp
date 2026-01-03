import type { Position, GameState, Unit } from './GameState';
import { UNIT_DATA } from './units';

export const CONTROL_POINTS: Position[] = [
  { row: 3, col: 1 },
  { row: 3, col: 3 },
  { row: 3, col: 5 },
];
const OUTSIDE_POINTS: Position[] = [
  { row: 3, col: 1 },
  { row: 3, col: 5 },
];

export function getDistance(a: Position, b: Position): number {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  if (dx === 1 && dy === 1) return 2;
  return dx + dy;
}

export function controlsPosition(state: GameState, playerId: number, pos: Position): boolean {
  const tile = state.grid[pos.row - 1][pos.col - 1];
  return tile.unit !== null && tile.unit.ownerId === playerId;
}

export function controlsAllPoints(state: GameState, playerId: number): boolean {
  return CONTROL_POINTS.every(pos => controlsPosition(state, playerId, pos));
}
function countOutsideControl(state: GameState, playerId: number): number {
  // OUTSIDE_POINTS are the two side control points
  return OUTSIDE_POINTS.filter(p => controlsPosition(state, playerId, p)).length;
}

// Returns true if player controls both side control points
function controlsBothSides(state: GameState, playerId: number): boolean {
  return OUTSIDE_POINTS.every(p => controlsPosition(state, playerId, p));
}

function middleControlBonus(state: GameState, playerId: number): number {
  return controlsPosition(state, playerId, { row: 3, col: 3 }) ? 1 : 0;
}

const LABEL_TO_KEY: Record<string, keyof typeof UNIT_DATA> = {
  Swordsman: 'swordsman',
  Shieldman: 'shieldman',
  Axeman: 'axeman',
  Cavalry: 'cavalry',
  Archer: 'archer',
  Spearman: 'spearman',
};

function normalizeUnitKey(key: string): keyof typeof UNIT_DATA {
  if ((UNIT_DATA as any)[key]) return key as keyof typeof UNIT_DATA;
  const mapped = LABEL_TO_KEY[key];
  if (mapped) return mapped;
  const lower = key.toLowerCase();
  if ((UNIT_DATA as any)[lower]) return lower as keyof typeof UNIT_DATA;
  throw new Error('Unknown unit key');
}

// Maximum deployments per unit type per player
const MAX_DEPLOYMENTS_PER_TYPE = 3;

export function canDeployUnit(state: GameState, unitKey: string, targetPos: Position): boolean {
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit !== null) return false;
  const validRow = state.currentPlayer === 0 ? 1 : 5;
  if (targetPos.row !== validRow) return false;
  let normalized: keyof typeof UNIT_DATA;
  try { normalized = normalizeUnitKey(unitKey); } catch { return false; }
  const unitStats = UNIT_DATA[normalized];
  if (!unitStats) return false;
  const player = state.players[state.currentPlayer];
  const actionsAvailable = player.actionsRemaining > 0;
  if (!actionsAvailable) return false;
  // Check per-type deployment limit (max 2 of each type)
  const deploymentCounts = player.deploymentCounts ?? {};
  const currentTypeCount = deploymentCounts[normalized] ?? 0;
  if (currentTypeCount >= MAX_DEPLOYMENTS_PER_TYPE) return false;
  return true;
}

export function applyDeployUnit(state: GameState, unitKey: string, targetPos: Position): GameState {
  if (!canDeployUnit(state, unitKey, targetPos)) throw new Error('Invalid deployment');
  const normalized = normalizeUnitKey(unitKey);
  const unitStats = UNIT_DATA[normalized];
  const unitId = `${state.currentPlayer}-${String(normalized)}-${Date.now()}`;
  const newUnit: Unit = { id: unitId, ownerId: state.currentPlayer, stats: { ...unitStats }, position: { row: targetPos.row, col: targetPos.col }, actedThisTurn: true };
  const newGrid = state.grid.map((row, r) => r === targetPos.row - 1 ? row.map((tile, c) => c === targetPos.col - 1 ? { ...tile, unit: newUnit } : tile) : row);
  // Increment per-type count
  const playerIndex = state.currentPlayer;
  const players = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const currentCounts = p.deploymentCounts ?? {};
    const newCounts = { ...currentCounts, [normalized]: (currentCounts[normalized] ?? 0) + 1 };
    // Decrement actionsRemaining by 1 (minimum 0)
    const newActionsRemaining = Math.max(0, (p.actionsRemaining ?? 1) - 1);
    return { ...p, deploymentCounts: newCounts, actionsRemaining: newActionsRemaining };
  });
  return { ...state, grid: newGrid, players };
}

export function canMove(state: GameState, unitId: string, target: Position): boolean {
  if (state.players[state.currentPlayer].actionsRemaining <= 0) return false;
  let foundUnit: Unit | null = null; let sourcePos: Position | null = null;
  for (let row = 0; row < 5 && !foundUnit; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) { foundUnit = unit; sourcePos = { row: row + 1, col: col + 1 }; break; }
    }
  }
  if (!foundUnit || !sourcePos) return false;
  // Must be current player's unit and must not have acted this turn
  if (foundUnit.ownerId !== state.currentPlayer) return false;
  if (foundUnit.actedThisTurn) return false;
  const targetTile = state.grid[target.row - 1][target.col - 1];
  if (targetTile.unit !== null) return false;
  const distance = getDistance(sourcePos, target);
  if (distance > foundUnit.stats.moveRange) return false;
  const dx = Math.abs(target.col - sourcePos.col); const dy = Math.abs(target.row - sourcePos.row);
  const isDiagonal = dx === 1 && dy === 1;
  if (!isDiagonal && distance > 1) {
    const isHorizontal = dy === 0; const isVertical = dx === 0;
    if (isHorizontal) {
      const midCol = (sourcePos.col + target.col) / 2; const intermediateTile = state.grid[sourcePos.row - 1][midCol - 1];
      if (intermediateTile.unit !== null) return false;
    } else if (isVertical) {
      const midRow = (sourcePos.row + target.row) / 2; const intermediateTile = state.grid[midRow - 1][sourcePos.col - 1];
      if (intermediateTile.unit !== null) return false;
    }
  }
  return true;
}

export function applyMove(state: GameState, unitId: string, target: Position): GameState {
  if (!canMove(state, unitId, target)) throw new Error('Move not allowed');
  let foundUnit: Unit | null = null; let sourcePos: Position | null = null;
  for (let row = 0; row < 5 && !foundUnit; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) { foundUnit = unit; sourcePos = { row: row + 1, col: col + 1 }; break; }
    }
  }
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === sourcePos!.row - 1 || rowIndex === target.row - 1) {
      return row.map((tile, colIndex) => {
        if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) return { ...tile, unit: null };
        if (rowIndex === target.row - 1 && colIndex === target.col - 1) return { ...tile, unit: { ...foundUnit!, position: { row: target.row, col: target.col }, stats: { ...foundUnit!.stats }, actedThisTurn: true } };
        return tile;
      });
    }
    return row;
  });
  // Decrement actionsRemaining for the current player
  const playerIndex = state.currentPlayer;
  const players = state.players.map((p, i) =>
    i === playerIndex
      ? { ...p, actionsRemaining: Math.max(0, (p.actionsRemaining ?? 1) - 1) }
      : p
  );
  return { ...state, grid: newGrid, players };
}

export function canRotate(state: GameState, unitId: string, targetPos: Position): boolean {
  if (state.players[state.currentPlayer].actionsRemaining <= 0) return false;
  let sourceUnit: Unit | null = null; let sourcePos: Position | null = null;
  for (let row = 0; row < 5 && !sourceUnit; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) { sourceUnit = unit; sourcePos = { row: row + 1, col: col + 1 }; break; }
    }
  }
  if (!sourceUnit || !sourcePos) return false;
  // Must be current player's unit and not have acted already this turn
  if (sourceUnit.ownerId !== state.currentPlayer) return false;
  if (sourceUnit.actedThisTurn) return false;
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) return false;
  const targetUnit = targetTile.unit;
  if (sourceUnit.ownerId !== state.currentPlayer) return false;
  if (targetUnit.ownerId !== state.currentPlayer) return false;
  // Disable rotation between units of the same type
  if (sourceUnit.stats.type === targetUnit.stats.type) return false;
  const distance = getDistance(sourcePos, targetPos);
  const dx = Math.abs(targetPos.col - sourcePos.col);
  const dy = Math.abs(targetPos.row - sourcePos.row);
  const isDiagonal = dx === 1 && dy === 1;
  // Allow orthogonal adjacency (swap) for all
  if (distance === 1) return true;
  // Allow diagonal adjacency (swap) only for Cavalry
  if (isDiagonal && sourceUnit.stats.type === 'Cavalry') return true;
  // Cavalry long rotation: two tiles orthogonally with empty middle
  if (sourceUnit.stats.type === 'Cavalry' && ((dx === 2 && dy === 0) || (dx === 0 && dy === 2))) {
    const midPos: Position = {
      row: dy === 0 ? sourcePos.row : (sourcePos.row + targetPos.row) / 2,
      col: dx === 0 ? sourcePos.col : (sourcePos.col + targetPos.col) / 2,
    };
    const midTile = state.grid[midPos.row - 1][midPos.col - 1];
    if (midTile.unit !== null) return false;
    return true;
  }
  return false;
}

export function applyRotate(state: GameState, unitId: string, targetPos: Position): GameState {
  if (!canRotate(state, unitId, targetPos)) throw new Error('Rotate not allowed');
  let sourceUnit: Unit | null = null; let sourcePos: Position | null = null;
  for (let row = 0; row < 5 && !sourceUnit; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) { sourceUnit = unit; sourcePos = { row: row + 1, col: col + 1 }; break; }
    }
  }
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  const targetUnit = targetTile.unit!;
  const dx = Math.abs(targetPos.col - sourcePos!.col);
  const dy = Math.abs(targetPos.row - sourcePos!.row);
  const isDiagonal = dx === 1 && dy === 1;
  const isAdj = dx + dy === 1;
  let newGrid: GameState['grid'];
  if (isAdj || isDiagonal) {
    // Simple swap for adjacency or diagonal cavalry swap
    // Only the initiating unit (sourceUnit) uses up its action
    // The target unit does NOT have its action consumed
    newGrid = state.grid.map((row, rowIndex) => {
      if (rowIndex === sourcePos!.row - 1 || rowIndex === targetPos.row - 1) {
        return row.map((tile, colIndex) => {
          if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) return { ...tile, unit: { ...targetUnit, position: { row: sourcePos!.row, col: sourcePos!.col } } };
          if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1) return { ...tile, unit: { ...sourceUnit!, position: { row: targetPos.row, col: targetPos.col }, actedThisTurn: true } };
          return tile;
        });
      }
      return row;
    });
  } else if ((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) {
    // Cavalry long rotation: cavalry -> target; target -> middle; source becomes empty
    // Only the initiating cavalry uses up its action
    // The target unit does NOT have its action consumed
    const midPos: Position = {
      row: dy === 0 ? sourcePos!.row : (sourcePos!.row + targetPos.row) / 2,
      col: dx === 0 ? sourcePos!.col : (sourcePos!.col + targetPos.col) / 2,
    };
    newGrid = state.grid.map((row, rowIndex) => row.map((tile, colIndex) => {
      const here: Position = { row: rowIndex + 1, col: colIndex + 1 };
      if (here.row === sourcePos!.row && here.col === sourcePos!.col) {
        // Source becomes empty
        return { ...tile, unit: null };
      }
      if (here.row === midPos.row && here.col === midPos.col) {
        // Middle gets the target unit, NOT marked as acted
        return { ...tile, unit: { ...targetUnit, position: { row: midPos.row, col: midPos.col } } };
      }
      if (here.row === targetPos.row && here.col === targetPos.col) {
        // Target gets the cavalry, mark as acted
        return { ...tile, unit: { ...sourceUnit!, position: { row: targetPos.row, col: targetPos.col }, actedThisTurn: true } };
      }
      return tile;
    }));
  } else {
    throw new Error('Rotate not allowed');
  }
  // Decrement actionsRemaining for the current player
  const playerIndex = state.currentPlayer;
  const players = state.players.map((p, i) =>
    i === playerIndex
      ? { ...p, actionsRemaining: Math.max(0, (p.actionsRemaining ?? 1) - 1) }
      : p
  );
  return { ...state, grid: newGrid, players };
}

function hasLineOfSight(state: GameState, from: Position, to: Position): boolean {
  const dx = to.col - from.col; const dy = to.row - from.row;
  const adx = Math.abs(dx); const ady = Math.abs(dy);
  if (adx === 0) {
    const step = dy > 0 ? 1 : -1;
    for (let r = from.row + step; r !== to.row; r += step) { if (state.grid[r - 1][from.col - 1].unit) return false; }
    return true;
  }
  if (ady === 0) {
    const step = dx > 0 ? 1 : -1;
    for (let c = from.col + step; c !== to.col; c += step) { if (state.grid[from.row - 1][c - 1].unit) return false; }
    return true;
  }
  if (adx === 1 && ady === 1) return true;
  return false;
}

export function getMatchupsForType(type: Unit['stats']['type']): { beats: Unit['stats']['type'][]; diesTo: Unit['stats']['type'][] } {
  const beats = MELEE_BEATS[type] ?? [];
  const diesTo: Unit['stats']['type'][] = [];
  (Object.keys(MELEE_BEATS) as Array<Unit['stats']['type']>).forEach(t => {
    if (MELEE_BEATS[t].includes(type)) diesTo.push(t);
  });
  return { beats, diesTo };
}

// Melee combat matchups (Attack Range 1, orthogonal adjacency)
// Rules: Unit X can attack Unit Y if Y is in X's "Defeats" list
const MELEE_BEATS: Record<Unit['stats']['type'], Unit['stats']['type'][]> = {
  // Swordsman defeats: Archer, Cavalry, Axeman, Swordsman, Spearman
  Swordsman: ['Archer', 'Cavalry', 'Axeman', 'Swordsman', 'Spearman'],
  // Shieldbearer(Shieldman) defeats: Archer
  Shieldman: ['Archer'],
  // Axeman defeats: Archer, Shieldbearer, Cavalry, Axeman, Spearman
  Axeman: ['Archer', 'Shieldman', 'Cavalry', 'Axeman', 'Spearman'],
  // Cavalry defeats: Archer, Cavalry, Spearman
  Cavalry: ['Archer', 'Cavalry', 'Spearman'],
  // Archer defeats: Archer (melee only)
  Archer: ['Archer'],
  // Spearman defeats: Archer, Shieldbearer, Cavalry, Spearman (melee)
  Spearman: ['Archer', 'Shieldman', 'Cavalry', 'Spearman'],
};

// Ranged combat matchups (Attack Range 2, for Archer and Spearman)
// Archer's Defeats(ranged): Archer, Cavalry, Axeman, Swordsman, Spearman
// Spearman's Defeats(ranged): Archer, Cavalry, Spearman
// Note: Shieldman is immune to ranged attacks
const RANGED_BEATS: Partial<Record<Unit['stats']['type'], Unit['stats']['type'][]>> = {
  Archer: ['Archer', 'Cavalry', 'Axeman', 'Swordsman', 'Spearman'],
  Spearman: ['Archer', 'Cavalry', 'Spearman'],
};

// Close-range is strictly orthogonal adjacency (dx+dy === 1)
function isCloseRange(a: Position, b: Position): boolean {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  return dx + dy === 1;
}

export function applyAttack(state: GameState, attackerId: string, targetPos: Position): GameState {
  if (state.players[state.currentPlayer].actionsRemaining <= 0) throw new Error('No actions remaining');
  let attacker: Unit | null = null; let attackerPos: Position | null = null;
  for (let row = 0; row < 5 && !attacker; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === attackerId) { attacker = unit; attackerPos = { row: row + 1, col: col + 1 }; break; }
    }
  }
  if (!attacker || !attackerPos) throw new Error(`Attacker with id ${attackerId} not found`);
  // Must be current player's unit and must not have acted this turn
  if (attacker.ownerId !== state.currentPlayer) throw new Error('Cannot attack with opponent unit');
  if (attacker.actedThisTurn) throw new Error('Unit already acted this turn');
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) throw new Error(`No unit at target position (${targetPos.row}, ${targetPos.col})`);
  const defender = targetTile.unit;
  if (defender.ownerId === attacker.ownerId) throw new Error('Cannot attack friendly unit');
  const distance = getDistance(attackerPos, targetPos);
  if (distance > attacker.stats.attackRange) throw new Error(`Attack distance ${distance} exceeds unit's attackRange ${attacker.stats.attackRange}`);
  
  const aType = attacker.stats.type;
  const dType = defender.stats.type;
  const isMelee = isCloseRange(attackerPos, targetPos);
  const isRanged = !isMelee;
  
  let removeAttacker = false;
  let removeDefender = false;
  
  // Ranged combat (Archer or Spearman, distance > 1)
  if (isRanged && (aType === 'Archer' || aType === 'Spearman')) {
    if (!hasLineOfSight(state, attackerPos, targetPos)) throw new Error('Line of sight is blocked for ranged attack');
    // Ranged attack - can only target units in attacker's RANGED_BEATS, Shieldman immune
    if (dType === 'Shieldman') {
      throw new Error('Shieldman is immune to ranged attacks');
    }
    
    // Check if attacker beats defender at range
    const attackerRangedTargets = RANGED_BEATS[aType] ?? [];
    const attackerWins = attackerRangedTargets.includes(dType);
    
    // Check if defender can counter-attack at range (mutual combat)
    const defenderRangedTargets = RANGED_BEATS[dType] ?? [];
    const defenderWins = defenderRangedTargets.includes(aType);
    
    // Mutual defeat - both units removed
    if (attackerWins && defenderWins) {
      removeAttacker = true;
      removeDefender = true;
    }
    // Attacker wins - defender removed
    else if (attackerWins) {
      removeDefender = true;
    }
    // Defender wins - attacker removed
    else if (defenderWins) {
      removeAttacker = true;
    }
    // Neither wins - invalid attack
    else {
      throw new Error('Invalid ranged target');
    }
  }
  // Melee combat
  else {
    const attackerBeats = MELEE_BEATS[aType];
    const defenderBeats = MELEE_BEATS[dType];
    const attackerWins = attackerBeats.includes(dType);
    const defenderWins = defenderBeats.includes(aType);
    
    // Mutual defeat - both units removed
    if (attackerWins && defenderWins) {
      removeAttacker = true;
      removeDefender = true;
    }
    // Attacker wins - defender removed
    else if (attackerWins) {
      removeDefender = true;
    }
    // Defender wins - attacker removed
    else if (defenderWins) {
      removeAttacker = true;
    }
    // Neither wins - invalid attack (should be blocked by canAttack)
    else {
      throw new Error('Invalid attack: no advantage');
    }
  }
  
  const newGrid = state.grid.map((row, rowIndex) => row.map((tile, colIndex) => {
    let unit = tile.unit;
    if (rowIndex === attackerPos!.row - 1 && colIndex === attackerPos!.col - 1) {
      if (removeAttacker) {
        unit = null;
      } else if (unit) {
        unit = { ...unit, actedThisTurn: true };
      }
    }
    if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1 && removeDefender) unit = null;
    return { ...tile, unit };
  }));
  // Decrement actionsRemaining for the current player
  const playerIndex = state.currentPlayer;
  const players = state.players.map((p, i) =>
    i === playerIndex
      ? { ...p, actionsRemaining: Math.max(0, (p.actionsRemaining ?? 1) - 1) }
      : p
  );
  return { ...state, grid: newGrid, players };
}

export function canAttack(state: GameState, attackerId: string, targetPos: Position): boolean {
  let attacker: Unit | null = null; let attackerPos: Position | null = null;
  for (let r = 0; r < 5 && !attacker; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit; if (u && u.id === attackerId) { attacker = u; attackerPos = { row: r + 1, col: c + 1 }; break; }
    }
  }
  if (!attacker || !attackerPos) return false;
  if (attacker.ownerId !== state.currentPlayer) return false;
  if (attacker.actedThisTurn) return false;
  const tile = state.grid[targetPos.row - 1][targetPos.col - 1]; if (!tile.unit) return false;
  const defender = tile.unit; if (defender.ownerId === attacker.ownerId) return false;
  const distance = getDistance(attackerPos, targetPos); if (distance > attacker.stats.attackRange) return false;
  
  const aType = attacker.stats.type;
  const dType = defender.stats.type;
  const isMelee = isCloseRange(attackerPos, targetPos);
  
  // Ranged attack (Archer or Spearman)
  if (!isMelee && (aType === 'Archer' || aType === 'Spearman')) {
    // Shieldman immune to ranged
    if (dType === 'Shieldman') return false;
    // Must be in attacker's RANGED_BEATS list and have line of sight
    const rangedTargets = RANGED_BEATS[aType] ?? [];
    if (!rangedTargets.includes(dType)) return false;
    return hasLineOfSight(state, attackerPos, targetPos);
  }
  
// Melee attack - attacker must be able to defeat the defender
  const attackerBeats = MELEE_BEATS[aType] ?? [];
  const attackerWins = attackerBeats.includes(dType);

  // Attacker must be able to defeat the defender to initiate attack
  if (!attackerWins) return false;
  return true;
}

export function endTurn(state: GameState): GameState {
  const newCurrentPlayer = state.currentPlayer === 0 ? 1 : 0;
  const bonus = middleControlBonus(state, newCurrentPlayer);
  const sideDeploys = countOutsideControl(state, newCurrentPlayer);
  const bothSides = controlsBothSides(state, newCurrentPlayer);
  const players = state.players.map((p, i) => {
    if (i !== newCurrentPlayer) return p;
    // Both side control points gives 2 actions, center also gives 2 actions
    const actionsBonus = bothSides ? 1 : bonus;
    return {
      ...p,
      actionsRemaining: 1 + actionsBonus,
      deploymentsRemaining: p.deploymentsRemaining,
    };
  });
  const newState = {
    ...state,
    grid: state.grid,
    currentPlayer: newCurrentPlayer,
    turnNumber: state.turnNumber + 1,
    players,
    hasActedThisTurn: false,
    freeDeploymentsRemaining: sideDeploys > 0 ? 1 : 0
  };
  // Reset per-unit action flags for the new turn
  const resetGrid = state.grid.map(row => row.map(tile => {
    const u = tile.unit;
    if (!u) return tile;
    return { ...tile, unit: { ...u, actedThisTurn: false } };
  }));
  return { ...newState, grid: resetGrid };
}

// --- Draw Detection ---
export const MAX_TURN_LIMIT = 250;

// Count units on the board for a player
export function countUnitsOnBoard(state: GameState, playerId: number): number {
  let count = 0;
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.unit && tile.unit.ownerId === playerId) count++;
    }
  }
  return count;
}

// Get all units on the board for a player
function getUnitsOnBoard(state: GameState, playerId: number): Unit[] {
  const units: Unit[] = [];
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.unit && tile.unit.ownerId === playerId) units.push(tile.unit);
    }
  }
  return units;
}

// Get all unit types on the board for a player
function getUnitTypesOnBoard(state: GameState, playerId: number): Set<Unit['stats']['type']> {
  const types = new Set<Unit['stats']['type']>();
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.unit && tile.unit.ownerId === playerId) types.add(tile.unit.stats.type);
    }
  }
  return types;
}

// Check if a unit type is "invincible" - cannot be defeated by any enemy unit type
// For melee: check if no enemy type has this type in their MELEE_BEATS
// For ranged: Shieldman is immune, others can be killed by Archer
function canBeKilledMelee(unitType: Unit['stats']['type'], enemyTypes: Set<Unit['stats']['type']>): boolean {
  for (const enemyType of enemyTypes) {
    if (MELEE_BEATS[enemyType]?.includes(unitType)) return true;
  }
  return false;
}

function canBeKilledRanged(unitType: Unit['stats']['type'], enemyTypes: Set<Unit['stats']['type']>): boolean {
  // Shieldman is immune to ranged attacks
  if (unitType === 'Shieldman') return false;
  // Check if any enemy ranged unit (Archer or Spearman) can kill this type
  for (const enemyType of enemyTypes) {
    const rangedTargets = RANGED_BEATS[enemyType];
    if (rangedTargets && rangedTargets.includes(unitType)) return true;
  }
  return false;
}

function isUnitInvincible(unitType: Unit['stats']['type'], enemyTypes: Set<Unit['stats']['type']>): boolean {
  return !canBeKilledMelee(unitType, enemyTypes) && !canBeKilledRanged(unitType, enemyTypes);
}

// Check for mutual invincibility on control points
// Both players must have at least one unit on a control point that cannot be killed
function hasMutualInvincibilityOnControlPoints(state: GameState): boolean {
  const p0Types = getUnitTypesOnBoard(state, 0);
  const p1Types = getUnitTypesOnBoard(state, 1);
  
  // Check if player 0 has an invincible unit on a control point
  let p0HasInvincible = false;
  for (const cp of CONTROL_POINTS) {
    const tile = state.grid[cp.row - 1][cp.col - 1];
    if (tile.unit && tile.unit.ownerId === 0) {
      if (isUnitInvincible(tile.unit.stats.type, p1Types)) {
        p0HasInvincible = true;
        break;
      }
    }
  }
  
  // Check if player 1 has an invincible unit on a control point
  let p1HasInvincible = false;
  for (const cp of CONTROL_POINTS) {
    const tile = state.grid[cp.row - 1][cp.col - 1];
    if (tile.unit && tile.unit.ownerId === 1) {
      if (isUnitInvincible(tile.unit.stats.type, p0Types)) {
        p1HasInvincible = true;
        break;
      }
    }
  }
  
  return p0HasInvincible && p1HasInvincible;
}

export type DrawReason = 'turn_limit' | 'low_resources' | 'mutual_invincibility' | null;

/**
 * Check if the game should end in a draw
 * Draw conditions:
 * 1. Turn count reaches MAX_TURN_LIMIT (250)
 * 2. Both players have < 3 total units (on board + deployments remaining)
 * 3. Both players have invincible units on control points (stalemate)
 */
export function checkDraw(state: GameState): DrawReason {
  // Turn limit draw
  if (state.turnNumber >= MAX_TURN_LIMIT) {
    return 'turn_limit';
  }
  
  // Low resources draw - both players have fewer than 3 total resources
  const p0Units = countUnitsOnBoard(state, 0);
  const p1Units = countUnitsOnBoard(state, 1);
  const p0Total = p0Units + countRemainingDeployments(state, 0);
  const p1Total = p1Units + countRemainingDeployments(state, 1);
  
  if (p0Total < 3 && p1Total < 3) {
    return 'low_resources';
  }
  
  // Mutual invincibility on control points - only check if both players have no deployments
  if (!hasDeploymentsLeft(state, 0) && !hasDeploymentsLeft(state, 1)) {
    if (hasMutualInvincibilityOnControlPoints(state)) {
      return 'mutual_invincibility';
    }
  }
  
  return null;
}

/**
 * Check if a player has any deployments left (hasn't maxed out all unit types)
 */
export function hasDeploymentsLeft(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  const counts = player.deploymentCounts ?? {};
  const unitTypes = ['swordsman', 'shieldman', 'axeman', 'cavalry', 'archer', 'spearman'];
  
  // If any unit type hasn't reached max, player can still deploy
  for (const unitType of unitTypes) {
    if ((counts[unitType] ?? 0) < MAX_DEPLOYMENTS_PER_TYPE) {
      return true;
    }
  }
  return false;
}

/**
 * Count total remaining deployments for a player (18 max total - 3 per type * 6 types)
 */
export function countRemainingDeployments(state: GameState, playerId: number): number {
  const player = state.players[playerId];
  const counts = player.deploymentCounts ?? {};
  const unitTypes = ['swordsman', 'shieldman', 'axeman', 'cavalry', 'archer', 'spearman'];
  
  let remaining = 0;
  for (const unitType of unitTypes) {
    remaining += MAX_DEPLOYMENTS_PER_TYPE - (counts[unitType] ?? 0);
  }
  return remaining;
}

/**
 * Check if a player has been eliminated (no units on board AND no deployments left)
 * Returns the playerId of the eliminated player, or null if neither is eliminated
 */
export function checkElimination(state: GameState): 0 | 1 | null {
  const p0Units = countUnitsOnBoard(state, 0);
  const p1Units = countUnitsOnBoard(state, 1);
  
  // Player 0 eliminated - player 1 wins
  if (p0Units === 0 && !hasDeploymentsLeft(state, 0)) {
    return 0;
  }
  
  // Player 1 eliminated - player 0 wins
  if (p1Units === 0 && !hasDeploymentsLeft(state, 1)) {
    return 1;
  }
  
  return null;
}
