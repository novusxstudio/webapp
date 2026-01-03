/**
 * CounterV3Bot - An advanced deterministic policy bot that builds on CounterV2
 * with control-point awareness, threat scoring, and safe movement.
 * 
 * GLOBAL PRIORITY ORDER (STRICT):
 * 1. FREE ATTACKS - Attack countered units, then equal units
 * 2. CONTROL-POINT OVERRIDE - Capture or deny control points
 * 3. THREAT-BASED REACTION - React to high-threat enemy units
 * 4. PROACTIVE PLAY - Control point pressure, cavalry rotation, safe positioning
 * 5. DEPLOY - Deploy counter or equal units as last resort
 * 6. END TURN - If no legal action exists
 */

import type { Bot, BotContext } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Position, Unit, UnitStats } from '../logic/GameState';
import { canAttack, CONTROL_POINTS } from '../logic/rules';

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
// Constants
// ============================================================================

/**
 * Threat threshold - only react to enemy units with threat score >= this value
 * threatScore = +3 if on/adjacent to control point
 *             + +2 if Cavalry
 *             + +1 if counters at least one of my deployed units
 */
const THREAT_THRESHOLD = 2;

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
// Basic Helper Functions
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
// Control Point Helper Functions (NEW)
// ============================================================================

/**
 * Check if a position is a control point
 */
function isControlPoint(pos: Position): boolean {
  return CONTROL_POINTS.some(cp => cp.row === pos.row && cp.col === pos.col);
}

/**
 * Check if a position is adjacent to any control point (distance 1)
 */
function isAdjacentToControlPoint(pos: Position): boolean {
  return CONTROL_POINTS.some(cp => distance(pos, cp) === 1);
}

/**
 * Check if a position is on or adjacent to a control point
 */
function isOnOrAdjacentToControlPoint(pos: Position): boolean {
  return isControlPoint(pos) || isAdjacentToControlPoint(pos);
}

/**
 * Get control points that are empty (no unit)
 */
function getEmptyControlPoints(state: GameState): Position[] {
  return CONTROL_POINTS.filter(cp => findUnitAt(state, cp) === null);
}

/**
 * Get control points controlled by a player
 */
function getControlledPoints(state: GameState, playerId: number): Position[] {
  return CONTROL_POINTS.filter(cp => {
    const unit = findUnitAt(state, cp);
    return unit && unit.ownerId === playerId;
  });
}

/**
 * Check if bot can capture a control point this turn
 * Returns the action to capture if possible, null otherwise
 */
