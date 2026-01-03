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
  
  if (dx === 1 && dy === 1) {
    return 2;
  }
  
  return dx + dy;
}

// One-shot deterministic combat: no damage/HP

export function controlsPosition(state: GameState, playerId: number, pos: Position): boolean {
  const tile = state.grid[pos.row - 1][pos.col - 1];
  return tile.unit !== null && tile.unit.ownerId === playerId;
}

export function controlsAllPoints(state: GameState, playerId: number): boolean {
  return CONTROL_POINTS.every(pos => controlsPosition(state, playerId, pos));
}
function countOutsideControl(state: GameState, playerId: number): number {
  return OUTSIDE_POINTS.filter(p => controlsPosition(state, playerId, p)).length;
}

function middleControlBonus(state: GameState, playerId: number): number {
  // +1 action if holding the middle control point
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
  // Target tile must be empty
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit !== null) return false;

  // Valid row per player
  const validRow = state.currentPlayer === 0 ? 1 : 5;
  if (targetPos.row !== validRow) return false;

  // Unit must exist
  let normalized: keyof typeof UNIT_DATA;
  try {
    normalized = normalizeUnitKey(unitKey);
  } catch {
    return false;
  }
  const unitStats = UNIT_DATA[normalized];
  if (!unitStats) return false;

  const player = state.players[state.currentPlayer];
  const hasFreeDeployment = state.freeDeploymentsRemaining > 0 && !state.hasActedThisTurn;
  const actionsAvailable = player.actionsRemaining > 0;
  // Need either a free deployment or an action available
  if (!hasFreeDeployment && !actionsAvailable) return false;
  // Check per-type deployment limit (max 2 of each type)
  const deploymentCounts = player.deploymentCounts ?? {};
  const currentTypeCount = deploymentCounts[normalized] ?? 0;
  if (currentTypeCount >= MAX_DEPLOYMENTS_PER_TYPE) return false;

  return true;
}

export function applyDeployUnit(state: GameState, unitKey: string, targetPos: Position): GameState {
  if (!canDeployUnit(state, unitKey, targetPos)) {
    throw new Error('Invalid deployment');
  }

  const normalized = normalizeUnitKey(unitKey);
  const unitStats = UNIT_DATA[normalized];
  const unitId = `${state.currentPlayer}-${String(normalized)}-${Date.now()}`;
  const newUnit: Unit = {
    id: unitId,
    ownerId: state.currentPlayer,
    stats: { ...unitStats },
    position: { row: targetPos.row, col: targetPos.col },
    actedThisTurn: true,
  };

  // Place unit
  const newGrid = state.grid.map((row, r) => {
    if (r === targetPos.row - 1) {
      return row.map((tile, c) => {
        if (c === targetPos.col - 1) {
          return { ...tile, unit: newUnit };
        }
        return tile;
      });
    }
    return row;
  });

  // Check if using free deployment (from side control point buff)
  const hasFreeDeployment = state.freeDeploymentsRemaining > 0 && !state.hasActedThisTurn;

  // Update per-type count and handle action consumption
  const playerIndex = state.currentPlayer;
  const players = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const currentCounts = p.deploymentCounts ?? {};
    const newCounts = { ...currentCounts, [normalized]: (currentCounts[normalized] ?? 0) + 1 };
    // If using free deployment, don't consume action
    const newActionsRemaining = hasFreeDeployment 
      ? p.actionsRemaining 
      : Math.max(0, (p.actionsRemaining ?? 1) - 1);
    return { ...p, deploymentCounts: newCounts, actionsRemaining: newActionsRemaining };
  });

  // Decrement free deployment counter if used
  const newFreeDeploymentsRemaining = hasFreeDeployment 
    ? state.freeDeploymentsRemaining - 1 
    : state.freeDeploymentsRemaining;

  return { ...state, grid: newGrid, players, freeDeploymentsRemaining: newFreeDeploymentsRemaining };
}

export function checkWin(state: GameState, playerId: number): boolean {
  return controlsAllPoints(state, playerId);
}
// Card and spell systems removed

