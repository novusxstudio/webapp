import { randomBytes } from 'crypto';
import type { Server as IOServer, Socket } from 'socket.io';
import type { PlayerId, PlayerAction, GameInstanceDescriptor } from './types';
import type { GameState, Position } from './logic/GameState';
import { createInitialGrid } from './logic/setup';
import { applyMove, applyAttack, applyRotate, applyDeployUnit, endTurn, controlsAllPoints } from './logic/rules';

// Authoritative game instance: owns state and applies actions using existing game logic
export class GameInstance implements GameInstanceDescriptor {
  id: string;
  players: Map<PlayerId, string> = new Map(); // playerId -> socket.id
  state: GameState;

  constructor(id?: string) {
    this.id = id ?? GameInstance.generateId();
    this.state = GameInstance.createInitialGameState();
  }

  static generateId(): string {
    // Short, URL-safe ID using base64 with URL-safe replacements
    const b64 = randomBytes(4).toString('base64');
    // Replace '+' -> '-', '/' -> '_', trim '='
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static createInitialGameState(): GameState {
    const grid = createInitialGrid();
    const players = [
      { id: 0, actionsRemaining: 1 },
      { id: 1, actionsRemaining: 0 },
    ];
    return {
      grid,
      players,
      currentPlayer: 0,
      turnNumber: 1,
      freeDeploymentsRemaining: 0,
      hasActedThisTurn: false,
    };
  }

  addPlayer(playerId: PlayerId, socketId: string) {
    this.players.set(playerId, socketId);
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.players.has(playerId);
  }

  getPlayerSocketId(playerId: PlayerId): string | undefined {
    return this.players.get(playerId);
  }

  // Apply a player action (from the authoritative server perspective), using the same flow as the frontend App.
  applyPlayerAction(fromPlayer: PlayerId, action: PlayerAction): GameState {
    // Validate turn ownership
    if (this.state.currentPlayer !== fromPlayer) {
      throw new Error('Not your turn');
    }

    let newState = this.state;

    switch (action.kind) {
      case 'MOVE': {
        newState = applyMove(newState, action.unitId, action.target);
        // decrement actions
        newState = this.decrementActions(newState);
        break;
      }
      case 'ATTACK': {
        newState = applyAttack(newState, action.attackerId, action.targetPos);
        newState = this.decrementActions(newState);
        break;
      }
      case 'ROTATE': {
        newState = applyRotate(newState, action.unitId, action.targetPos);
        newState = this.decrementActions(newState);
        break;
      }
      case 'DEPLOY': {
        // Place unit
        newState = applyDeployUnit(newState, action.unitType as any, action.targetPos);
        // Determine free vs action spend
        const freeAvailable = newState.freeDeploymentsRemaining > 0 && !newState.hasActedThisTurn;
        if (freeAvailable) {
          newState = {
            ...newState,
            freeDeploymentsRemaining: newState.freeDeploymentsRemaining - 1,
          };
        } else {
          newState = this.decrementActions(newState);
        }
        break;
      }
      case 'END_TURN': {
        newState = endTurn(newState);
        break;
      }
      default:
        throw new Error('Unknown action');
    }

    // If actions hit 0 due to MOVE/ATTACK/ROTATE/DEPLOY (non-free), end the turn immediately (with win check first)
    newState = this.maybeEndTurnOnZero(newState);

    this.state = newState;
    return this.state;
  }

  private decrementActions(state: GameState): GameState {
    const current = state.currentPlayer;
    const updatedPlayers = state.players.map((p, i) => {
      if (i !== current) return p;
      return { ...p, actionsRemaining: p.actionsRemaining - 1 };
    });
    return {
      ...state,
      players: updatedPlayers,
      hasActedThisTurn: true,
      freeDeploymentsRemaining: 0,
    };
  }

  private maybeEndTurnOnZero(state: GameState): GameState {
    const current = state.currentPlayer;
    if (state.players[current].actionsRemaining > 0) return state;

    // Check win condition before ending turn
    if (controlsAllPoints(state, current)) {
      // Keep state as-is; client side can interpret winner from control points
      return state;
    }
    return endTurn(state);
  }

  // Broadcast the authoritative full state to a room for this game
  broadcastState(io: IOServer) {
    io.to(this.roomName()).emit('STATE_UPDATE', { gameId: this.id, state: this.state });
  }

  roomName(): string {
    return `game:${this.id}`;
  }
}