function canCaptureControlPoint(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action | null {
  const emptyPoints = getEmptyControlPoints(state);
  
  // Check if any move action lands on an empty control point
  for (const action of available) {
    if (action.type === 'MOVE') {
      if (emptyPoints.some(cp => cp.row === action.to.row && cp.col === action.to.col)) {
        // Verify it's our unit
        const unitInfo = findUnitById(state, action.unitId);
        if (unitInfo && unitInfo.unit.ownerId === botPlayerId) {
          return action;
        }
      }
    }
    if (action.type === 'ROTATE') {
      if (emptyPoints.some(cp => cp.row === action.target.row && cp.col === action.target.col)) {
        const unitInfo = findUnitById(state, action.unitId);
        if (unitInfo && unitInfo.unit.ownerId === botPlayerId) {
          return action;
        }
      }
    }
  }
  
  return null;
}

/**
 * Check if bot can deny an opponent's control point capture
 * (attack an enemy on a control point, or move to block)
 * Returns the action to deny if possible, null otherwise
 */
function canDenyControlPoint(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action | null {
  const opponentId = botPlayerId === 0 ? 1 : 0;
  const opponentPoints = getControlledPoints(state, opponentId);
  
  // Priority: Attack an enemy unit on a control point
  for (const action of available) {
    if (action.type === 'ATTACK') {
      const targetInfo = findUnitById(state, action.targetId);
      if (targetInfo && opponentPoints.some(cp => cp.row === targetInfo.pos.row && cp.col === targetInfo.pos.col)) {
        return action;
      }
    }
  }
  
  return null;
}

/**
 * Check if bot can capture or deny a control point
 */
function canCaptureOrDenyControlPoint(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action | null {
  // Try capture first
  const captureAction = canCaptureControlPoint(available, state, botPlayerId);
  if (captureAction) return captureAction;
  
  // Try deny
  return canDenyControlPoint(available, state, botPlayerId);
}

// ============================================================================
// Threat Scoring (NEW)
// ============================================================================

/**
 * Compute threat score for an enemy unit
 * +3 if unit is on or adjacent to a control point
 * +2 if unit type is Cavalry
 * +1 if unit counters at least one of my deployed units
 */
function computeThreatScore(
  enemyUnit: { unit: Unit; pos: Position },
  state: GameState,
  botPlayerId: number
): number {
  let score = 0;
  
  // +3 if on or adjacent to control point
  if (isOnOrAdjacentToControlPoint(enemyUnit.pos)) {
    score += 3;
  }
  
  // +2 if Cavalry
  if (enemyUnit.unit.stats.type === 'Cavalry') {
    score += 2;
  }
  
  // +1 if counters at least one of my deployed units
  const myUnits = getAllUnits(state, botPlayerId);
  const enemyCounters = getCounteredUnits(enemyUnit.unit.stats.type);
  const countersMyUnit = myUnits.some(u => enemyCounters.includes(u.unit.stats.type));
  if (countersMyUnit) {
    score += 1;
  }
  
  return score;
}

// ============================================================================
// Safe Movement (NEW)
// ============================================================================

/**
 * Check if a tile is safe for a unit (not in attack range of any unit that counters it)
 */
function isTileSafeFor(
  state: GameState,
  unitType: UnitType,
  tile: Position,
  botPlayerId: number
): boolean {
  const opponentId = botPlayerId === 0 ? 1 : 0;
  const enemyUnits = getAllUnits(state, opponentId);
  
  // Get types that counter this unit
  const counterTypes = getCounterUnits(unitType);
  
  for (const enemy of enemyUnits) {
    // Only check enemies that counter this unit type
    if (!counterTypes.includes(enemy.unit.stats.type)) continue;
    
    // Check if enemy can attack the tile (based on attack range)
    const dist = distance(enemy.pos, tile);
    if (dist <= enemy.unit.stats.attackRange) {
      return false; // Tile is in attack range of a counter unit
    }
  }
  
  return true;
}

/**
 * Find the best SAFE move action to get a unit closer to target
 * Additional constraint: destination must not be in attack range of counter units
 */
function findSafeMoveTowardTarget(
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
    
    // SAFETY CONSTRAINT: Reject moves to tiles in attack range of counter units
    if (!isTileSafeFor(state, unitInfo.unit.stats.type, move.to, botPlayerId)) continue;
    
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
 * Find the best SAFE rotate action to get a unit closer to target
 * Additional constraint: destination must not be in attack range of counter units
 */
function findSafeRotateTowardTarget(
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
    
    // SAFETY CONSTRAINT: Reject rotates to tiles in attack range of counter units
    if (!isTileSafeFor(state, unitInfo.unit.stats.type, rotate.target, botPlayerId)) continue;
    
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
 * Safe move or rotate a unit toward target (move preferred)
 */
function safeMoveOrRotateToward(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetPos: Position,
  unitTypes: UnitType[]
): Action | null {
  // Try safe move first
  const move = findSafeMoveTowardTarget(available, state, botPlayerId, targetPos, unitTypes);
  if (move) return move;
  
  // Fall back to safe rotate
  return findSafeRotateTowardTarget(available, state, botPlayerId, targetPos, unitTypes);
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
// Main Bot Logic - Priority Functions
// ============================================================================

/**
 * Priority 1: FREE ATTACKS
 * - Attack countered units first
 * - Then attack equal units (closest one)
 */
function tryFreeAttacks(
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
 * Priority 2: CONTROL-POINT OVERRIDE
 * - Capture empty control points
 * - Deny opponent control points
 */
function tryControlPointOverride(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action | null {
  return canCaptureOrDenyControlPoint(available, state, botPlayerId);
}

/**
 * Priority 3: THREAT-BASED REACTION
 * - Only react if threat score >= THREAT_THRESHOLD
 * - Uses safe movement (Step D/E updated)
 */
function tryThreatReaction(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number,
  targetUnit: { unit: Unit; pos: Position }
): Action | null {
  // Compute threat score
  const threatScore = computeThreatScore(targetUnit, state, botPlayerId);
  
  // Only react if threat score meets threshold
  if (threatScore < THREAT_THRESHOLD) {
    return null;
  }
  
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
  
  // Step D: SAFE Move counter unit closer
  if (closestCounter) {
    const moveAction = safeMoveOrRotateToward(
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
  const allCounterMove = safeMoveOrRotateToward(available, state, botPlayerId, targetPos, counterTypes);
  if (allCounterMove) return allCounterMove;
  
  // Step E: SAFE Move equal unit closer
  if (closestEqual) {
    const moveAction = safeMoveOrRotateToward(
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
  const allEqualMove = safeMoveOrRotateToward(available, state, botPlayerId, targetPos, equalTypes);
  if (allEqualMove) return allEqualMove;
  
  return null;
}

/**
 * Priority 4: PROACTIVE PLAY
 * - Control point pressure: move toward empty control points
 * - Cavalry rotation: prefer rotating cavalry for mobility
 * - Safe positional improvement
 */
function tryProactivePlay(
  available: readonly Action[],
  state: GameState,
  botPlayerId: number
): Action | null {
  const deploymentRow = botPlayerId === 0 ? 1 : 5;
  
  // 1. Control point pressure: move any unit toward an empty control point
  const emptyPoints = getEmptyControlPoints(state);
  if (emptyPoints.length > 0) {
    // Find the closest empty control point
    const botUnits = getAllUnits(state, botPlayerId);
    
    for (const cp of emptyPoints) {
      // Try to find a move that gets us to or closer to this control point
      const moves = available.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
      
      for (const move of moves) {
        const unitInfo = findUnitById(state, move.unitId);
        if (!unitInfo || unitInfo.unit.ownerId !== botPlayerId) continue;
        
        // ROW CONSTRAINT
        if (Math.abs(move.to.row - deploymentRow) > 2) continue;
        
        // SAFETY CONSTRAINT
        if (!isTileSafeFor(state, unitInfo.unit.stats.type, move.to, botPlayerId)) continue;
        
        const currentDist = distance(unitInfo.pos, cp);
        const newDist = distance(move.to, cp);
        
        // If this move gets us to the control point or closer
        if (newDist < currentDist) {
          return move;
        }
      }
      
      // Also check rotates
      const rotates = available.filter((a): a is Extract<Action, { type: 'ROTATE' }> => a.type === 'ROTATE');
      
      for (const rotate of rotates) {
        const unitInfo = findUnitById(state, rotate.unitId);
        if (!unitInfo || unitInfo.unit.ownerId !== botPlayerId) continue;
        
        // ROW CONSTRAINT
        if (Math.abs(rotate.target.row - deploymentRow) > 2) continue;
        
        // SAFETY CONSTRAINT
        if (!isTileSafeFor(state, unitInfo.unit.stats.type, rotate.target, botPlayerId)) continue;
        
        const currentDist = distance(unitInfo.pos, cp);
        const newDist = distance(rotate.target, cp);
        
        if (newDist < currentDist) {
          return rotate;
        }
      }
    }
  }
  
  // 2. Cavalry rotation: prefer rotating cavalry forward for mobility
  const cavalryRotates = available.filter((a): a is Extract<Action, { type: 'ROTATE' }> => {
    if (a.type !== 'ROTATE') return false;
    const unitInfo = findUnitById(state, a.unitId);
    if (!unitInfo || unitInfo.unit.ownerId !== botPlayerId) return false;
    if (unitInfo.unit.stats.type !== 'Cavalry') return false;
    
    // ROW CONSTRAINT
    if (Math.abs(a.target.row - deploymentRow) > 2) return false;
    
    // SAFETY CONSTRAINT
    if (!isTileSafeFor(state, 'Cavalry', a.target, botPlayerId)) return false;
    
    // Prefer moves toward the middle row (row 3)
    const currentDistToMiddle = Math.abs(unitInfo.pos.row - 3);
    const newDistToMiddle = Math.abs(a.target.row - 3);
    return newDistToMiddle < currentDistToMiddle;
  });
  
  if (cavalryRotates.length > 0) {
    return cavalryRotates[0];
  }
  
  // 3. Safe positional improvement: any safe move toward middle
  const allMoves = available.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
  
  for (const move of allMoves) {
    const unitInfo = findUnitById(state, move.unitId);
    if (!unitInfo || unitInfo.unit.ownerId !== botPlayerId) continue;
    
    // ROW CONSTRAINT
    if (Math.abs(move.to.row - deploymentRow) > 2) continue;
    
    // SAFETY CONSTRAINT
    if (!isTileSafeFor(state, unitInfo.unit.stats.type, move.to, botPlayerId)) continue;
    
    // Prefer moves toward the middle row
    const currentDistToMiddle = Math.abs(unitInfo.pos.row - 3);
    const newDistToMiddle = Math.abs(move.to.row - 3);
    
    if (newDistToMiddle < currentDistToMiddle) {
      return move;
    }
  }
  
  return null;
}

/**
 * Priority 5: DEPLOYMENT
 * - Deploy counter unit close to target
 * - Or deploy equal unit close to target
 * - Or deploy any unit
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

export function createCounterV3Bot(): Bot {
  return {
    id: 'counter_v3_bot',
    name: 'Counter(v3)',
    
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      const endTurn = getEndTurnAction(availableActions);
      
      // =====================================================================
      // Priority 1: FREE ATTACKS (highest priority)
      // If we have any unit that can attack a player unit it counters, do it.
      // Otherwise, attack equal units (closest one).
      // =====================================================================
      const freeAttack = tryFreeAttacks(availableActions, gameState, playerId);
      if (freeAttack) return freeAttack;
      
      // =====================================================================
      // Priority 2: CONTROL-POINT OVERRIDE
      // Capture empty control points or deny opponent control points
      // =====================================================================
      const controlPointAction = tryControlPointOverride(availableActions, gameState, playerId);
      if (controlPointAction) return controlPointAction;
      
      // Get last action for reactive behavior
      const lastAction = gameState.lastAction;
      const targetUnit = lastAction ? resolveOpponentUnit(lastAction, gameState, playerId) : null;
      
      // =====================================================================
      // Priority 3: THREAT-BASED REACTION
      // Only react if threat score >= THREAT_THRESHOLD
      // =====================================================================
      if (targetUnit && lastAction && (lastAction.type === 'DEPLOY' || lastAction.type === 'MOVE')) {
        const reactAction = tryThreatReaction(availableActions, gameState, playerId, targetUnit);
        if (reactAction) return reactAction;
      }
      
      // Also consider ATTACK and ROTATE for threat reaction
      if (targetUnit && lastAction && (lastAction.type === 'ATTACK' || lastAction.type === 'ROTATE')) {
        const reactAction = tryThreatReaction(availableActions, gameState, playerId, targetUnit);
        if (reactAction) return reactAction;
      }
      
      // =====================================================================
      // Priority 4: PROACTIVE PLAY
      // Control point pressure, cavalry rotation, safe positional improvement
      // =====================================================================
      const proactiveAction = tryProactivePlay(availableActions, gameState, playerId);
      if (proactiveAction) return proactiveAction;
      
      // =====================================================================
      // Priority 5: DEPLOYMENT (last resort)
      // =====================================================================
      const deployAction = tryDeploy(availableActions, targetUnit);
      if (deployAction) return deployAction;
      
      // =====================================================================
      // Priority 6: END TURN
      // =====================================================================
      return endTurn;
    }
  };
}
