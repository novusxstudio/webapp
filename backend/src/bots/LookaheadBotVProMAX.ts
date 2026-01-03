import type { Bot, BotContext } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Position, Unit } from '../logic/GameState';
import { applyAction, getAvailableActions } from '../engine/actions';
import { CONTROL_POINTS } from '../logic/rules';

const MATERIAL_SCORE = 10.0;
const COUNTER_WEIGHT = 100.0;
const DECAY_CONSTANT = 3.0;
const CONTROL_WEIGHT = 30.0;
const CONTROL_DECAY_CONSTANT = 3.0;
const CONTROL_POINT_ATTACK_BONUS = 500.0; // Large bonus for attacking units on control points

const COUNTER_TABLE: Record<string, { counters: string[]; counteredBy: string[] }> = {
  Axeman:     { counters: ["Shieldman", "Cavalry", "Spearman"], counteredBy: ["Swordsman", "Archer"] },
  Swordsman:  { counters: ["Axeman", "Cavalry", "Spearman"], counteredBy: ["Archer"] },
  Archer:     { counters: ["Axeman", "Swordsman", "Cavalry"], counteredBy: ["Shieldman", "Spearman"] },
  Shieldman:  { counters: ["Archer"], counteredBy: ["Axeman", "Cavalry", "Spearman"] },
  Cavalry:    { counters: ["Shieldman"], counteredBy: ["Axeman", "Swordsman", "Spearman", "Archer"] },
  Spearman:   { counters: ["Archer", "Shieldman", "Cavalry"], counteredBy: ["Axeman", "Swordsman"] },
};

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

/**
 * Calibrate distance for countered score calculation
 * - If enemy Y is archer, subtract 1 from distance
 * - If unit X is cavalry and enemy Y is spearman, set distance to max(1, distance - 1)
 */
function calibrateCounteredDistance(unit: Unit, enemy: Unit, d: number): number {
  if (enemy.stats.type === "Archer") {
    return Math.max(1, d - 1);
  }
  if (unit.stats.type === "Cavalry" && enemy.stats.type === "Spearman") {
    return Math.max(1, d - 1);
  }
  return d;
}

/**
 * Calibrate distance for counter score calculation
 * - If unit X is archer, subtract 1 from distance
 * - If unit X is spearman and enemy Y is cavalry, set distance to max(1, distance - 1)
 */
function calibrateCounterDistance(unit: Unit, enemy: Unit, d: number): number {
  if (unit.stats.type === "Archer") {
    return Math.max(1, d - 1);
  }
  if (unit.stats.type === "Spearman" && enemy.stats.type === "Cavalry") {
    return Math.max(1, d - 1);
  }
  return d;
}

/**
 * Calibrate distance for control point calculation
 * - If unit X is cavalry, set distance to max(1, distance - 1)
 */
function calibrateControlPointDistance(unit: Unit, d: number): number {
  if (unit.stats.type === "Cavalry") {
    return Math.max(1, d - 1);
  }
  return d;
}

function getClosestEnemy(
  unit: Unit,
  pos: Position,
  state: GameState,
  filterFn: (enemy: Unit) => boolean,
  calibrateFn: (unit: Unit, enemy: Unit, d: number) => number
): { enemy: Unit, dist: number } | null {
  let minDist = Infinity;
  let closest: Unit | null = null;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const enemy = state.grid[r][c].unit;
      if (enemy && enemy.ownerId !== unit.ownerId && filterFn(enemy)) {
        let d = manhattanDistance(pos, { row: r + 1, col: c + 1 });
        d = calibrateFn(unit, enemy, d);
        if (d > 0 && d <= 4 && d < minDist) {
          minDist = d;
          closest = enemy;
        }
      }
    }
  }
  return closest ? { enemy: closest, dist: minDist } : null;
}

/**
 * Calculate the control point score for a unit
 * Returns the multiplier to apply to the unit's score
 */
function getControlPointScore(unit: Unit, pos: Position, state: GameState): number {
  // If unit is on a control point, return CONTROL_WEIGHT
  if (isControlPoint(pos)) {
    return CONTROL_WEIGHT;
  }

  // Find closest UNOCCUPIED control point within 2 Manhattan distance
  let minCPDist = Infinity;
  for (const cp of CONTROL_POINTS) {
    // Check if control point is unoccupied
    const cpUnit = state.grid[cp.row - 1][cp.col - 1].unit;
    if (cpUnit) continue; // Skip occupied control points

    let d = manhattanDistance(pos, cp);
    d = calibrateControlPointDistance(unit, d);
    if (d > 0 && d <= 2 && d < minCPDist) {
      minCPDist = d;
    }
  }

  // If no unoccupied control point found within range, return 1
  if (minCPDist === Infinity || minCPDist <= 0 || minCPDist > 2) {
    return 1;
  }

  // Return CONTROL_WEIGHT * exp(-CONTROL_DECAY_CONSTANT * D)
  return CONTROL_WEIGHT * Math.exp(-CONTROL_DECAY_CONSTANT * minCPDist);
}

