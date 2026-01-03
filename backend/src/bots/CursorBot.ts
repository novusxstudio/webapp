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
const CONTROL_POINT_ATTACK_BONUS = 500.0;
const CURSOR_SIMILARITY_BONUS = 50.0; // Bonus for moves similar to cursor

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

function calibrateCounteredDistance(unit: Unit, enemy: Unit, d: number): number {
  if (enemy.stats.type === "Archer") {
    return Math.max(1, d - 1);
  }
  if (unit.stats.type === "Cavalry" && enemy.stats.type === "Spearman") {
    return Math.max(1, d - 1);
  }
  return d;
}

function calibrateCounterDistance(unit: Unit, enemy: Unit, d: number): number {
  if (unit.stats.type === "Archer") {
    return Math.max(1, d - 1);
  }
  if (unit.stats.type === "Spearman" && enemy.stats.type === "Cavalry") {
    return Math.max(1, d - 1);
  }
  return d;
}

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

function getControlPointScore(unit: Unit, pos: Position, state: GameState): number {
  if (isControlPoint(pos)) {
    return CONTROL_WEIGHT;
  }

  let minCPDist = Infinity;
  for (const cp of CONTROL_POINTS) {
    const cpUnit = state.grid[cp.row - 1][cp.col - 1].unit;
    if (cpUnit) continue;

    let d = manhattanDistance(pos, cp);
    d = calibrateControlPointDistance(unit, d);
    if (d > 0 && d <= 2 && d < minCPDist) {
      minCPDist = d;
    }
  }

  if (minCPDist === Infinity || minCPDist <= 0 || minCPDist > 2) {
    return 1;
  }

  return CONTROL_WEIGHT * Math.exp(-CONTROL_DECAY_CONSTANT * minCPDist);
}

function unitScore(unit: Unit, pos: Position, state: GameState): number {
  let materialScore = MATERIAL_SCORE;

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

  let totalScore = materialScore + counteredScore + counterScore;

  if (Math.abs(counteredScore) >= Math.abs(materialScore)) {
    counteredScore = -(Math.abs(materialScore) - 0.01);
    totalScore = materialScore + counteredScore + counterScore;
  }

  const cpMultiplier = getControlPointScore(unit, pos, state);

  return totalScore * cpMultiplier;
}

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

function getActionBonus(action: Action, state: GameState, playerId: number): number {
  let bonus = 0;
  
  if (action.type === 'ATTACK') {
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
    
    if (targetPos && isControlPoint(targetPos)) {
      bonus += CONTROL_POINT_ATTACK_BONUS;
    }
  } else if (action.type === 'MOVE') {
    if (isControlPoint(action.to)) {
      bonus += CONTROL_POINT_ATTACK_BONUS * 0.5;
    }
  } else if (action.type === 'ROTATE') {
    if (isControlPoint(action.target)) {
      bonus += CONTROL_POINT_ATTACK_BONUS * 0.5;
    }
  }
  
  return bonus;
}

/**
 * Calculate similarity between two actions
 * Returns a score from 0 to 1, where 1 is identical and 0 is completely different
 */
function actionSimilarity(action1: Action | null, action2: Action): number {
  if (!action1) return 0;
  
  // Same type gets base similarity
  if (action1.type !== action2.type) return 0;
  
  let similarity = 0.5; // Base similarity for same type
  
  switch (action1.type) {
    case 'ATTACK':
      if (action2.type === 'ATTACK') {
        // Same unit attacking gets bonus
        if (action1.unitId === action2.unitId) similarity += 0.3;
        // Same target gets bonus
        if (action1.targetId === action2.targetId) similarity += 0.2;
      }
      break;
    case 'MOVE':
      if (action2.type === 'MOVE') {
        // Same unit moving gets bonus
        if (action1.unitId === action2.unitId) similarity += 0.2;
        // Similar destination gets bonus (inverse distance)
        const dist = manhattanDistance(action1.to, action2.to);
        similarity += 0.3 * Math.exp(-dist);
      }
      break;
    case 'DEPLOY':
      if (action2.type === 'DEPLOY') {
        // Same unit type gets bonus
        if (action1.unitType === action2.unitType) similarity += 0.3;
        // Same or nearby position gets bonus
        const dist = manhattanDistance(action1.to, action2.to);
        similarity += 0.2 * Math.exp(-dist);
      }
      break;
    case 'ROTATE':
      if (action2.type === 'ROTATE') {
        // Same unit rotating gets bonus
        if (action1.unitId === action2.unitId) similarity += 0.3;
        // Same target gets bonus
        const dist = manhattanDistance(action1.target, action2.target);
        similarity += 0.2 * Math.exp(-dist);
      }
      break;
    case 'END_TURN':
      return 1.0; // END_TURN is always identical
  }
  
  return Math.min(1.0, similarity);
}

function simulateAction(state: GameState, action: Action): GameState | null {
  try {
    return applyAction(state, action);
  } catch {
    return null;
  }
}

/**
 * 3-ply cursor search: Our move -> Opponent's best response -> Our best counter-response
 * Uses a cursor (best move found so far) to prioritize similar moves
 */
