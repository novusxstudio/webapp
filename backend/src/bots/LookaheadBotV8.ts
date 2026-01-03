/**
 * LookaheadBotV8 - Unit-Centric Value Function
 *
 * - One-step lookahead, simulate actions, score resulting states (unchanged)
 * - Game-state score = sum of per-unit scores (my units) - sum (enemy units)
 * - Per-unit scoring follows strict rules (see below)
 *
 * All constants and aggregation rules are chosen to ensure:
 *   - Losing a unit is always worse than losing a control point
 *   - Counter-threats dominate over control point bonuses
 *   - Enemy scoring is a perfect mirror
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
// Scoring Constants (Tuned for Unit-Centric Evaluation)
// ============================================================================

const BASE_UNIT_SCORE = 5.0;
const COUNTER_WEIGHT = 5.0;
const PRIMARY_COUNTER_WEIGHT = 1.0;
const SECONDARY_COUNTER_WEIGHT = 0.1;
const COUNTER_ALPHA = 1.2;
const THREAT_WEIGHT = 5.0;
const PRIMARY_THREAT_WEIGHT = 1.0;
const SECONDARY_THREAT_WEIGHT = 0.1;
const THREAT_ALPHA = 1.2;
const CONTROL_POINT_OCCUPANCY_SCORE = 5.0;
const CONTROL_POINT_DISTANCE_WEIGHT = 2.0;
const CP_ALPHA = 1.2;

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

function getCounteredUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.counters ?? [];
}
function getEqualUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.equals ?? [];
}
function getCounterUnits(unitType: UnitType): UnitType[] {
  return COUNTER_TABLE[unitType]?.counteredBy ?? [];
}
function isEqualMatchup(typeA: UnitType, typeB: UnitType): boolean {
  return getEqualUnits(typeA).includes(typeB);
}
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
/**
 * Effective distance for scoring: for Archers, treat as one tile closer.
 */
function effectiveDistance(unit: Unit, enemy: Unit, pos: Position, enemyPos: Position): number {
  let dist = manhattanDistance(pos, enemyPos);
  if (unit.stats.type === "Archer") {
    dist = Math.max(0, dist - 1);
  }
  return dist;
}
function isControlPoint(pos: Position): boolean {
  return CONTROL_POINTS.some(cp => cp.row === pos.row && cp.col === pos.col);
}

// ============================================================================
// Per-Unit Scoring (Unit-Centric)
// ============================================================================

function scoreUnit(unit: Unit, pos: Position, state: GameState, side: number): number {
  let score = BASE_UNIT_SCORE;
  const myType = unit.stats.type;
  const enemyUnits: Array<{ unit: Unit; pos: Position }> = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.ownerId !== side) {
        enemyUnits.push({ unit: u, pos: { row: r + 1, col: c + 1 } });
      }
    }
  }

  // 2️⃣ Distance to Enemy Units It Counters (POSITIVE, dominant aggregation, hard horizon)
  const counterValues: number[] = [];
  for (const { unit: enemy, pos: enemyPos } of enemyUnits) {
    const enemyType = enemy.stats.type;
    if (getCounteredUnits(myType).includes(enemyType)) {
      let dist = effectiveDistance(unit, enemy, pos, enemyPos);
      let counterValue = 0;
      if (dist <= 4) {
        counterValue = COUNTER_WEIGHT * Math.exp(COUNTER_ALPHA * (4 - dist));
      }
      counterValues.push(counterValue);
    }
  }
  if (counterValues.length > 0) {
    const strongest = Math.max(...counterValues);
    const rest = counterValues.reduce((a, b) => a + b, 0) - strongest;
    score += PRIMARY_COUNTER_WEIGHT * strongest + SECONDARY_COUNTER_WEIGHT * rest;
  }

  // 3️⃣ Distance to Enemy Units It Is Equal To (NO SCORE)
  // (skip)

  // 4️⃣ Distance to Enemy Units That Counter It (NEGATIVE, dominant aggregation, hard horizon)
  const threatValues: number[] = [];
  for (const { unit: enemy, pos: enemyPos } of enemyUnits) {
    const enemyType = enemy.stats.type;
    if (getCounterUnits(myType).includes(enemyType)) {
      let dist = effectiveDistance(unit, enemy, pos, enemyPos);
      let threatValue = 0;
      if (dist <= 4) {
        threatValue = THREAT_WEIGHT * Math.exp(THREAT_ALPHA * (4 - dist));
      }
      threatValues.push(threatValue);
    }
  }
  if (threatValues.length > 0) {
    const strongest = Math.max(...threatValues);
    const rest = threatValues.reduce((a, b) => a + b, 0) - strongest;
    score -= PRIMARY_THREAT_WEIGHT * strongest + SECONDARY_THREAT_WEIGHT * rest;
  }

  // 5️⃣ Control Point Scoring (Discrete + Local)
  for (const cp of CONTROL_POINTS) {
    const d = manhattanDistance(pos, cp);
    if (d === 0) {
      score += CONTROL_POINT_OCCUPANCY_SCORE;
    } else {
      const activationDistance = (myType === "Cavalry") ? 2 : 1;
      if (d <= activationDistance) {
        score += CONTROL_POINT_DISTANCE_WEIGHT * Math.exp(CP_ALPHA * (activationDistance - d));
      }
    }
  }

  return score;
}

// ============================================================================
// Side Scoring (Sum of Per-Unit Scores)
// ============================================================================

function scoreSide(state: GameState, side: number): number {
  let score = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.ownerId === side) {
        score += scoreUnit(u, { row: r + 1, col: c + 1 }, state, side);
      }
    }
  }
  return score;
}

// ============================================================================
// Game State Scoring (Zero-Sum)
// ============================================================================

function scoreGameState(state: GameState, playerId: number): number {
  const enemyId = playerId === 0 ? 1 : 0;
  return scoreSide(state, playerId) - scoreSide(state, enemyId);
}

// ============================================================================
// Action Selection (Unchanged)
// ============================================================================

function getEndTurnAction(available: readonly Action[]): Action {
  return available.find(a => a.type === 'END_TURN') ?? available[0];
}
function simulateAction(state: GameState, action: Action): GameState | null {
  try {
    return applyAction(state, action);
  } catch {
    return null;
  }
}
function getActionPriority(action: Action, state: GameState, playerId: number): number {
  if (action.type === 'MOVE') {
    if (isControlPoint(action.to)) return 0;
  }
  if (action.type === 'ROTATE') {
    if (isControlPoint(action.target)) return 0;
  }
  if (action.type === 'ATTACK') {
    const targetInfo = (() => {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const u = state.grid[r][c].unit;
        if (u && u.id === action.targetId) return { pos: { row: r + 1, col: c + 1 } };
      }
      return null;
    })();
    if (targetInfo && isControlPoint(targetInfo.pos)) return 0;
  }
  switch (action.type) {
    case 'ATTACK': return 1;
    case 'MOVE': return 2;
    case 'ROTATE': return 3;
    case 'DEPLOY': return 4;
    case 'END_TURN': return 5;
  }
}
function chooseAction(state: GameState, availableActions: readonly Action[], playerId: number): Action {
  const endTurn = getEndTurnAction(availableActions);
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

export function createLookaheadBotV8(): Bot {
  return {
    id: 'lookahead_bot_v8',
    name: 'Lookahead(v8)',
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      return chooseAction(gameState, availableActions, playerId);
    }
  };
}
