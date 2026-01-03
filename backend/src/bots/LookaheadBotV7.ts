/**
 * LookaheadBotV7 - Combines multiplicative distance scaling with dominant-threat aggregation.
 * 
 * Key Features:
 * 1. Multiplicative exponential distance scaling (from V4):
 *    threat(E) = WEIGHT * exp(-ALPHA * distance) + RANGE_BIAS * attackRange
 * 
 * 2. Dominant nearest-threat aggregation (new in V7):
 *    - Enemy threats are NOT summed equally
 *    - Strongest threat dominates, others contribute diminishing pressure:
 *      totalThreat = PRIMARY_WEIGHT * strongest + SECONDARY_WEIGHT * remaining
 * 
 * Guaranteed Behavior:
 * - A single close counter threat outweighs multiple farther counter threats
 * - threat(dist=2) > threat(dist=3) + threat(dist=3)
 * - Distance still meaningfully affects urgency
 * - Additional threats contribute diminishing pressure (not linear stacking)
 * 
 * All other scoring (opportunities, equals, control points) remains identical to V6.
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
// Distance Scoring Constants (Easy to Tune)
// ============================================================================

/**
 * Weight for proximity to enemies we can attack and defeat (HIGHEST)
 */
const ATTACK_PROX_WEIGHT = 0.5;

/**
 * Weight for proximity to enemies we counter (MEDIUM)
 * Used for opportunity scoring (unchanged from V6)
 */
const COUNTER_DIST_WEIGHT = 0.2;

/**
 * Weight for proximity to control points (LOWEST)
 */
const CONTROL_POINT_WEIGHT = 0.15;

/**
 * Exponential decay rate (steepness)
 * Lower = distance scores stay higher at range, counters matter more
 * Higher = distance scores decay faster, only very close units matter
 */
const DIST_ALPHA = 0.4;

/**
 * Additive range bias (from V6)
 * rangeBias = RANGE_BIAS * attackRange
 */
const RANGE_BIAS = 0.05;

/**
 * V7: Weight applied to the strongest (nearest) threat
 * PRIMARY_THREAT_WEIGHT >> SECONDARY_THREAT_WEIGHT
 */
const PRIMARY_THREAT_WEIGHT = 1.5;

/**
 * V7: Weight applied to all other threats after the strongest
 * Must be significantly smaller than PRIMARY_THREAT_WEIGHT
 */
const SECONDARY_THREAT_WEIGHT = 0.15;

// ============================================================================
// Other Constants
// ============================================================================

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
 * Check if two unit types are equal matchups
 */
function isEqualMatchup(typeA: UnitType, typeB: UnitType): boolean {
  const equalsA = getEqualUnits(typeA);
  return equalsA.includes(typeB);
}

/**
 * Calculate Manhattan distance between two positions
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/**
 * Exponential distance scoring function
 * Returns: WEIGHT * exp(-ALPHA * distance)
 */
function expDistanceScore(weight: number, distance: number): number {
  return weight * Math.exp(-DIST_ALPHA * distance);
}

/**
 * Calculate additive range bias for an enemy unit
 * rangeBias = RANGE_BIAS * attackRange
 */