export function canMove(state: GameState, unitId: string, target: Position): boolean {
  // Must have actions remaining
  if (state.players[state.currentPlayer].actionsRemaining <= 0) return false;
  // Find the unit by unitId
  let foundUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        foundUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (foundUnit) break;
  }
  
  // Unit must exist
  if (!foundUnit || !sourcePos) {
    return false;
  }
  // Must be current player's unit and not have acted already this turn
  if (foundUnit.ownerId !== state.currentPlayer) return false;
  if (foundUnit.actedThisTurn) return false;
  
  // Target tile must be empty
  const targetTile = state.grid[target.row - 1][target.col - 1];
  if (targetTile.unit !== null) {
    return false;
  }
  
  // Validate movement distance
  const distance = getDistance(sourcePos, target);
  if (distance > foundUnit.stats.moveRange) {
    return false;
  }
  
  // Check for blocked orthogonal paths
  const dx = Math.abs(target.col - sourcePos.col);
  const dy = Math.abs(target.row - sourcePos.row);
  const isDiagonal = dx === 1 && dy === 1;
  
  if (!isDiagonal && distance > 1) {
    // Orthogonal move with distance > 1: check the single intermediate tile
    const isHorizontal = dy === 0;
    const isVertical = dx === 0;
    
    if (isHorizontal) {
      // Moving horizontally: check middle tile
      const midCol = (sourcePos.col + target.col) / 2;
      const intermediateTile = state.grid[sourcePos.row - 1][midCol - 1];
      if (intermediateTile.unit !== null) {
        return false;
      }
    } else if (isVertical) {
      // Moving vertically: check middle tile
      const midRow = (sourcePos.row + target.row) / 2;
      const intermediateTile = state.grid[midRow - 1][sourcePos.col - 1];
      if (intermediateTile.unit !== null) {
        return false;
      }
    }
  }
  // Diagonal moves are never blocked
  
  return true;
}

export function canRotate(state: GameState, unitId: string, targetPos: Position): boolean {
  if (state.players[state.currentPlayer].actionsRemaining <= 0) return false;
  // Find the source unit by unitId
  let sourceUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        sourceUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (sourceUnit) break;
  }
  
  // Source unit must exist
  if (!sourceUnit || !sourcePos) {
    return false;
  }
  // Must be current player's unit and not have acted already this turn
  if (sourceUnit.ownerId !== state.currentPlayer) return false;
  if (sourceUnit.actedThisTurn) return false;
  
  // Target tile must contain a unit
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) {
    return false;
  }
  
  const targetUnit = targetTile.unit;
  
  // Both units must belong to currentPlayer
  if (sourceUnit.ownerId !== state.currentPlayer) {
    return false;
  }
  if (targetUnit.ownerId !== state.currentPlayer) {
    return false;
  }
  // Disable rotation between units of the same type
  if (sourceUnit.stats.type === targetUnit.stats.type) {
    return false;
  }
  
  const distance = getDistance(sourcePos, targetPos);
  const dx = Math.abs(targetPos.col - sourcePos.col);
  const dy = Math.abs(targetPos.row - sourcePos.row);
  const isDiagonal = dx === 1 && dy === 1;
  // Allow orthogonal adjacency for all
  if (distance === 1) {
    return true;
  }
  // Allow diagonal adjacency only for Cavalry
  if (isDiagonal && sourceUnit.stats.type === 'Cavalry') {
    return true;
  }
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

