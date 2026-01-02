/**
 * RLAgentBot - A bot that uses trained RL agents from Python checkpoints
 * 
 * This bot spawns a Python process to evaluate the trained neural network
 * and returns actions based on the policy.
 */
import type { Bot, BotContext } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Unit, Position } from '../logic/GameState';
import * as path from 'path';

// Unit type mapping from game to RL environment
const UNIT_TYPE_MAP: Record<string, number> = {
  'Swordsman': 1,
  'Shieldman': 2,
  'Axeman': 3,
  'Cavalry': 4,
  'Archer': 5,
  'Spearman': 6,
};

const UNIT_TYPE_REVERSE: Record<number, string> = {
  1: 'Swordsman',
  2: 'Shieldman',
  3: 'Axeman',
  4: 'Cavalry',
  5: 'Archer',
  6: 'Spearman',
};

// Action space encoding (must match env.py)
const DEPLOY_ACTIONS = 6 * 5 * 5;  // 150 (6 unit types * 5 columns * 5 rows)
const MOVE_ACTIONS = 25 * 25;      // 625
const ATTACK_ACTIONS = 25 * 25;    // 625
const ROTATE_ACTIONS = 25 * 25;    // 625

interface RLAction {
  type: 'DEPLOY' | 'MOVE' | 'ATTACK' | 'ROTATE' | 'END_TURN';
  unitType?: string;
  col?: number;
  sourceRow?: number;
  sourceCol?: number;
  targetRow?: number;
  targetCol?: number;
}

/**
 * Decode an action index from the RL model into game action format
 * Action encoding (from env.py):
 * - Deploy: unit_type (0-5) * 25 + col (0-4) -> 0-149 (6 types * 5 cols * 5 rows)
 * - Move: source_idx * 25 + target_idx -> 150-774
 * - Attack: source_idx * 25 + target_idx -> 775-1399
 * - Rotate: source_idx * 25 + target_idx -> 1400-2024
 * - End turn: 2025
 */
function decodeRLAction(actionIdx: number, playerId: 0 | 1): RLAction {
  // Deploy actions: 0 to 149 (6 unit types * 5 columns * 5 rows)
  // unit_type = (action // 25) + 1 (1-6)
  // col = action % 5
  if (actionIdx < DEPLOY_ACTIONS) {
    const unitTypeIdx = Math.floor(actionIdx / 25) + 1;  // 1-6
    const col = (actionIdx % 5);  // 0-4 (0-indexed in env)
    return {
      type: 'DEPLOY',
      unitType: UNIT_TYPE_REVERSE[unitTypeIdx],
      col: col + 1,  // Convert to 1-indexed for game
    };
  }
  
  actionIdx -= DEPLOY_ACTIONS;
  
  // Move actions
  if (actionIdx < MOVE_ACTIONS) {
    const sourceIdx = Math.floor(actionIdx / 25);
    const targetIdx = actionIdx % 25;
    return {
      type: 'MOVE',
      sourceRow: Math.floor(sourceIdx / 5) + 1,  // Convert to 1-indexed
      sourceCol: (sourceIdx % 5) + 1,
      targetRow: Math.floor(targetIdx / 5) + 1,
      targetCol: (targetIdx % 5) + 1,
    };
  }
  
  actionIdx -= MOVE_ACTIONS;
  
  // Attack actions
  if (actionIdx < ATTACK_ACTIONS) {
    const sourceIdx = Math.floor(actionIdx / 25);
    const targetIdx = actionIdx % 25;
    return {
      type: 'ATTACK',
      sourceRow: Math.floor(sourceIdx / 5) + 1,
      sourceCol: (sourceIdx % 5) + 1,
      targetRow: Math.floor(targetIdx / 5) + 1,
      targetCol: (targetIdx % 5) + 1,
    };
  }
  
  actionIdx -= ATTACK_ACTIONS;
  
  // Rotate actions
  if (actionIdx < ROTATE_ACTIONS) {
    const sourceIdx = Math.floor(actionIdx / 25);
    const targetIdx = actionIdx % 25;
    return {
      type: 'ROTATE',
      sourceRow: Math.floor(sourceIdx / 5) + 1,
      sourceCol: (sourceIdx % 5) + 1,
      targetRow: Math.floor(targetIdx / 5) + 1,
      targetCol: (targetIdx % 5) + 1,
    };
  }
  
  // End turn: 2000
  return { type: 'END_TURN' };
}

/**
 * Find a unit at a given position
 */
function findUnitAt(state: GameState, row: number, col: number): Unit | null {
  if (row < 1 || row > 5 || col < 1 || col > 5) return null;
  return state.grid[row - 1][col - 1].unit;
}

