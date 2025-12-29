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
  reconnectTokens: Map<PlayerId, string> = new Map();
  disconnectTimers: Map<PlayerId, NodeJS.Timeout> = new Map();
  inactivityTimer: NodeJS.Timeout | null = null;
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

  setReconnectToken(playerId: PlayerId, token: string) {
    this.reconnectTokens.set(playerId, token);
  }

  getReconnectToken(playerId: PlayerId): string | undefined {
    return this.reconnectTokens.get(playerId);
  }

  getOpponentId(playerId: PlayerId): PlayerId {
    return playerId === 0 ? 1 : 0;
  }

  bindPlayerSocket(playerId: PlayerId, socketId: string) {
    const oldId = this.players.get(playerId);
    this.players.set(playerId, socketId);
    return oldId;
  }

  startDisconnectGrace(playerId: PlayerId, io: IOServer, seconds = 60, onTimeout?: () => void) {
    // Cancel any existing timer
    const existing = this.disconnectTimers.get(playerId);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(playerId);
    }
    // Notify opponent
    const opponentId = this.getOpponentId(playerId);
    const oppSocket = this.getPlayerSocketId(opponentId);
    if (oppSocket) {
      io.to(oppSocket).emit('OPPONENT_DISCONNECTED', { gameId: this.id, graceSeconds: seconds });
    }
    // Start new timer
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      // Opponent wins after grace period
      const winner: PlayerId = opponentId;
      io.to(this.roomName()).emit('PLAYER_LEFT', { gameId: this.id, playerId });
      io.to(this.roomName()).emit('GAME_CONCLUDED', { gameId: this.id, winner });
      // Allow manager to clean up the game
      if (onTimeout) onTimeout();
    }, seconds * 1000);
    this.disconnectTimers.set(playerId, timer);
  }

  cancelDisconnectGrace(playerId: PlayerId, io?: IOServer) {
    const t = this.disconnectTimers.get(playerId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(playerId);
      if (io) {
        // Notify opponent that grace is cancelled due to reconnect
        const opponentId = this.getOpponentId(playerId);
        const oppSocket = this.getPlayerSocketId(opponentId);
        if (oppSocket) {
          io.to(oppSocket).emit('DISCONNECT_GRACE_CANCEL', { gameId: this.id });
        }
      }
    }
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

  // Determine if either player controls all control points
  checkVictory(): PlayerId | null {
    if (controlsAllPoints(this.state, 0)) return 0;
    if (controlsAllPoints(this.state, 1)) return 1;
    return null;
  }

  startInactivityTimer(io: IOServer, seconds = 30, onTimeout?: () => void, onWin?: (winner: PlayerId) => void) {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    const current = this.state.currentPlayer as PlayerId;
    const deadline = Date.now() + seconds * 1000;
    io.to(this.roomName()).emit('INACTIVITY_TIMER_START', {
      gameId: this.id,
      seconds,
      currentPlayer: this.state.currentPlayer,
      deadline,
    });
    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null;
      // End the current turn due to inactivity and broadcast updated state
      const newState = endTurn(this.state);
      this.state = newState;
      this.broadcastState(io);
      // Check victory after endTurn
      const winner = this.checkVictory();
      if (winner !== null) {
        // Defer conclusion to next tick so clients render the endTurn state first
        setTimeout(() => {
          io.to(this.roomName()).emit('GAME_CONCLUDED', { gameId: this.id, winner });
          if (onWin) onWin(winner);
        }, 0);
      } else {
        // Automatically start the inactivity timer for the next player's turn
        this.startInactivityTimer(io, seconds, undefined, onWin);
      }
    }, seconds * 1000);
  }

  cancelInactivityTimer(io?: IOServer) {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
      if (io) {
        io.to(this.roomName()).emit('INACTIVITY_TIMER_CANCEL', { gameId: this.id });
      }
    }
  }

  roomName(): string {
    return `game:${this.id}`;
  }
}