/**
 * Calculate the score for a single unit X
 */
function unitScore(unit: Unit, pos: Position, state: GameState): number {
  // --- Material Score (positive) ---
  let materialScore = MATERIAL_SCORE;

  // --- Countered Score (negative) ---
  // Find closest enemy unit that counters this unit
  const countered = getClosestEnemy(
    unit,
    pos,
    state,
    (enemy) => getCounterUnits(unit.stats.type).includes(enemy.stats.type),
    calibrateCounteredDistance
  );

  let counteredScore = 0;
  if (countered) {
    const d = countered.dist;
    const contrib = COUNTER_WEIGHT * Math.exp(-DECAY_CONSTANT * (d - 1));
    counteredScore = -MATERIAL_SCORE * (contrib / (contrib + MATERIAL_SCORE));
  }

  // --- Counter Score (positive) ---
  // Find closest enemy unit that is countered by this unit
  const counter = getClosestEnemy(
    unit,
    pos,
    state,
    (enemy) => getCounteredUnits(unit.stats.type).includes(enemy.stats.type),
    calibrateCounterDistance
  );

  let counterScore = 0;
  if (counter) {
    const d = counter.dist;
    const contrib = COUNTER_WEIGHT * Math.exp(-DECAY_CONSTANT * (d - 1));
    // Get the enemy unit's control point score
    const enemyPos = (() => {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (state.grid[r][c].unit?.id === counter.enemy.id) {
            return { row: r + 1, col: c + 1 };
          }
        }
      }
      return null;
    })();
    if (enemyPos) {
      const enemyCPScore = getControlPointScore(counter.enemy, enemyPos, state);
      counterScore = enemyCPScore * MATERIAL_SCORE * (contrib / (contrib + MATERIAL_SCORE));
    }
  }

  // --- Sum all scores ---
  let totalScore = materialScore + counteredScore + counterScore;

  // --- Enforce constraint: abs(Material Score) > abs(Countered Score) ---
  // This ensures removing an opponent piece is always preferred
  if (Math.abs(counteredScore) >= Math.abs(materialScore)) {
    // Adjust countered score to be slightly less than material score
    counteredScore = -(Math.abs(materialScore) - 0.01);
    totalScore = materialScore + counteredScore + counterScore;
  }

  // --- Control Point Score (multiplicative) ---
  const cpMultiplier = getControlPointScore(unit, pos, state);

  return totalScore * cpMultiplier;
}

/**
 * Calculate the game state score for a player
 * Each friendly unit contributes positively, each enemy unit contributes negatively (zero-sum)
 */
function scoreGameState(state: GameState, playerId: number): number {
  let score = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u) {
        const pos = { row: r + 1, col: c + 1 };
        const s = unitScore(u, pos, state);
        if (u.ownerId === playerId) {
          score += s;
        } else {
          score -= s;
        }
      }
    }
  }
  return score;
}

/**
 * Calculate a bonus score for an action based on strategic value
 * Returns a bonus score that should be added to the game state score
 */
function getActionBonus(action: Action, state: GameState, playerId: number): number {
  let bonus = 0;
  
  if (action.type === 'ATTACK') {
    // Find the target unit's position
    let targetPos: Position | null = null;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const u = state.grid[r][c].unit;
        if (u && u.id === action.targetId) {
          targetPos = { row: r + 1, col: c + 1 };
          break;
        }
      }
      if (targetPos) break;
    }
    
    // Large bonus for attacking units on control points
    if (targetPos && isControlPoint(targetPos)) {
      bonus += CONTROL_POINT_ATTACK_BONUS;
    }
  } else if (action.type === 'MOVE') {
    // Bonus for moving to control points
    if (isControlPoint(action.to)) {
      bonus += CONTROL_POINT_ATTACK_BONUS * 0.5; // Smaller bonus for moving vs attacking
    }
  } else if (action.type === 'ROTATE') {
    // Bonus for rotating to control points
    if (isControlPoint(action.target)) {
      bonus += CONTROL_POINT_ATTACK_BONUS * 0.5;
    }
  }
  
  return bonus;
}

function simulateAction(state: GameState, action: Action): GameState | null {
  try {
    return applyAction(state, action);
  } catch {
    return null;
  }
}

