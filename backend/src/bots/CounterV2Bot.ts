/**
 * CounterV2Bot - A deterministic policy bot that reacts to the player's last move
 * using counter-relationship data from matchups.json.
 * 
 * Priority Rules (STRICT ORDER):
 * 1. ATTACK FIRST - Attack countered units, then equal units
 * 2. REACT TO PLAYER DEPLOY/MOVE - Find nearby units and respond
 * 3. DEPLOY AS LAST RESORT - Deploy counter or equal units
 * 4. END TURN - If no actions possible
 */

import type { Bot, BotContext } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Position, Unit, UnitStats } from '../logic/GameState';
import { canAttack } from '../logic/rules';

// ============================================================================
// Types
// ============================================================================

type UnitType = UnitStats['type'];

interface UnitMatchups {
  counters: UnitType[];
  equals: UnitType[];
  counteredBy: UnitType[];
}

type CounterTable = Record<UnitType, UnitMatchups>;

// ============================================================================
// Counter Table (from matchups.json)
// ============================================================================

const COUNTER_TABLE: CounterTable = {
  "Axeman": {
    "counters": ["Shieldman", "Cavalry", "Spearman"],
    "equals": ["Axeman"],
    "counteredBy": ["Swordsman", "Archer"]
  },
  "Swordsman": {
    "counters": ["Axeman", "Cavalry", "Spearman"],
    "equals": ["Swordsman", "Shieldman"],
    "counteredBy": ["Archer"]
  },
  "Archer": {
    "counters": ["Axeman", "Swordsman", "Cavalry"],
    "equals": ["Archer"],
    "counteredBy": ["Shieldman", "Spearman"]
  },
  "Shieldman": {
    "counters": ["Archer"],
    "equals": ["Swordsman", "Shieldman"],
    "counteredBy": ["Axeman", "Cavalry", "Spearman"]
  },
  "Cavalry": {
    "counters": ["Shieldman"],
    "equals": ["Cavalry"],
    "counteredBy": ["Axeman", "Swordsman", "Archer", "Spearman"]
  },
  "Spearman": {
    "counters": ["Archer", "Shieldman", "Cavalry"],
    "equals": ["Spearman"],
    "counteredBy": ["Axeman", "Swordsman"]
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get unit types that counter the given unit type
 */
function getCounterUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.counteredBy ?? [];
}

/**
 * Get unit types that are equal to the given unit type
 */
function getEqualUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.equals ?? [];
}

/**
 * Get units that this unit type counters
 */
function getCounteredUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.counters ?? [];
}

/**
 * Calculate Manhattan distance between two positions
 */
function distance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/**
 * Calculate column distance between two positions
 */
function columnDistance(a: Position, b: Position): number {
  return Math.abs(a.col - b.col);
}

/**
 * Find a unit by its ID on the board
 */
function findUnitById(state: GameState, unitId: string): { unit: Unit; pos: Position } | null {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.id === unitId) {
        return { unit: u, pos: { row: r + 1, col: c + 1 } };
      }
    }
  }
  return null;
}

/**
 * Find a unit at a specific position
 */
function findUnitAt(state: GameState, pos: Position): Unit | null {
  const tile = state.grid[pos.row - 1]?.[pos.col - 1];
  return tile?.unit ?? null;
}

/**
 * Get all units belonging to a player
 */
function getAllUnits(state: GameState, ownerId: number): Array<{ unit: Unit; pos: Position }> {
  const units: Array<{ unit: Unit; pos: Position }> = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.ownerId === ownerId) {
        units.push({ unit: u, pos: { row: r + 1, col: c + 1 } });
      }
    }
  }
  return units;
}

/**
 * Get all enemy units (units not belonging to the bot)
 */
function getEnemyUnits(state: GameState, botPlayerId: number): Array<{ unit: Unit; pos: Position }> {
  return getAllUnits(state, botPlayerId === 0 ? 1 : 0);
}

/**
 * Find the closest unit from a list to a target position
 */
function findClosestUnit(
  units: Array<{ unit: Unit; pos: Position }>,
  targetPos: Position
): { unit: Unit; pos: Position } | null {
  if (units.length === 0) return null;
  
  let closest = units[0];
  let minDist = distance(closest.pos, targetPos);
  
  for (let i = 1; i < units.length; i++) {
    const d = distance(units[i].pos, targetPos);
    if (d < minDist) {
      minDist = d;
      closest = units[i];
    }
  }
  
  return closest;
}

