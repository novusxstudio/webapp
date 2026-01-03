/**
 * LookaheadBot - A deterministic policy bot that uses one-step lookahead
 * to choose actions by scoring resulting game states.
 * 
 * Core Idea:
 * 1. Enumerate all legal actions
 * 2. Simulate each action to produce a next game state
 * 3. Score each resulting state using the scoring function
 * 4. Choose the action with the highest score
 * 
 * NO minimax, NO recursion, NO randomness.
 */

import type { Bot, BotContext } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Position, Unit, UnitStats } from '../logic/GameState';
import { applyAction } from '../engine/actions';
import { CONTROL_POINTS, canAttack, controlsAllPoints } from '../logic/rules';

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

/** Small weight factor for distance-based scoring to prevent domination */
const DISTANCE_WEIGHT = 0.1;

/** Center control point position */
const CENTER_CONTROL_POINT: Position = { row: 3, col: 3 };

/** Side control point positions */
const SIDE_CONTROL_POINTS: Position[] = [
  { row: 3, col: 1 },
  { row: 3, col: 5 },
];

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
 * Get units that this unit type counters
 */
function getCounteredUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.counters ?? [];
}

/**
 * Get unit types that are equal to the given unit type
 */
function getEqualUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.equals ?? [];
}

/**
 * Get unit types that counter the given unit type
 */
function getCounterUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.counteredBy ?? [];
}

/**
 * Calculate Manhattan distance between two positions
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
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
 * Get friendly units for the bot
 */
function getFriendlyUnits(state: GameState, botPlayerId: number): Array<{ unit: Unit; pos: Position }> {
  return getAllUnits(state, botPlayerId);
}

/**
 * Get enemy units (units not belonging to the bot)
 */
function getEnemyUnits(state: GameState, botPlayerId: number): Array<{ unit: Unit; pos: Position }> {
  return getAllUnits(state, botPlayerId === 0 ? 1 : 0);
}

/**
 * Get all control points
 */
function getControlPoints(): Position[] {
  return CONTROL_POINTS;
}

/**
 * Check if a position is the center control point
 */
function isCenterControlPoint(pos: Position): boolean {
  return pos.row === CENTER_CONTROL_POINT.row && pos.col === CENTER_CONTROL_POINT.col;
}

/**
 * Check if a position is a side control point
 */
function isSideControlPoint(pos: Position): boolean {
  return SIDE_CONTROL_POINTS.some(cp => cp.row === pos.row && cp.col === pos.col);
}

/**
 * Check if a position is any control point
 */
function isControlPoint(pos: Position): boolean {
  return CONTROL_POINTS.some(cp => cp.row === pos.row && cp.col === pos.col);
}

/**
 * Check if attacker can attack target (wrapper around rules.canAttack)
 */
