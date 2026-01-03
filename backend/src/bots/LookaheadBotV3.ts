/**
 * LookaheadBotV3 - Extends V2 with stronger attack proximity scoring.
 * 
 * Key Change from V2:
 * - Friendly units receive a LARGER positive score when close to enemy units
 *   they can attack and defeat, but are not yet in attack range.
 * - This makes the bot more aggressive, seeking positions to attack vulnerable enemies.
 * 
 * All other scoring remains identical to V2.
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

/** Weight for distance to control points (small) */
const CONTROL_POINT_DISTANCE_WEIGHT = 0.1;

/** Weight for distance to enemies we counter but can't yet attack (small) */
const COUNTER_DISTANCE_WEIGHT = 0.1;

/** Weight for distance to enemies we can attack and defeat (LARGER) */
const ATTACK_PROXIMITY_WEIGHT = 0.3;

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
 * Get units that this unit type counters (can defeat)
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
 * Check if attacker type can defeat defender type
 */
function canDefeat(attackerType: UnitType, defenderType: UnitType): boolean {
  const counters = getCounteredUnits(attackerType);
  return counters.includes(defenderType);
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
function getUnitsForPlayer(state: GameState, ownerId: number): Array<{ unit: Unit; pos: Position }> {
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
    return applyAction(state, action);
  } catch {
    return null;
  }
}

// ============================================================================
// Side Scoring Function (V3 - Enhanced Attack Proximity)
// ============================================================================

/**
 * Score the game state from one side's perspective.
 * Returns ONLY positive values.
 * 
 * V3 Change: Stronger proximity bonus for units close to enemies they can defeat.
 * 
 * @param state - The game state to score
 * @param sidePlayerId - The player ID whose perspective we're scoring from
 * @param opposingPlayerId - The opposing player ID
 */