/**
 * Check if an attacker can attack a target (wrapper around rules.canAttack)
 */
function canAttackTarget(
  state: GameState,
  attackerId: string,
  targetPos: Position
): boolean {
  try {
    return canAttack(state, attackerId, targetPos);
  } catch {
    return false;
  }
}

/**
 * Get the END_TURN action from available actions
 */
function getEndTurnAction(available: readonly Action[]): Action {
  return available.find(a => a.type === 'END_TURN') ?? available[0];
}

/**
 * Resolve the opponent's last-moved/deployed unit from lastAction
 */
function resolveOpponentUnit(
  lastAction: NonNullable<GameState['lastAction']>,
  state: GameState,
  botPlayerId: number
): { unit: Unit; pos: Position } | null {
  // Only react to opponent's actions
  if (lastAction.by === botPlayerId) return null;
  
  if (lastAction.type === 'DEPLOY' && lastAction.to) {
    const unit = findUnitAt(state, lastAction.to);
    if (unit && unit.ownerId !== botPlayerId) {
      return { unit, pos: lastAction.to };
    }
  }
  
  if ((lastAction.type === 'MOVE' || lastAction.type === 'ROTATE') && lastAction.unitId) {
    return findUnitById(state, lastAction.unitId);
  }
  
  if (lastAction.type === 'ATTACK' && lastAction.unitId) {
    return findUnitById(state, lastAction.unitId);
  }
  
  return null;
}

/**
 * Filter units that are in the same column or one column away from target
 */
function getNearbyColumnUnits(
  units: Array<{ unit: Unit; pos: Position }>,
  targetPos: Position
): Array<{ unit: Unit; pos: Position }> {
  return units.filter(u => columnDistance(u.pos, targetPos) <= 1);
}

/**
 * Filter units by type from a list of types
 */
function filterUnitsByTypes(
  units: Array<{ unit: Unit; pos: Position }>,
  types: UnitType[]
): Array<{ unit: Unit; pos: Position }> {
  return units.filter(u => types.includes(u.unit.stats.type));
}

// ============================================================================
// Action Finding Functions
// ============================================================================

/**
 * Find attack actions where our unit counters the enemy unit
 */