export function createLookaheadBotVProMAX(): Bot {
  return {
    id: 'lookahead_bot_vpromax',
    name: 'Lookahead(vProMAX)',
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      // CRITICAL: Bot should ONLY act when it's definitely its turn
      // Double-check that currentPlayer matches playerId
      if (gameState.currentPlayer !== playerId) {
        // This should NEVER happen in normal operation - bot should only be called on its turn
        // Return END_TURN as a safe fallback (though this action should be invalid)
        console.error(`[LookaheadBotVProMAX] ERROR: Bot called when not its turn! currentPlayer=${gameState.currentPlayer}, playerId=${playerId}`);
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? { type: 'END_TURN' };
      }

      // Additional validation: ensure the player object exists and is valid
      const player = gameState.players[playerId];
      if (!player) {
        console.error(`[LookaheadBotVProMAX] ERROR: Player ${playerId} not found in game state!`);
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? { type: 'END_TURN' };
      }

      // If no actions available except END_TURN, return END_TURN
      const nonEndTurnActions = availableActions.filter(a => a.type !== 'END_TURN');
      if (nonEndTurnActions.length === 0) {
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? availableActions[0];
      }

      // Check if bot has extra deployment (freeDeploymentsRemaining > 0)
      if (gameState.freeDeploymentsRemaining > 0) {
        // Filter to only deployment actions
        const deploymentActions = availableActions.filter(a => a.type === 'DEPLOY');
        if (deploymentActions.length > 0) {
          // Find deployment action with greatest game state score
          let bestDeployment: Action | null = null;
          let bestScore = -Infinity;
          for (const action of deploymentActions) {
            const nextState = simulateAction(gameState, action);
            if (!nextState) continue;
            const score = scoreGameState(nextState, playerId) + getActionBonus(action, gameState, playerId);
            if (score > bestScore) {
              bestScore = score;
              bestDeployment = action;
            }
          }
          if (bestDeployment) {
            return bestDeployment;
          }
        }
      }

      // Check if bot has more than one action remaining
      if (player.actionsRemaining > 1) {
        // Find action(s) with greatest game state score
        let bestAction: Action | null = null;
        let bestScore = -Infinity;
        for (const action of nonEndTurnActions) {
          const nextState = simulateAction(gameState, action);
          if (!nextState) continue;
          const score = scoreGameState(nextState, playerId) + getActionBonus(action, gameState, playerId);
          if (score > bestScore) {
            bestScore = score;
            bestAction = action;
          }
        }
        if (bestAction) {
          return bestAction;
        }
        // If no valid action found, return first non-END_TURN action (should always exist)
        if (nonEndTurnActions.length > 0) {
          return nonEndTurnActions[0];
        }
        // This should never happen, but be safe
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? availableActions[0];
      }

      // Otherwise, minimax: for each action, calculate all opponent responses,
      // track lowest score, play action with highest lowest score
      type ScoredAction = {
        action: Action;
        minScore: number;
      };

      const scoredActions: ScoredAction[] = [];
      // Only consider END_TURN if we have no other actions or if it's truly the last action
      const shouldConsiderEndTurn = nonEndTurnActions.length === 0 || player.actionsRemaining === 0;
      
      for (const action of availableActions) {
        if (action.type === 'END_TURN') {
          // Only consider END_TURN if we should
          if (!shouldConsiderEndTurn) {
            continue;
          }
          // For END_TURN, just score the resulting state
          const nextState = simulateAction(gameState, action);
          if (nextState) {
            const score = scoreGameState(nextState, playerId) + getActionBonus(action, gameState, playerId);
            scoredActions.push({ action, minScore: score });
          }
          continue;
        }

        let nextState = simulateAction(gameState, action);
        if (!nextState) continue;

        // Calculate action bonus for this action
        const actionBonus = getActionBonus(action, gameState, playerId);

        // If the only available action after this is END_TURN, simulate END_TURN
        const nextActions = getAvailableActions(nextState, playerId);
        if (nextActions.length === 1 && nextActions[0].type === 'END_TURN') {
          const endTurnAction: Action = { type: 'END_TURN' };
          const afterEndTurn = simulateAction(nextState, endTurnAction);
          if (afterEndTurn) {
            nextState = afterEndTurn;
          }
        }

        const opponentId = playerId === 0 ? 1 : 0;
        let minScore = Infinity;
        const opponentActions = getAvailableActions(nextState, opponentId);
        
        // Base score after our action (includes action bonus)
        const baseScore = scoreGameState(nextState, playerId) + actionBonus;
        
        if (opponentActions.length === 0) {
          // No opponent actions available, use base score
          minScore = baseScore;
        } else {
          // Find the opponent's best response (lowest score for us)
          // Start with base score, then find worst case after opponent responds
          minScore = baseScore;
          for (const oppAction of opponentActions) {
            const oppState = simulateAction(nextState, oppAction);
            if (!oppState) continue;
            const score = scoreGameState(oppState, playerId);
            if (score < minScore) {
              minScore = score;
            }
          }
        }

        scoredActions.push({ action, minScore });
      }

      // Sort by minScore descending, then return the best action
      scoredActions.sort((a, b) => b.minScore - a.minScore);
      const best = scoredActions[0];
      
      // If we have a best action, return it
      if (best) {
        return best.action;
      }
      
      // Fallback: return first non-END_TURN action if available
      const fallbackAction = nonEndTurnActions[0];
      if (fallbackAction) {
        return fallbackAction;
      }
      
      // Last resort: return END_TURN
      const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
      return endTurnAction ?? availableActions[0];
    }
  };
}