function getRangeBias(attackRange: number): number {
  return RANGE_BIAS * attackRange;
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
// V7: Dominant Threat Aggregation
// ============================================================================

/**
 * V7: Calculate individual threat value from an enemy counter-unit
 * threat(E) = THREAT_WEIGHT * exp(-ALPHA * distance) + RANGE_BIAS * attackRange
 */
function calculateThreatValue(distance: number, attackRange: number): number {
  const baseThreat = expDistanceScore(ATTACK_PROX_WEIGHT, distance);
  const rangeBias = getRangeBias(attackRange);
  return baseThreat + rangeBias;
}

/**
 * V7: Aggregate multiple threat values using dominant nearest-threat formula
 * 
 * totalThreat = PRIMARY_WEIGHT * strongest + SECONDARY_WEIGHT * remaining
 * 
 * This ensures: threat(dist=2) > threat(dist=3) + threat(dist=3)
 */
function aggregateThreats(threats: number[]): number {
  if (threats.length === 0) return 0;
  if (threats.length === 1) return PRIMARY_THREAT_WEIGHT * threats[0];
  
  // Find the strongest threat
  const strongestThreat = Math.max(...threats);
  
  // Sum all threats and subtract strongest to get remaining
  const totalSum = threats.reduce((sum, t) => sum + t, 0);
  const remainingThreats = totalSum - strongestThreat;
  
  // Apply dominant aggregation
  return PRIMARY_THREAT_WEIGHT * strongestThreat + SECONDARY_THREAT_WEIGHT * remainingThreats;
}

// ============================================================================
// Side Scoring Function (V7 - Dominant Nearest Threat)
// ============================================================================

/**
 * Score the game state from one side's perspective.
 * 
 * V7 Change: Threat aggregation uses dominant nearest-threat formula
 * - Collect all threat values from counter-units
 * - Apply: totalThreat = PRIMARY * strongest + SECONDARY * remaining
 * - score -= totalThreat
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
  // 1️⃣ Units on Board: +3 per unit belonging to side (INCREASED)
  // =========================================================================
  score += 3 * sideUnits.length;
  
  // =========================================================================
  // 2️⃣ Control Points (UNCHANGED)
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
  // 3️⃣ Offensive Pressure (UNCHANGED)
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
  // 4️⃣ Defensive Risk (UNCHANGED)
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
  // 5️⃣ Distance-Based Scoring (V7 DOMINANT THREAT AGGREGATION)
  // 
  // For threats (opposing counters side):
  //   - Collect all threat values: threat(E) = base + rangeBias
  //   - Aggregate: totalThreat = PRIMARY * strongest + SECONDARY * remaining
  //   - score -= totalThreat
  // 
  // For opportunities (side counters opposing):
  //   - UNCHANGED from V6: score += base + rangeBias
  // 
  // For equal matchups:
  //   - UNCHANGED from V4/V6: no range bias
  // =========================================================================
  for (const sideUnit of sideUnits) {
    const sideType = sideUnit.unit.stats.type;
    const countersTypes = getCounteredUnits(sideType);
    const counteredByTypes = getCounterUnits(sideType);
    
    // V7: Collect threat values for this friendly unit
    const threatValues: number[] = [];
    
    for (const opposingUnit of opposingUnits) {
      const dist = manhattanDistance(sideUnit.pos, opposingUnit.pos);
      const opposingType = opposingUnit.unit.stats.type;
      const inAttackRange = canAttackUnit(state, sideUnit.unit.id, opposingUnit.pos);
      
      // Skip if already in attack range (handled by offensive pressure in section 3)
      if (inAttackRange) continue;
      
      // 1️⃣ Side counters opposing (POSITIVE, UNCHANGED from V6)
      // Getting close to ranged prey is slightly more valuable
      if (countersTypes.includes(opposingType)) {
        const base = expDistanceScore(ATTACK_PROX_WEIGHT, dist);
        const rangeBias = getRangeBias(opposingUnit.unit.stats.attackRange);
        score += base + rangeBias;
      }
      // 2️⃣ Opposing counters side (V7: COLLECT THREATS)
      // Will aggregate using dominant nearest-threat formula
      else if (counteredByTypes.includes(opposingType)) {
        const threatValue = calculateThreatValue(dist, opposingUnit.unit.stats.attackRange);
        threatValues.push(threatValue);
      }
      // 3️⃣ Equal matchups (NO range bias, unchanged from V4/V6)
      else if (isEqualMatchup(sideType, opposingType)) {
        score += expDistanceScore(COUNTER_DIST_WEIGHT, dist);
      }
    }
    
    // V7: Apply dominant threat aggregation for this friendly unit
    if (threatValues.length > 0) {
      const totalThreat = aggregateThreats(threatValues);
      score -= totalThreat;
    }
    
    // Distance to control points (unchanged, no range bias)
    for (const cp of controlPoints) {
      const dist = manhattanDistance(sideUnit.pos, cp);
      if (dist > 0) {
        score += expDistanceScore(CONTROL_POINT_WEIGHT, dist);
      }
    }
  }
  
  return score;
}

// ============================================================================
// Game State Scoring Function (UNCHANGED from V6)
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
// Action Selection (UNCHANGED from V6)
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

export function createLookaheadBotV7(): Bot {
  return {
    id: 'lookahead_bot_v7',
    name: 'Lookahead(v7)',
    
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      return chooseAction(gameState, availableActions, playerId);
    }
  };
}