function findCounterAttacks(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action[] {
  const attacks = available.filter((a): a is Extract<Action, { type: 'ATTACK' }> => a.type === 'ATTACK');
  const counterAttacks: Action[] = [];
  
  for (const attack of attacks) {
    const attackerInfo = findUnitById(state, attack.unitId);
    if (!attackerInfo || attackerInfo.unit.ownerId !== botPlayerId) continue;
    
    // Find the target unit
    const targetInfo = findUnitById(state, attack.targetId);
    if (!targetInfo) continue;
    
    const attackerType = attackerInfo.unit.stats.type;
    const targetType = targetInfo.unit.stats.type;
    
    // Check if attacker counters target
    const countered = getCounteredUnits(attackerType);
    if (countered.includes(targetType)) {
      counterAttacks.push(attack);
    }
  }
  
  return counterAttacks;
}

/**
 * Find attack actions where our unit equals the enemy unit
 */
function findEqualAttacks(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action[] {
  const attacks = available.filter((a): a is Extract<Action, { type: 'ATTACK' }> => a.type === 'ATTACK');
  const equalAttacks: Action[] = [];
  
  for (const attack of attacks) {
    const attackerInfo = findUnitById(state, attack.unitId);
    if (!attackerInfo || attackerInfo.unit.ownerId !== botPlayerId) continue;
    
    const targetInfo = findUnitById(state, attack.targetId);
    if (!targetInfo) continue;
    
    const attackerType = attackerInfo.unit.stats.type;
    const targetType = targetInfo.unit.stats.type;
    
    // Check if attacker equals target
    const equals = getEqualUnits(attackerType);
    if (equals.includes(targetType)) {
      equalAttacks.push(attack);
    }
  }
  
  return equalAttacks;
}

/**
 * Find the closest attack from a list
 */
function findClosestAttack(
  attacks: readonly Action[],
  state: GameState
): Action | null {
  if (attacks.length === 0) return null;
  if (attacks.length === 1) return attacks[0];
  
  // Sort by distance between attacker and target (prefer closer engagements)
  let closest = attacks[0];
  let minDist = Infinity;
  
  for (const attack of attacks) {
    if (attack.type !== 'ATTACK') continue;
    
    const attackerInfo = findUnitById(state, attack.unitId);
    const targetInfo = findUnitById(state, attack.targetId);
    
    if (attackerInfo && targetInfo) {
      const d = distance(attackerInfo.pos, targetInfo.pos);
      if (d < minDist) {
        minDist = d;
        closest = attack;
      }
    }
  }
  
  return closest;
}

/**
 * Find attack action against a specific target with a specific attacker type constraint
 */
function findAttackAgainstTarget(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetId: string,
  attackerTypes: UnitType[]
): Action | null {
  const attacks = available.filter((a): a is Extract<Action, { type: 'ATTACK' }> => 
    a.type === 'ATTACK' && a.targetId === targetId
  );
  
  for (const attack of attacks) {
    const attackerInfo = findUnitById(state, attack.unitId);
    if (!attackerInfo || attackerInfo.unit.ownerId !== botPlayerId) continue;
    
    if (attackerTypes.includes(attackerInfo.unit.stats.type)) {
      return attack;
    }
  }
  
  return null;
}

/**
 * Find the best move action to get a unit closer to target
 * ROW CONSTRAINT: abs(destinationRow - deploymentRow) must be <= 2
 * COLUMN CONSTRAINT: Only consider units in same column or one column away from target
 * Deployment row is 1 for player 0, 5 for player 1
 */
function findMoveTowardTarget(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetPos: Position,
  unitTypes: UnitType[]
): Action | null {
  const moves = available.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
  
  // Deployment row: player 0 deploys on row 1, player 1 deploys on row 5
  const deploymentRow = botPlayerId === 0 ? 1 : 5;
  
  let bestMove: Action | null = null;
  let bestGain = 0;
  let bestFinalDist = Infinity;
  
  for (const move of moves) {
    const unitInfo = findUnitById(state, move.unitId);
    if (!unitInfo || unitInfo.unit.ownerId !== botPlayerId) continue;
    if (!unitTypes.includes(unitInfo.unit.stats.type)) continue;
    
    // COLUMN CONSTRAINT: Only consider units in same column or one column away from target
    if (columnDistance(unitInfo.pos, targetPos) > 1) continue;
    
    // ROW CONSTRAINT: Reject moves where unit goes more than 2 rows from deployment row
    if (Math.abs(move.to.row - deploymentRow) > 2) continue;
    
    const currentDist = distance(unitInfo.pos, targetPos);
    const newDist = distance(move.to, targetPos);
    const gain = currentDist - newDist;
    
    // Only consider moves that get us closer
    if (gain <= 0) continue;
    
    // Prefer moves with greater gain, or same gain but closer final position
    if (gain > bestGain || (gain === bestGain && newDist < bestFinalDist)) {
      bestGain = gain;
      bestFinalDist = newDist;
      bestMove = move;
    }
  }
  
  return bestMove;
}

/**
 * Find the best rotate action to get a unit closer to target
 * ROW CONSTRAINT: abs(destinationRow - deploymentRow) must be <= 2
 * COLUMN CONSTRAINT: Only consider units in same column or one column away from target
 * Deployment row is 1 for player 0, 5 for player 1
 */
function findRotateTowardTarget(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetPos: Position,
  unitTypes: UnitType[]
): Action | null {
  const rotates = available.filter((a): a is Extract<Action, { type: 'ROTATE' }> => a.type === 'ROTATE');
  
  // Deployment row: player 0 deploys on row 1, player 1 deploys on row 5
  const deploymentRow = botPlayerId === 0 ? 1 : 5;
  
  let bestRotate: Action | null = null;
  let bestGain = 0;
  let bestFinalDist = Infinity;
  
  for (const rotate of rotates) {
    const unitInfo = findUnitById(state, rotate.unitId);
    if (!unitInfo || unitInfo.unit.ownerId !== botPlayerId) continue;
    if (!unitTypes.includes(unitInfo.unit.stats.type)) continue;
    
    // COLUMN CONSTRAINT: Only consider units in same column or one column away from target
    if (columnDistance(unitInfo.pos, targetPos) > 1) continue;
    
    // ROW CONSTRAINT: Reject rotates where unit goes more than 2 rows from deployment row
    if (Math.abs(rotate.target.row - deploymentRow) > 2) continue;
    
    const currentDist = distance(unitInfo.pos, targetPos);
    const newDist = distance(rotate.target, targetPos);
    const gain = currentDist - newDist;
    
    // Only consider rotates that get us closer
    if (gain <= 0) continue;
    
    if (gain > bestGain || (gain === bestGain && newDist < bestFinalDist)) {
      bestGain = gain;
      bestFinalDist = newDist;
      bestRotate = rotate;
    }
  }
  
  return bestRotate;
}

/**
 * Move or rotate a unit toward target (move preferred)
 * ROW CONSTRAINT: abs(destinationRow - deploymentRow) must be <= 2
 * COLUMN CONSTRAINT: Only consider units in same column or one column away from target
 * If no legal move satisfies these constraints, movement is not allowed
 */
function moveOrRotateToward(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetPos: Position,
  unitTypes: UnitType[]
): Action | null {
  // Try move first
  const move = findMoveTowardTarget(available, state, botPlayerId, targetPos, unitTypes);
  if (move) return move;
  
  // Fall back to rotate
  return findRotateTowardTarget(available, state, botPlayerId, targetPos, unitTypes);
}

/**
 * Find the closest deploy tile to target
 */
function findClosestDeployTile(
  available: readonly Action[],
  targetPos: Position,
  unitTypes: UnitType[]
): Action | null {
  const deploys = available.filter((a): a is Extract<Action, { type: 'DEPLOY' }> => 
    a.type === 'DEPLOY' && unitTypes.includes(a.unitType)
  );
  
  if (deploys.length === 0) return null;
  
  let closest = deploys[0];
  let minDist = distance(closest.to, targetPos);
  
  for (let i = 1; i < deploys.length; i++) {
    const d = distance(deploys[i].to, targetPos);
    if (d < minDist) {
      minDist = d;
      closest = deploys[i];
    }
  }
  
  return closest;
}

/**
 * Find any available deploy action (fallback)
 */
function findAnyDeploy(available: readonly Action[]): Action | null {
  return available.find(a => a.type === 'DEPLOY') ?? null;
}

// ============================================================================
// Main Bot Logic
// ============================================================================

/**
 * Priority 1: ATTACK FIRST
 * - Attack countered units first
 * - Then attack equal units (closest one)
 */
function tryAttackFirst(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action | null {
  // Find attacks against units we counter
  const counterAttacks = findCounterAttacks(available, state, botPlayerId);
  if (counterAttacks.length > 0) {
    return findClosestAttack(counterAttacks, state);
  }
  
  // Find attacks against equal units
  const equalAttacks = findEqualAttacks(available, state, botPlayerId);
  if (equalAttacks.length > 0) {
    return findClosestAttack(equalAttacks, state);
  }
  
  return null;
}

/**
 * Priority 2: REACT TO PLAYER DEPLOY OR MOVE
 * Steps A-E as specified
 */
function tryReactToPlayerAction(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetUnit: { unit: Unit; pos: Position }
): Action | null {
  const targetType = targetUnit.unit.stats.type;
  const targetPos = targetUnit.pos;
  
  // Get unit types that counter the target
  const counterTypes = getCounterUnits(targetType);
  // Get unit types that equal the target
  const equalTypes = getEqualUnits(targetType);
  
  // Step A: Find nearby friendly units (same column or one column away)
  const botUnits = getAllUnits(state, botPlayerId);
  const nearbyUnits = getNearbyColumnUnits(botUnits, targetPos);
  
  // Filter to counter and equal units from nearby
  const nearbyCounterUnits = filterUnitsByTypes(nearbyUnits, counterTypes);
  const nearbyEqualUnits = filterUnitsByTypes(nearbyUnits, equalTypes);
  
  // Step B: Counter attack attempt
  const closestCounter = findClosestUnit(nearbyCounterUnits, targetPos);
  if (closestCounter) {
    // Check if it can attack the target
    if (canAttackTarget(state, closestCounter.unit.id, targetPos)) {
      const attack = available.find((a): a is Extract<Action, { type: 'ATTACK' }> =>
        a.type === 'ATTACK' && 
        a.unitId === closestCounter.unit.id && 
        a.targetId === targetUnit.unit.id
      );
      if (attack) return attack;
    }
  }
  
  // Step C: Equal attack attempt
  const closestEqual = findClosestUnit(nearbyEqualUnits, targetPos);
  if (closestEqual) {
    if (canAttackTarget(state, closestEqual.unit.id, targetPos)) {
      const attack = available.find((a): a is Extract<Action, { type: 'ATTACK' }> =>
        a.type === 'ATTACK' && 
        a.unitId === closestEqual.unit.id && 
        a.targetId === targetUnit.unit.id
      );
      if (attack) return attack;
    }
  }
  
  // Step D: Move counter unit closer
  if (closestCounter) {
    const moveAction = moveOrRotateToward(
      available.filter(a => 
        (a.type === 'MOVE' && a.unitId === closestCounter.unit.id) ||
        (a.type === 'ROTATE' && a.unitId === closestCounter.unit.id)
      ),
      state,
      botPlayerId,
      targetPos,
      counterTypes
    );
    if (moveAction) return moveAction;
  }
  
  // Also try moving any counter unit toward target (not just nearby ones)
  const allCounterMove = moveOrRotateToward(available, state, botPlayerId, targetPos, counterTypes);
  if (allCounterMove) return allCounterMove;
  
  // Step E: Move equal unit closer
  if (closestEqual) {
    const moveAction = moveOrRotateToward(
      available.filter(a => 
        (a.type === 'MOVE' && a.unitId === closestEqual.unit.id) ||
        (a.type === 'ROTATE' && a.unitId === closestEqual.unit.id)
      ),
      state,
      botPlayerId,
      targetPos,
      equalTypes
    );
    if (moveAction) return moveAction;
  }
  
  // Also try moving any equal unit toward target
  const allEqualMove = moveOrRotateToward(available, state, botPlayerId, targetPos, equalTypes);
  if (allEqualMove) return allEqualMove;
  
  return null;
}

/**
 * Priority 3: DEPLOY AS LAST RESORT
 * - Deploy counter unit close to target
 * - Or deploy equal unit close to target
 */
function tryDeploy(
  available: readonly Action[],
  targetUnit: { unit: Unit; pos: Position } | null
): Action | null {
  // If no target, just deploy anything
  if (!targetUnit) {
    return findAnyDeploy(available);
  }
  
  const targetType = targetUnit.unit.stats.type;
  const targetPos = targetUnit.pos;
  
  // Get counter types
  const counterTypes = getCounterUnits(targetType);
  
  // Try to deploy a counter unit
  const counterDeploy = findClosestDeployTile(available, targetPos, counterTypes);
  if (counterDeploy) return counterDeploy;
  
  // Get equal types
  const equalTypes = getEqualUnits(targetType);
  
  // Try to deploy an equal unit
  const equalDeploy = findClosestDeployTile(available, targetPos, equalTypes);
  if (equalDeploy) return equalDeploy;
  
  // Fall back to any deploy
  return findAnyDeploy(available);
}

// ============================================================================
// Bot Factory
// ============================================================================

export function createCounterV2Bot(): Bot {
  return {
    id: 'counter_v2_bot',
    name: 'Counter(v2)',
    
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      const endTurn = getEndTurnAction(availableActions);
      
      // =====================================================================
      // Priority 1: ATTACK FIRST
      // If we have any unit that can attack a player unit it counters, do it.
      // Otherwise, attack equal units (closest one).
      // =====================================================================
      const attackAction = tryAttackFirst(availableActions, gameState, playerId);
      if (attackAction) return attackAction;
      
      // Get last action for reactive behavior
      const lastAction = gameState.lastAction;
      const targetUnit = lastAction ? resolveOpponentUnit(lastAction, gameState, playerId) : null;
      
      // =====================================================================
      // Priority 2: REACT TO PLAYER DEPLOY OR MOVE
      // Only if player deployed or moved
      // =====================================================================
      if (targetUnit && lastAction && (lastAction.type === 'DEPLOY' || lastAction.type === 'MOVE')) {
        const reactAction = tryReactToPlayerAction(availableActions, gameState, playerId, targetUnit);
        if (reactAction) return reactAction;
      }
      
      // Also react to ATTACK and ROTATE similarly (move toward threat)
      if (targetUnit && lastAction && (lastAction.type === 'ATTACK' || lastAction.type === 'ROTATE')) {
        const reactAction = tryReactToPlayerAction(availableActions, gameState, playerId, targetUnit);
        if (reactAction) return reactAction;
      }
      
      // =====================================================================
      // Priority 3: DEPLOY AS LAST RESORT
      // =====================================================================
      const deployAction = tryDeploy(availableActions, targetUnit);
      if (deployAction) return deployAction;
      
      // =====================================================================
      // Priority 4: END TURN
      // =====================================================================
      return endTurn;
    }
  };
}