function cursorSearch(
  state: GameState,
  availableActions: Action[],
  playerId: 0 | 1,
  cursor: Action | null
): { action: Action; score: number } {
  const opponentId = playerId === 0 ? 1 : 0;
  
  if (availableActions.length === 0) {
    return { action: { type: 'END_TURN' }, score: scoreGameState(state, playerId) };
  }
  
  // Sort actions by similarity to cursor (if cursor exists)
  // This prioritizes exploring moves similar to the current best move
  const sortedActions = [...availableActions].sort((a, b) => {
    if (!cursor) return 0;
    const simA = actionSimilarity(cursor, a);
    const simB = actionSimilarity(cursor, b);
    return simB - simA; // Higher similarity first
  });
  
  let bestAction: Action | null = null;
  let bestScore = -Infinity;
  let currentCursor = cursor;
  
  // Explore actions, prioritizing those similar to cursor
  for (const action of sortedActions) {
    const nextState = simulateAction(state, action);
    if (!nextState) continue;
    
    // Add action bonus (e.g., attacking control points)
    const actionBonus = getActionBonus(action, state, playerId);
    
    // Add cursor similarity bonus (moves similar to cursor get explored first)
    const similarity = currentCursor ? actionSimilarity(currentCursor, action) : 0;
    const cursorBonus = similarity * CURSOR_SIMILARITY_BONUS;
    
    // Ply 1: Our move (already applied above)
    // Get opponent's available actions
    const opponentActions = getAvailableActions(nextState, opponentId);
    
    if (opponentActions.length === 0) {
      // No opponent actions, score this state
      const score = scoreGameState(nextState, playerId) + actionBonus + cursorBonus;
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
        currentCursor = action; // Update cursor to best move found
      }
      continue;
    }
    
    // Ply 2: Opponent's best response (worst for us)
    let minScore = Infinity;
    for (const oppAction of opponentActions) {
      const oppState = simulateAction(nextState, oppAction);
      if (!oppState) continue;
      
      // Ply 3: Our best counter-response
      const ourActions = getAvailableActions(oppState, playerId as 0 | 1);
      if (ourActions.length === 0) {
        // No counter-actions available
        const score = scoreGameState(oppState, playerId);
        if (score < minScore) {
          minScore = score;
        }
        continue;
      }
      
      // Find our best counter-response
      let maxCounterScore = -Infinity;
      for (const counterAction of ourActions) {
        const counterState = simulateAction(oppState, counterAction);
        if (!counterState) continue;
        
        const counterBonus = getActionBonus(counterAction, oppState, playerId);
        const counterScore = scoreGameState(counterState, playerId) + counterBonus;
        
        if (counterScore > maxCounterScore) {
          maxCounterScore = counterScore;
        }
      }
      
      // Track worst-case scenario (opponent's best response)
      if (maxCounterScore !== -Infinity && maxCounterScore < minScore) {
        minScore = maxCounterScore;
      }
    }
    
    // Final score: worst-case after opponent's best response, plus our action bonus and cursor bonus
    const finalScore = (minScore !== Infinity ? minScore : scoreGameState(nextState, playerId)) + actionBonus + cursorBonus;
    
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestAction = action;
      currentCursor = action; // Update cursor to best move found
    }
  }
  
  return {
    action: bestAction ?? availableActions[0] ?? { type: 'END_TURN' },
    score: bestScore !== -Infinity ? bestScore : scoreGameState(state, playerId)
  };
}

export function createCursorBot(): Bot {
  return {
    id: 'cursor_bot',
    name: 'Cursor(3-ply)',
    decideAction({ gameState, availableActions, playerId }: BotContext): Action {
      // CRITICAL: Bot should ONLY act when it's definitely its turn
      // Double-check that currentPlayer matches playerId
      if (gameState.currentPlayer !== playerId) {
        // This should NEVER happen in normal operation - bot should only be called on its turn
        // Return END_TURN as a safe fallback (though this action should be invalid)
        console.error(`[CursorBot] ERROR: Bot called when not its turn! currentPlayer=${gameState.currentPlayer}, playerId=${playerId}`);
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? availableActions[0] ?? { type: 'END_TURN' };
      }

      // Additional validation: ensure the player object exists and is valid
      const player = gameState.players[playerId];
      if (!player) {
        console.error(`[CursorBot] ERROR: Player ${playerId} not found in game state!`);
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? availableActions[0] ?? { type: 'END_TURN' };
      }

      // Filter out END_TURN if we have other actions
      const nonEndTurnActions = availableActions.filter(a => a.type !== 'END_TURN');
      if (nonEndTurnActions.length === 0) {
        const endTurnAction = availableActions.find(a => a.type === 'END_TURN');
        return endTurnAction ?? availableActions[0];
      }

      // Check for extra deployments
      if (gameState.freeDeploymentsRemaining > 0) {
        const deploymentActions = nonEndTurnActions.filter(a => a.type === 'DEPLOY');
        if (deploymentActions.length > 0) {
          // Use cursor search for deployments
          const result = cursorSearch(gameState, deploymentActions, playerId, null);
          return result.action;
        }
      }

      // Use 3-ply cursor search
      // Start with no cursor, will be updated as we find better moves
      const result = cursorSearch(gameState, nonEndTurnActions, playerId, null);
      
      return result.action;
    }
  };
}