export function applyMove(state: GameState, unitId: string, target: Position): GameState {
  if (!canMove(state, unitId, target)) {
    throw new Error('Move not allowed');
  }
  // Validate move
  if (!canMove(state, unitId, target)) {
    throw new Error(`Invalid move for unit ${unitId} to (${target.row}, ${target.col})`);
  }
  
  // Find the unit by unitId (we know it exists from canMove)
  let foundUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        foundUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (foundUnit) break;
  }
  
  // Clone only affected rows
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === sourcePos!.row - 1 || rowIndex === target.row - 1) {
      return row.map((tile, colIndex) => {
        if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) {
          // Clear source tile
          return { ...tile, unit: null };
        } else if (rowIndex === target.row - 1 && colIndex === target.col - 1) {
          // Set target tile with moved unit
          return {
            ...tile,
            unit: {
              ...foundUnit!,
              position: { row: target.row, col: target.col },
              stats: { ...foundUnit!.stats },
              actedThisTurn: true,
            }
          };
        }
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
  
  // Mark that a non-deployment action was taken (forfeits free deployment)
  return {
    ...state,
    grid: newGrid,
    players,
    hasActedThisTurn: true
  };
}

export function applyRotate(state: GameState, unitId: string, targetPos: Position): GameState {
  if (!canRotate(state, unitId, targetPos)) {
    throw new Error('Rotate not allowed');
  }
  // Validate rotate
  if (!canRotate(state, unitId, targetPos)) {
    throw new Error(`Invalid rotate for unit ${unitId} with (${targetPos.row}, ${targetPos.col})`);
  }
  
  // Find the source unit by unitId
  let sourceUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        sourceUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (sourceUnit) break;
  }
  
  // Get target unit
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
          if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) {
            return {
              ...tile,
              unit: { ...targetUnit, position: { row: sourcePos!.row, col: sourcePos!.col } }
            };
          }
          if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1) {
            return {
              ...tile,
              unit: { ...sourceUnit!, position: { row: targetPos.row, col: targetPos.col }, actedThisTurn: true }
            };
          }
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
  
  // Mark that a non-deployment action was taken (forfeits free deployment)
  return {
    ...state,
    grid: newGrid,
    players,
    hasActedThisTurn: true
  };
}

// Archer line-of-sight helper
function hasLineOfSight(state: GameState, from: Position, to: Position): boolean {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Orthogonal lines: check intermediate tiles (exclude endpoints)
  if (adx === 0) {
    const step = dy > 0 ? 1 : -1;
    for (let r = from.row + step; r !== to.row; r += step) {
      if (state.grid[r - 1][from.col - 1].unit) return false;
    }
    return true;
  }
  if (ady === 0) {
    const step = dx > 0 ? 1 : -1;
    for (let c = from.col + step; c !== to.col; c += step) {
      if (state.grid[from.row - 1][c - 1].unit) return false;
    }
    return true;
  }

  // Diagonal adjacency (dx===±1, dy===±1) has no intermediate tile; consider clear
  if (adx === 1 && ady === 1) {
    return true;
  }

  // Non-straight paths beyond adjacency: no line-of-sight
  return false;
}