function canAttackUnit(
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
 * Simulate an action and return the resulting game state
 * Does NOT mutate the original state
 */
function simulateAction(state: GameState, action: Action): GameState | null {
  try {
    // applyAction returns a new state, doesn't mutate original
    return applyAction(state, action);
  } catch {
    // Invalid action
    return null;
  }
}

// ============================================================================
// Scoring Function
// ============================================================================

/**
 * Score a game state from the perspective of the given player.
 * Higher score = better position for the player.
 */
function scoreGameState(state: GameState, playerId: number): number {
  let score = 0;
  
  const friendlyUnits = getFriendlyUnits(state, playerId);
  const enemyUnits = getEnemyUnits(state, playerId);
  const controlPoints = getControlPoints();
  
  // =========================================================================
  // 1️⃣ Friendly Units on Board: +1 per friendly unit
  // =========================================================================
  score += friendlyUnits.length;
  
  // =========================================================================
  // 2️⃣ Control Point Scoring
  // =========================================================================
  let friendlyControlPointCount = 0;
  
  for (const friendly of friendlyUnits) {
    // +3 for center control point
    if (isCenterControlPoint(friendly.pos)) {
      score += 3;
      friendlyControlPointCount++;
    }
    // +2 for side control points
    else if (isSideControlPoint(friendly.pos)) {
      score += 2;
      friendlyControlPointCount++;
    }
  }
  
  // +10000 if all three control points are controlled
  if (friendlyControlPointCount === 3 || controlsAllPoints(state, playerId)) {
    score += 10000;
  }
  
  // =========================================================================
  // 3️⃣ Friendly Offensive Pressure
  // For each friendly unit that can attack enemies:
  // +2 for each enemy it counters and can attack
  // +1 for each enemy it equals and can attack
  // =========================================================================
  for (const friendly of friendlyUnits) {
    const friendlyType = friendly.unit.stats.type;
    const countersTypes = getCounteredUnits(friendlyType);
    const equalsTypes = getEqualUnits(friendlyType);
    
    for (const enemy of enemyUnits) {
      // Check if friendly can attack enemy
      if (canAttackUnit(state, friendly.unit.id, enemy.pos)) {
        const enemyType = enemy.unit.stats.type;
        
        if (countersTypes.includes(enemyType)) {
          score += 2; // Counters enemy
        } else if (equalsTypes.includes(enemyType)) {
          score += 1; // Equal to enemy
        }
      }
    }
  }
  
  // =========================================================================
  // 4️⃣ Friendly Defensive Risk
  // For each friendly unit in attack range of enemies:
  // -2 for each enemy that counters it and can attack
  // -1 for each enemy that equals it and can attack
  // =========================================================================
  for (const friendly of friendlyUnits) {
    const friendlyType = friendly.unit.stats.type;
    const counteredByTypes = getCounterUnits(friendlyType);
    const equalsTypes = getEqualUnits(friendlyType);
    
    for (const enemy of enemyUnits) {
      // Check if enemy can attack friendly
      // We need to check from enemy's perspective
      if (canAttackUnit(state, enemy.unit.id, friendly.pos)) {
        const enemyType = enemy.unit.stats.type;
        
        if (counteredByTypes.includes(enemyType)) {
          score -= 2; // Enemy counters us
        } else if (equalsTypes.includes(enemyType)) {
          score -= 1; // Enemy equals us
        }
      }
    }
  }
  
  // =========================================================================
  // 5️⃣ Distance-Based Pressure (Small Weights)
  // Positive score for being close to enemies we counter
  // Negative score for being close to enemies that counter us
  // =========================================================================
  for (const friendly of friendlyUnits) {
    const friendlyType = friendly.unit.stats.type;
    const countersTypes = getCounteredUnits(friendlyType);
    const counteredByTypes = getCounterUnits(friendlyType);
    
    for (const enemy of enemyUnits) {
      const dist = manhattanDistance(friendly.pos, enemy.pos);
      if (dist === 0) continue; // Same position (shouldn't happen)
      
      const enemyType = enemy.unit.stats.type;
      
      // Small positive score for being close to enemies we counter
      if (countersTypes.includes(enemyType)) {
        score += DISTANCE_WEIGHT / dist;
      }
      
      // Small negative score for being close to enemies that counter us
      if (counteredByTypes.includes(enemyType)) {
        score -= DISTANCE_WEIGHT / dist;
      }
    }
  }
  
  // =========================================================================
  // 6️⃣ Distance to Control Points
  // Small positive score for being close to control points
  // =========================================================================
  for (const friendly of friendlyUnits) {
    // Find nearest control point
    let minDist = Infinity;
    for (const cp of controlPoints) {
      const dist = manhattanDistance(friendly.pos, cp);
      if (dist < minDist) {
        minDist = dist;
      }
    }
    
    if (minDist > 0 && minDist < Infinity) {
      score += DISTANCE_WEIGHT / minDist;
    }
  }
  
  return score;
}

// ============================================================================
// Action Selection
// ============================================================================

/**
 * Get action priority for tie-breaking
 * Lower number = higher priority
 */
function getActionPriority(action: Action, state: GameState, playerId: number): number {
  // Capture or deny control point = highest priority
  if (action.type === 'MOVE') {
    if (isControlPoint(action.to)) {
      return 0; // Capture control point
    }
  }
  if (action.type === 'ROTATE') {
    if (isControlPoint(action.target)) {
      return 0; // Capture control point
    }
  }
  if (action.type === 'ATTACK') {
    // Check if target is on a control point
    const targetInfo = findUnitById(state, action.targetId);
    if (targetInfo && isControlPoint(targetInfo.pos)) {
      return 0; // Deny control point
    }
  }
  
  // Other priorities
  switch (action.type) {
    case 'ATTACK': return 1;
    case 'MOVE': return 2;
    case 'ROTATE': return 3;
    case 'DEPLOY': return 4;
    case 'END_TURN': return 5;
  }
}

/**
 * Choose the best action using one-step lookahead
 */
function chooseAction(
  state: GameState,
  availableActions: readonly Action[],
  playerId: number
): Action {
  const endTurn = getEndTurnAction(availableActions);
  
  // =========================================================================
  // Free Deployment Rule
  // If free deployments remain, only consider DEPLOY actions
  // =========================================================================
  if (state.freeDeploymentsRemaining > 0) {
    const deployActions = availableActions.filter(a => a.type === 'DEPLOY');
    
    if (deployActions.length > 0) {
      let bestAction: Action = deployActions[0];
      let bestScore = -Infinity;
      let bestPriority = Infinity;
      
      for (const action of deployActions) {
        const nextState = simulateAction(state, action);
        if (!nextState) continue;
        
        const score = scoreGameState(nextState, playerId);
        const priority = getActionPriority(action, state, playerId);
        
        // Higher score wins, or same score with better priority
        if (score > bestScore || (score === bestScore && priority < bestPriority)) {
          bestScore = score;
          bestPriority = priority;
          bestAction = action;
        }
      }
      
      return bestAction;
    }
  }
  
  // =========================================================================
  // Normal Action Selection
  // Enumerate all actions, simulate, score, choose best
  // =========================================================================
  let bestAction: Action = endTurn;
  let bestScore = -Infinity;
  let bestPriority = Infinity;
  
  for (const action of availableActions) {
    const nextState = simulateAction(state, action);
    if (!nextState) continue;
    
    const score = scoreGameState(nextState, playerId);
    const priority = getActionPriority(action, state, playerId);
    
    // Higher score wins, or same score with better priority
    if (score > bestScore || (score === bestScore && priority < bestPriority)) {
      bestScore = score;
      bestPriority = priority;
      bestAction = action;
    }
  }
  
  return bestAction;
}

// ============================================================================
// Bot Factory
// ============================================================================

export function createLookaheadBot(): Bot {
  return {
    id: 'lookahead_bot',
    name: 'Lookahead',
    
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      return chooseAction(gameState, availableActions, playerId);
    }
  };
}