/**
 * Convert RL action to game Action
 */
function rlActionToGameAction(
  rlAction: RLAction,
  state: GameState,
  playerId: 0 | 1,
  availableActions: readonly Action[]
): Action | null {
  switch (rlAction.type) {
    case 'DEPLOY':
      return availableActions.find(a => 
        a.type === 'DEPLOY' && 
        a.unitType === rlAction.unitType && 
        a.to?.col === rlAction.col
      ) || null;
    
    case 'MOVE': {
      // Find the unit at the source position
      const unit = findUnitAt(state, rlAction.sourceRow!, rlAction.sourceCol!);
      if (!unit) return null;
      
      return availableActions.find(a => 
        a.type === 'MOVE' && 
        a.unitId === unit.id &&
        a.to?.row === rlAction.targetRow && 
        a.to?.col === rlAction.targetCol
      ) || null;
    }
    
    case 'ATTACK': {
      // Find the unit at the source position
      const attacker = findUnitAt(state, rlAction.sourceRow!, rlAction.sourceCol!);
      const target = findUnitAt(state, rlAction.targetRow!, rlAction.targetCol!);
      if (!attacker || !target) return null;
      
      return availableActions.find(a => 
        a.type === 'ATTACK' && 
        a.unitId === attacker.id &&
        a.targetId === target.id
      ) || null;
    }
    
    case 'ROTATE': {
      // Find the unit at the source position
      const unit = findUnitAt(state, rlAction.sourceRow!, rlAction.sourceCol!);
      if (!unit) return null;
      
      return availableActions.find(a => 
        a.type === 'ROTATE' && 
        a.unitId === unit.id &&
        a.target?.row === rlAction.targetRow && 
        a.target?.col === rlAction.targetCol
      ) || null;
    }
    
    case 'END_TURN':
      return availableActions.find(a => a.type === 'END_TURN') || null;
  }
}

/**
 * Convert game state to RL observation format for the Python script
 */
function gameStateToRLInput(state: GameState, playerId: 0 | 1): any {
  // Build grid representation
  const grid: any[][] = [];
  for (let row = 0; row < 5; row++) {
    const gridRow: any[] = [];
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit) {
        gridRow.push({
          type: UNIT_TYPE_MAP[unit.stats.type] || 0,
          owner: unit.ownerId,
          acted: unit.actedThisTurn || false,
        });
      } else {
        gridRow.push(null);
      }
    }
    grid.push(gridRow);
  }
  
  return {
    grid,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    players: [
      {
        actionsRemaining: state.players[0].actionsRemaining,
        deploymentsRemaining: state.players[0].deploymentsRemaining,
      },
      {
        actionsRemaining: state.players[1].actionsRemaining,
        deploymentsRemaining: state.players[1].deploymentsRemaining,
      },
    ],
    playerId,
  };
}

/**
 * Create an RL Agent Bot that uses a trained checkpoint
 * @param checkpointName - The checkpoint folder name (e.g., 'iter_100')
 * @param displayName - Display name for the UI
 * @param trainedAsPlayer - Which player this agent was trained as (0 or 1)
 */
export function createRLAgentBot(checkpointName: string, displayName: string, trainedAsPlayer: 0 | 1 = 0): () => Bot {
  return () => ({
    id: `rl_agent_${checkpointName}_p${trainedAsPlayer}`,
    name: displayName,
    trainedAsPlayer,  // Store which player role this agent was trained for
    
    decideAction(ctx: BotContext): Action {
      const { gameState, playerId, availableActions } = ctx;
      
      // If no available actions, return END_TURN
      const endTurn = availableActions.find(a => a.type === 'END_TURN');
      if (availableActions.length === 0) {
        return endTurn || availableActions[0];
      }
      
      // For now, use a synchronous fallback that picks the best action
      // based on simple heuristics while we set up the Python inference
      // In production, this would call the Python RL model
      
      try {
        // Try to use the RL model via the inference script
        // Pass trainedAsPlayer to load the correct model checkpoint
        const action = inferRLAction(gameState, playerId, availableActions, checkpointName, trainedAsPlayer);
        if (action) return action;
      } catch (e) {
        console.warn(`[RLAgentBot] Inference failed, using fallback: ${e}`);
      }
      
      // Fallback: Use heuristic-based action selection
      return selectHeuristicAction(ctx);
    },
  });
}

/**
 * Synchronous RL action inference using spawnSync
 * This calls a Python script that loads the model and returns the best action
 * @param trainedAsPlayer - Which player the model was trained as (determines which checkpoint file to load)
 */