export function getMatchupsForType(type: Unit['stats']['type']): { 
  beatsMelee: Unit['stats']['type'][]; 
  beatsRanged: Unit['stats']['type'][];
  // Legacy properties for backwards compatibility
  beats: Unit['stats']['type'][]; 
  diesTo: Unit['stats']['type'][] 
} {
  const beatsMelee = MELEE_BEATS[type] ?? [];
  const beatsRanged = RANGED_BEATS[type] ?? [];
  const diesTo: Unit['stats']['type'][] = [];
  (Object.keys(MELEE_BEATS) as Array<Unit['stats']['type']>).forEach(t => {
    if (MELEE_BEATS[t].includes(type)) diesTo.push(t);
  });
  return { beatsMelee, beatsRanged, beats: beatsMelee, diesTo };
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
  if (state.players[state.currentPlayer].actionsRemaining <= 0) {
    throw new Error('No actions remaining');
  }
  // Find the attacker unit by attackerId
  let attacker: Unit | null = null;
  let attackerPos: Position | null = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === attackerId) {
        attacker = unit;
        attackerPos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (attacker) break;
  }
  
  if (!attacker || !attackerPos) {
    throw new Error(`Attacker with id ${attackerId} not found`);
  }
  // Must be current player's unit and not have acted already this turn
  if (attacker.ownerId !== state.currentPlayer) {
    throw new Error('Cannot attack with opponent unit');
  }
  if (attacker.actedThisTurn) {
    throw new Error('Unit already acted this turn');
  }
  
  // Validate target tile contains a unit
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) {
    throw new Error(`No unit at target position (${targetPos.row}, ${targetPos.col})`);
  }
  
  const defender = targetTile.unit;
  
  // Validate target is an enemy unit
  if (defender.ownerId === attacker.ownerId) {
    throw new Error(`Cannot attack friendly unit`);
  }
  
  // Validate attack range
  const distance = getDistance(attackerPos, targetPos);
  if (distance > attacker.stats.attackRange) {
    throw new Error(`Attack distance ${distance} exceeds unit's attackRange ${attacker.stats.attackRange}`);
  }

  const aType = attacker.stats.type;
  const dType = defender.stats.type;
  const isMelee = isCloseRange(attackerPos, targetPos);
  const isRanged = !isMelee;
  
  let removeAttacker = false;
  let removeDefender = false;
  
  // Ranged combat (Archer or Spearman, distance > 1)
  if (isRanged && (aType === 'Archer' || aType === 'Spearman')) {
    if (!hasLineOfSight(state, attackerPos, targetPos)) {
      throw new Error('Line of sight is blocked for ranged attack');
    }
    // Ranged attack - can only target units in attacker's RANGED_BEATS, Shieldman immune
    if (dType === 'Shieldman') {
      throw new Error('Shieldman is immune to ranged attacks');
    }
    const rangedTargets = RANGED_BEATS[aType] ?? [];
    if (rangedTargets.includes(dType)) {
      removeDefender = true;
    } else {
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

  // Apply removals immediately
  const newGrid = state.grid.map((row, rowIndex) => {
    return row.map((tile, colIndex) => {
      let unit = tile.unit;
      if (rowIndex === attackerPos!.row - 1 && colIndex === attackerPos!.col - 1) {
        if (removeAttacker) {
          unit = null;
        } else if (unit) {
          unit = { ...unit, actedThisTurn: true };
        }
      }
      if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1 && removeDefender) {
        unit = null;
      }
      return { ...tile, unit };
    });
  });

  // Decrement actionsRemaining for the current player
  const playerIndex = state.currentPlayer;
  const players = state.players.map((p, i) =>
    i === playerIndex
      ? { ...p, actionsRemaining: Math.max(0, (p.actionsRemaining ?? 1) - 1) }
      : p
  );
  
  // Mark that a non-deployment action was taken (forfeits free deployment)
  return { ...state, grid: newGrid, players, hasActedThisTurn: true };
}

export function canAttack(state: GameState, attackerId: string, targetPos: Position): boolean {
  // Find attacker and defender
  let attacker: Unit | null = null;
  let attackerPos: Position | null = null;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.id === attackerId) {
        attacker = u;
        attackerPos = { row: r + 1, col: c + 1 };
        break;
      }
    }
    if (attacker) break;
  }
  if (!attacker || !attackerPos) return false;
  if (attacker.ownerId !== state.currentPlayer) return false;
  if (attacker.actedThisTurn) return false;
  const tile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (!tile.unit) return false;
  const defender = tile.unit;
  if (defender.ownerId === attacker.ownerId) return false;

  const distance = getDistance(attackerPos, targetPos);
  if (distance > attacker.stats.attackRange) return false;

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
  const attackerBeats = MELEE_BEATS[aType];
  const attackerWins = attackerBeats.includes(dType);

  // Attacker must be able to defeat the defender to initiate attack
  if (!attackerWins) return false;
  return true;
}

// Control bonuses removed (no coins/resources)

// startActionPhase removed; phases no longer used

export function endTurn(state: GameState): GameState {
  const newCurrentPlayer = state.currentPlayer === 0 ? 1 : 0;
  // Compute next player's actions: base 1 + center bonus
  const bonus = middleControlBonus(state, newCurrentPlayer);
  const freeDeploys = countOutsideControl(state, newCurrentPlayer);
  const players = state.players.map((p, i) => i === newCurrentPlayer ? { ...p, actionsRemaining: 1 + bonus } : p);

  // Reset per-unit action flags for the new turn
  const resetGrid = state.grid.map(row => row.map(tile => {
    const u = tile.unit;
    if (!u) return tile;
    return { ...tile, unit: { ...u, actedThisTurn: false } };
  }));

  return {
    ...state,
    grid: resetGrid,
    currentPlayer: newCurrentPlayer,
    turnNumber: state.turnNumber + 1,
    players,
    freeDeploymentsRemaining: freeDeploys,
    hasActedThisTurn: false,
  };
}
// Card retrieval/recruit/sell/draw removed
