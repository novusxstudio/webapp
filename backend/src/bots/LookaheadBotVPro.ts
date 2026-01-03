// ===================== ACTION SELECTION HELPERS =====================
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
function scoreGameState(state: GameState, playerId: number): number {
  return scoreSide(state, playerId);
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
  return 99;
}
/**
 * LookaheadBotVPro - Game State Evaluator (Zero-Sum)
 *
 * - Each friendly unit: score = material + counter + countered + control point
 * - Each enemy unit: score = -(same calculation as above)
 * - Zero-sum: totalScore = myScore - enemyScore
 * - All scoring is board-state only, one-step lookahead
 * - All constraints from prompt are enforced
 */

import type { Bot, BotContext } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Position, Unit, UnitStats } from '../logic/GameState';
import { applyAction } from '../engine/actions';
import { CONTROL_POINTS } from '../logic/rules';

// ===================== CONSTANTS =====================
const MATERIAL_SCORE = 10.0; // abs(Material) > abs(Countered)
const COUNTER_WEIGHT = 100.0;
const DECAY_CONSTANT = 1.0;
const CONTROL_POINT_WEIGHT = 100.0 // < max Countered Score (distance=1)
const CONTROL_PT_DECAY_CONSTANT = 1.0;

// ===================== UTILS =====================
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
function isControlPoint(pos: Position): boolean {
  return CONTROL_POINTS.some(cp => cp.row === pos.row && cp.col === pos.col);
}
function getCounteredUnits(type: string): string[] {
  return COUNTER_TABLE[type]?.counters ?? [];
}
function getCounterUnits(type: string): string[] {
  return COUNTER_TABLE[type]?.counteredBy ?? [];
}

// ===================== COUNTER TABLE =====================
const COUNTER_TABLE: Record<string, { counters: string[]; counteredBy: string[] }> = {
  Axeman:     { counters: ["Shieldman", "Cavalry", "Spearman"], counteredBy: ["Swordsman", "Archer"] },
  Swordsman:  { counters: ["Axeman", "Cavalry", "Spearman"], counteredBy: ["Archer"] },
  Archer:     { counters: ["Axeman", "Swordsman", "Cavalry"], counteredBy: ["Shieldman", "Spearman"] },
  Shieldman:  { counters: ["Archer"], counteredBy: ["Axeman", "Cavalry", "Spearman"] },
  Cavalry:    { counters: ["Shieldman"], counteredBy: ["Axeman", "Swordsman", "Archer", "Spearman"] },
  Spearman:   { counters: ["Archer", "Shieldman", "Cavalry"], counteredBy: ["Axeman", "Swordsman"] },
};

// ===================== UNIT SCORE CALCULATION =====================
function calibrateCombatDistance(unit: Unit, enemy: Unit, d: number, isCountered: boolean): number {
  // Archer calibration
  if (enemy.stats.type === "Archer") return Math.max(1, d - 1);
  // Cavalry/Spearman calibration
  if (isCountered && unit.stats.type === "Cavalry" && enemy.stats.type === "Spearman") return Math.max(1, d - 1);
  if (!isCountered && unit.stats.type === "Spearman" && enemy.stats.type === "Cavalry") return Math.max(1, d - 1);
  return d;
}

function getClosestEnemy(unit: Unit, pos: Position, state: GameState, filterFn: (enemy: Unit) => boolean, calibrate: (unit: Unit, enemy: Unit, d: number) => number): { enemy: Unit, dist: number } | null {
  let minDist = Infinity;
  let closest: Unit | null = null;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const enemy = state.grid[r][c].unit;
      if (enemy && enemy.ownerId !== unit.ownerId && filterFn(enemy)) {
        let d = manhattanDistance(pos, { row: r + 1, col: c + 1 });
        d = calibrate(unit, enemy, d);
        if (d > 0 && d <= 4 && d < minDist) {
          minDist = d;
          closest = enemy;
        }
      }
    }
  }
  return closest ? { enemy: closest, dist: minDist } : null;
}

function unitScore(unit: Unit, pos: Position, state: GameState): number {
  let score = MATERIAL_SCORE;

  // --- Countered Score (Negative) ---
  const countered = getClosestEnemy(
    unit,
    pos,
    state,
    (enemy) => getCounterUnits(unit.stats.type).includes(enemy.stats.type),
    (u, e, d) => calibrateCombatDistance(u, e, d, true)
  );
  if (countered) {
    const contrib = COUNTER_WEIGHT * Math.exp(-DECAY_CONSTANT * (countered.dist - 1));
    score -= MATERIAL_SCORE * (contrib / (contrib + MATERIAL_SCORE));
  }

  // --- Counter Score (Positive) ---
  const counters = getClosestEnemy(
    unit,
    pos,
    state,
    (enemy) => getCounteredUnits(unit.stats.type).includes(enemy.stats.type),
    (u, e, d) => calibrateCombatDistance(u, e, d, false)
  );
  if (counters) {
    const contrib = COUNTER_WEIGHT * Math.exp(-DECAY_CONSTANT * (counters.dist - 1));
    score += MATERIAL_SCORE * (contrib / (contrib + MATERIAL_SCORE));
  }

  // --- Control Point Score (Positive, new rules) ---
  if (isControlPoint(pos)) {
    score += CONTROL_POINT_WEIGHT;
  } else {
    let minCPDist = Infinity;
    for (const cp of CONTROL_POINTS) {
      let d = manhattanDistance(pos, cp);
      if (unit.stats.type === "Cavalry") d = Math.max(1, d - 1);
      if (d > 0 && d <= 2 && d < minCPDist) minCPDist = d;
    }
    if (minCPDist !== Infinity && minCPDist > 0 && minCPDist <= 2) {
      score += CONTROL_POINT_WEIGHT * Math.exp(-CONTROL_PT_DECAY_CONSTANT * (minCPDist - 1));
    }
  }
  return score;
}

// ===================== GAME STATE EVALUATOR =====================
function scoreSide(state: GameState, side: number): number {
  let score = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.ownerId === side) {
        score += unitScore(u, { row: r + 1, col: c + 1 }, state);
      } else if (u && u.ownerId !== side) {
        score -= unitScore(u, { row: r + 1, col: c + 1 }, state);
      }
    }
  }
  return score;
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

// ===================== BOT FACTORY =====================
export function createLookaheadBotVPro(): Bot {
  return {
    id: 'lookahead_bot_vpro',
    name: 'Lookahead(vPro)',
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      return chooseAction(gameState, availableActions, playerId);
    }
  };
}