function inferRLAction(
  state: GameState,
  playerId: 0 | 1,
  availableActions: readonly Action[],
  checkpointName: string,
  trainedAsPlayer: 0 | 1
): Action | null {
  const { spawnSync } = require('child_process');
  
  // Build the input for the Python script
  // trainedAsPlayer tells the inference script which model file to load (agent_p0.pt or agent_p1.pt)
  // playerId is the current game position for observation encoding
  const input = JSON.stringify({
    state: gameStateToRLInput(state, playerId),
    checkpoint: checkpointName,
    playerId,
    trainedAsPlayer,  // Which model file to load
  });
  
  // Path to the inference script
  const scriptPath = path.join(__dirname, '..', '..', '..', 'rl', 'inference.py');
  
  try {
    const result = spawnSync('python', [scriptPath], {
      input,
      encoding: 'utf-8',
      timeout: 5000,  // 5 second timeout
      cwd: path.join(__dirname, '..', '..', '..'),
    });
    
    if (result.status !== 0) {
      console.warn(`[RLAgentBot] Python script failed: ${result.stderr}`);
      return null;
    }
    
    const output = JSON.parse(result.stdout.trim());
    const actionIdx = output.action;
    
    // Decode the action
    const rlAction = decodeRLAction(actionIdx, playerId);
    
    // Convert to game action
    return rlActionToGameAction(rlAction, state, playerId, availableActions);
  } catch (e) {
    console.warn(`[RLAgentBot] Inference error: ${e}`);
    return null;
  }
}

/**
 * Fallback heuristic action selection when RL inference fails
 */
function selectHeuristicAction(ctx: BotContext): Action {
  const { availableActions, playerId, gameState } = ctx;
  
  const endTurn = availableActions.find(a => a.type === 'END_TURN')!;
  
  // Priority 1: Attack if possible
  const attacks = availableActions.filter(a => a.type === 'ATTACK');
  if (attacks.length > 0) {
    return attacks[Math.floor(Math.random() * attacks.length)];
  }
  
  // Priority 2: Move towards control points
  const moves = availableActions.filter(a => a.type === 'MOVE');
  if (moves.length > 0) {
    // Prefer moves towards center
    const centerMoves = moves.filter(a => 
      a.to && (a.to.row === 3 || (a.to.col >= 2 && a.to.col <= 4))
    );
    if (centerMoves.length > 0) {
      return centerMoves[Math.floor(Math.random() * centerMoves.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }
  
  // Priority 3: Deploy units
  const deploys = availableActions.filter(a => a.type === 'DEPLOY');
  if (deploys.length > 0) {
    // Prefer deploying to center columns
    const centerDeploys = deploys.filter(a => a.to && a.to.col >= 2 && a.to.col <= 4);
    if (centerDeploys.length > 0) {
      return centerDeploys[Math.floor(Math.random() * centerDeploys.length)];
    }
    return deploys[Math.floor(Math.random() * deploys.length)];
  }
  
  // Fallback: End turn
  return endTurn;
}

// Pre-configured RL agent bots for different checkpoints
// Each checkpoint has both a P0 and P1 agent (trained from different perspectives)
export const createRLAgent100_P0 = createRLAgentBot('iter_100', 'RL Agent 100 (P0)', 0);
export const createRLAgent100_P1 = createRLAgentBot('iter_100', 'RL Agent 100 (P1)', 1);
export const createRLAgent1000_P0 = createRLAgentBot('iter_1000', 'RL Agent 1K (P0)', 0);
export const createRLAgent1000_P1 = createRLAgentBot('iter_1000', 'RL Agent 1K (P1)', 1);
export const createRLAgent10000_P0 = createRLAgentBot('iter_10000', 'RL Agent 10K (P0)', 0);
export const createRLAgent10000_P1 = createRLAgentBot('iter_10000', 'RL Agent 10K (P1)', 1);
export const createRLAgent100000_P0 = createRLAgentBot('iter_100000', 'RL Agent 100K (P0)', 0);
export const createRLAgent100000_P1 = createRLAgentBot('iter_100000', 'RL Agent 100K (P1)', 1);

// Interrupted training checkpoints
export const createRLAgentInt2128_P0 = createRLAgentBot('interrupted_ep2128', 'RL Agent 2K Interrupted (P0)', 0);
export const createRLAgentInt2128_P1 = createRLAgentBot('interrupted_ep2128', 'RL Agent 2K Interrupted (P1)', 1);
export const createRLAgentInt14457_P0 = createRLAgentBot('interrupted_ep14457', 'RL Agent 14K Interrupted (P0)', 0);
export const createRLAgentInt14457_P1 = createRLAgentBot('interrupted_ep14457', 'RL Agent 14K Interrupted (P1)', 1);
