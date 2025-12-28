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
  return OUTSIDE_POINTS.filter(p => controlsPosition(state, playerId, p)).length;
}

function middleControlBonus(state: GameState, playerId: number): number {
  return controlsPosition(state, playerId, { row: 3, col: 3 }) ? 1 : 0;
}

const LABEL_TO_KEY: Record<string, keyof typeof UNIT_DATA> = {
  Swordsman: 'swordsman',
  Shieldman: 'shieldman',
  Spearman: 'spearman',
  Cavalry: 'cavalry',
  Archer: 'archer',
};

function normalizeUnitKey(key: string): keyof typeof UNIT_DATA {
  if ((UNIT_DATA as any)[key]) return key as keyof typeof UNIT_DATA;
  const mapped = LABEL_TO_KEY[key];
  if (mapped) return mapped;
  const lower = key.toLowerCase();
  if ((UNIT_DATA as any)[lower]) return lower as keyof typeof UNIT_DATA;
  throw new Error('Unknown unit key');
}

export function canDeployUnit(state: GameState, unitKey: string, targetPos: Position): boolean {
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit !== null) return false;
  const validRow = state.currentPlayer === 0 ? 1 : 5;
  if (targetPos.row !== validRow) return false;
  let normalized: keyof typeof UNIT_DATA;
  try { normalized = normalizeUnitKey(unitKey); } catch { return false; }
  const unitStats = UNIT_DATA[normalized];
  if (!unitStats) return false;
  const freeAvailable = state.freeDeploymentsRemaining > 0 && !state.hasActedThisTurn;
  const actionsAvailable = state.players[state.currentPlayer].actionsRemaining > 0;
  if (!freeAvailable && !actionsAvailable) return false;
  return true;
}

export function applyDeployUnit(state: GameState, unitKey: string, targetPos: Position): GameState {
  if (!canDeployUnit(state, unitKey, targetPos)) throw new Error('Invalid deployment');
  const normalized = normalizeUnitKey(unitKey);
  const unitStats = UNIT_DATA[normalized];
  const unitId = `${state.currentPlayer}-${String(normalized)}-${Date.now()}`;
  const newUnit: Unit = { id: unitId, ownerId: state.currentPlayer, stats: { ...unitStats }, position: { row: targetPos.row, col: targetPos.col } };
  const newGrid = state.grid.map((row, r) => r === targetPos.row - 1 ? row.map((tile, c) => c === targetPos.col - 1 ? { ...tile, unit: newUnit } : tile) : row);
  return { ...state, grid: newGrid };
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
        if (rowIndex === target.row - 1 && colIndex === target.col - 1) return { ...tile, unit: { ...foundUnit!, position: { row: target.row, col: target.col }, stats: { ...foundUnit!.stats } } };
        return tile;
      });
    }
    return row;
  });
  return { ...state, grid: newGrid };
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
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) return false;
  const targetUnit = targetTile.unit;
  if (sourceUnit.ownerId !== state.currentPlayer) return false;
  if (targetUnit.ownerId !== state.currentPlayer) return false;
  const distance = getDistance(sourcePos, targetPos);
  if (distance !== 1) return false;
  return true;
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
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === sourcePos!.row - 1 || rowIndex === targetPos.row - 1) {
      return row.map((tile, colIndex) => {
        if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) return { ...tile, unit: { ...targetUnit, position: { row: sourcePos!.row, col: sourcePos!.col } } };
        if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1) return { ...tile, unit: { ...sourceUnit!, position: { row: targetPos.row, col: targetPos.col } } };
        return tile;
      });
    }
    return row;
  });
  return { ...state, grid: newGrid };
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
  const beats = BEATS[type] ?? [];
  const diesTo: Unit['stats']['type'][] = [];
  (Object.keys(BEATS) as Array<Unit['stats']['type']>).forEach(t => {
    if (BEATS[t].includes(type)) diesTo.push(t);
  });
  return { beats, diesTo };
}

const BEATS: Record<Unit['stats']['type'], Unit['stats']['type'][]> = {
  Swordsman: ['Swordsman', 'Spearman', 'Cavalry', 'Archer'],
  Shieldman: ['Archer', 'Cavalry'],
  Spearman: ['Swordsman', 'Spearman', 'Shieldman', 'Cavalry', 'Archer'],
  Cavalry: ['Cavalry', 'Spearman', 'Archer'],
  Archer: ['Cavalry', 'Spearman', 'Archer'],
};