function scoreSide(
  state: GameState,
  sidePlayerId: number,
  opposingPlayerId: number
): number {
  let score = 0;
  
  const sideUnits = getUnitsForPlayer(state, sidePlayerId);
  const opposingUnits = getUnitsForPlayer(state, opposingPlayerId);
  const controlPoints = getControlPoints();
  
  // =========================================================================
  // 1️⃣ Units on Board: +1 per unit belonging to side
  // =========================================================================
  score += sideUnits.length;
  
  // =========================================================================
  // 2️⃣ Control Points
  // +3 for center control point
  // +2 for side control points
  // +10000 if all three controlled
  // =========================================================================
  let controlPointCount = 0;
  
  for (const sideUnit of sideUnits) {
    if (isCenterControlPoint(sideUnit.pos)) {
      score += 3;
      controlPointCount++;
    } else if (isSideControlPoint(sideUnit.pos)) {
      score += 2;
      controlPointCount++;
    }
  }
  
  if (controlPointCount === 3 || controlsAllPoints(state, sidePlayerId)) {
    score += 10000;
  }
  
  // =========================================================================
  // 3️⃣ Offensive Pressure (UNCHANGED from V2)
  // For each unit of side that can attack opposing units:
  // +2 for each opposing unit it counters and can attack
  // +1 for each opposing unit it equals and can attack
  // =========================================================================
  for (const sideUnit of sideUnits) {
    const sideType = sideUnit.unit.stats.type;
    const countersTypes = getCounteredUnits(sideType);
    const equalsTypes = getEqualUnits(sideType);
    
    for (const opposingUnit of opposingUnits) {
      if (canAttackUnit(state, sideUnit.unit.id, opposingUnit.pos)) {
        const opposingType = opposingUnit.unit.stats.type;
        
        if (countersTypes.includes(opposingType)) {
          score += 2; // Counters opposing unit
        } else if (equalsTypes.includes(opposingType)) {
          score += 1; // Equal to opposing unit
        }
      }
    }
  }
  
  // =========================================================================
  // 4️⃣ Defensive Risk (UNCHANGED from V2)
  // For each unit of side in attack range of opposing units:
  // +2 for each opposing unit that counters it and can attack
  // +1 for each opposing unit that equals it and can attack
  // =========================================================================
  for (const sideUnit of sideUnits) {
    const sideType = sideUnit.unit.stats.type;
    const counteredByTypes = getCounterUnits(sideType);
    const equalsTypes = getEqualUnits(sideType);
    
    for (const opposingUnit of opposingUnits) {
      if (canAttackUnit(state, opposingUnit.unit.id, sideUnit.pos)) {
        const opposingType = opposingUnit.unit.stats.type;
        
        if (counteredByTypes.includes(opposingType)) {
          score += 2; // Opposing unit counters us (risk)
        } else if (equalsTypes.includes(opposingType)) {
          score += 1; // Opposing unit equals us (risk)
        }
      }
    }
  }
  
  // =========================================================================
  // 5️⃣ Distance-Based Scoring (V3 ENHANCED)
  // 
  // For each unit of side:
  //   - If enemy is in attack range: handled by section 3 above (unchanged)
  //   - Else if we can defeat that enemy: ADD LARGER proximity bonus (NEW)
  //   - Distance to control points: small bonus (unchanged)
  // =========================================================================
  for (const sideUnit of sideUnits) {
    const sideType = sideUnit.unit.stats.type;
    
    for (const opposingUnit of opposingUnits) {
      const dist = manhattanDistance(sideUnit.pos, opposingUnit.pos);
      if (dist === 0) continue;
      
      const opposingType = opposingUnit.unit.stats.type;
      const inAttackRange = canAttackUnit(state, sideUnit.unit.id, opposingUnit.pos);
      
      // If already in attack range, scoring is handled by offensive pressure (section 3)
      // Only add proximity bonus for units NOT yet in attack range
      if (!inAttackRange) {
        // V3 CHANGE: Larger weight for enemies we can defeat
        if (canDefeat(sideType, opposingType)) {
          score += ATTACK_PROXIMITY_WEIGHT / dist;
        }
        // Smaller weight for enemies we counter but in general (fallback for non-defeat cases)
        // Note: canDefeat uses counters, so this is the same as before for counter matchups
      }
    }
    
    // Distance to control points (unchanged, small weight)
    for (const cp of controlPoints) {
      const dist = manhattanDistance(sideUnit.pos, cp);
      if (dist > 0) {
        score += CONTROL_POINT_DISTANCE_WEIGHT / dist;
      }
    }
  }
  
  return score;
}

// ============================================================================
// Game State Scoring Function (UNCHANGED from V2)
// ============================================================================

/**
 * Score a game state from the perspective of the given player.
 * Uses zero-sum symmetric evaluation: myScore - enemyScore
 * 
 * @param state - The game state to score
 * @param playerId - The player whose perspective we're scoring from (0 or 1)
 */
function scoreGameState(state: GameState, playerId: number): number {
  const enemyId = playerId === 0 ? 1 : 0;
  
  // =========================================================================
  // WIN CONDITIONS (ABSOLUTE PRIORITY)
  // Check before any other scoring
  // =========================================================================
  if (controlsAllPoints(state, playerId)) {
    return 10000;
  }
  if (controlsAllPoints(state, enemyId)) {
    return -10000;
  }
  
  // =========================================================================
  // SYMMETRIC ZERO-SUM SCORING
  // totalScore = myScore − enemyScore
  // =========================================================================
  const myScore = scoreSide(state, playerId, enemyId);
  const enemyScore = scoreSide(state, enemyId, playerId);
  
  return myScore - enemyScore;
}

// ============================================================================
// Action Selection (UNCHANGED from V2)
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

export function createLookaheadBotV3(): Bot {
  return {
    id: 'lookahead_bot_v3',
    name: 'Lookahead(v3)',
    
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      return chooseAction(gameState, availableActions, playerId);
    }
  };
}