function isCloseRange(a: Position, b: Position): boolean { return getDistance(a, b) === 1; }

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
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) throw new Error(`No unit at target position (${targetPos.row}, ${targetPos.col})`);
  const defender = targetTile.unit;
  if (defender.ownerId === attacker.ownerId) throw new Error('Cannot attack friendly unit');
  const distance = getDistance(attackerPos, targetPos);
  if (distance > attacker.stats.attackRange) throw new Error(`Attack distance ${distance} exceeds unit's attackRange ${attacker.stats.attackRange}`);
  const aType = attacker.stats.type; const dType = defender.stats.type;
  let removeAttacker = false; let removeDefender = false;
  if (aType === 'Archer' && dType === 'Archer') { removeAttacker = true; removeDefender = true; }
  else if (aType === 'Archer') {
    if (isCloseRange(attackerPos, targetPos)) { removeAttacker = true; }
    else {
      if (!hasLineOfSight(state, attackerPos, targetPos)) throw new Error('Line of sight is blocked for Archer');
      if (dType === 'Shieldman' || dType === 'Swordsman') { removeAttacker = false; removeDefender = false; }
      else { removeDefender = true; }
    }
  } else {
    const attackerBeats = BEATS[aType]; const defenderBeats = BEATS[dType];
    const attackerWins = attackerBeats.includes(dType); const defenderWins = defenderBeats.includes(aType);
    if (attackerWins && defenderWins) { removeAttacker = true; removeDefender = true; }
    else if (attackerWins) { removeDefender = true; }
    else if (defenderWins) { removeAttacker = true; }
    else { throw new Error('Invalid attack: no advantage'); }
  }
  const newGrid = state.grid.map((row, rowIndex) => row.map((tile, colIndex) => {
    let unit = tile.unit;
    if (rowIndex === attackerPos!.row - 1 && colIndex === attackerPos!.col - 1 && removeAttacker) unit = null;
    if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1 && removeDefender) unit = null;
    return { ...tile, unit };
  }));
  return { ...state, grid: newGrid };
}

export function canAttack(state: GameState, attackerId: string, targetPos: Position): boolean {
  let attacker: Unit | null = null; let attackerPos: Position | null = null;
  for (let r = 0; r < 5 && !attacker; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit; if (u && u.id === attackerId) { attacker = u; attackerPos = { row: r + 1, col: c + 1 }; break; }
    }
  }
  if (!attacker || !attackerPos) return false;
  const tile = state.grid[targetPos.row - 1][targetPos.col - 1]; if (!tile.unit) return false;
  const defender = tile.unit; if (defender.ownerId === attacker.ownerId) return false;
  const distance = getDistance(attackerPos, targetPos); if (distance > attacker.stats.attackRange) return false;
  if (attacker.stats.type === 'Archer') {
    if (isCloseRange(attackerPos, targetPos)) return true;
    if (defender.stats.type === 'Shieldman' || defender.stats.type === 'Swordsman') return false;
    return hasLineOfSight(state, attackerPos, targetPos);
  }
  const attackerBeats = BEATS[attacker.stats.type]; const defenderBeats = BEATS[defender.stats.type];
  const attackerWins = attackerBeats.includes(defender.stats.type); const defenderWins = defenderBeats.includes(attacker.stats.type);
  if (!attackerWins && !defenderWins) return false;
  return true;
}

export function endTurn(state: GameState): GameState {
  const newCurrentPlayer = state.currentPlayer === 0 ? 1 : 0;
  const bonus = middleControlBonus(state, newCurrentPlayer);
  const freeDeploys = countOutsideControl(state, newCurrentPlayer);
  const players = state.players.map((p, i) => i === newCurrentPlayer ? { ...p, actionsRemaining: 1 + bonus } : p);
  return { ...state, currentPlayer: newCurrentPlayer, turnNumber: state.turnNumber + 1, players, freeDeploymentsRemaining: freeDeploys, hasActedThisTurn: false };
}
