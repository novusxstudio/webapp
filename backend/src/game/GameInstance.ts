// Simplified GameInstance for PvP-only deployment
// Removed: All bot-related logic
// Hardened: Explicit authority checks for game-level security

import { randomBytes } from 'crypto';
import type { Server as IOServer } from 'socket.io';
import type { PlayerId, PlayerAction } from '../types';
import type { GameState } from '../logic/GameState';
import { createInitialGrid } from '../logic/setup';
import { 
  applyRotate, 
  applyDeployUnit, 
  endTurn, 
  controlsAllPoints, 
  checkDraw, 
  checkElimination, 
  type DrawReason 
} from '../logic/rules';
import { 
  applyAction as applyStrictAction, 
  type Action as StrictAction 
} from '../engine/actions';

// =========================================================================
// Game Status - Explicit lifecycle tracking
// =========================================================================
export type GameStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

export class GameInstance {
  id: string;
  
  // Game lifecycle status
  private _status: GameStatus = 'WAITING';
  
  // Player mappings
  private playerSockets: Map<PlayerId, string> = new Map();  // playerId -> socket.id
  private playerUserIds: Map<PlayerId, string> = new Map();  // playerId -> user.id
  private reconnectTokens: Map<PlayerId, string> = new Map();
  private disconnectTimers: Map<PlayerId, NodeJS.Timeout> = new Map();
  private inactivityTimer: NodeJS.Timeout | null = null;
  
  state: GameState;

  constructor(id?: string) {
    this.id = id ?? GameInstance.generateId();
    this.state = GameInstance.createInitialGameState();
  }

  // =========================================================================
  // Game Status Management
  // =========================================================================

  get status(): GameStatus {
    return this._status;
  }

  /**
   * Transition game to IN_PROGRESS when both players have joined
   * Can only transition from WAITING
   */
  startGame(): void {
    if (this._status !== 'WAITING') {
      throw new Error(`Cannot start game: current status is ${this._status}`);
    }
    if (!this.areBothPlayersPresent()) {
      throw new Error('Cannot start game: waiting for second player');
    }
    this._status = 'IN_PROGRESS';
  }

  /**
   * Mark game as completed (win or draw)
   * Can only transition from IN_PROGRESS
   */
  completeGame(): void {
    if (this._status !== 'IN_PROGRESS') {
      throw new Error(`Cannot complete game: current status is ${this._status}`);
    }
    this._status = 'COMPLETED';
  }

  /**
   * Mark game as abandoned (forfeit/disconnect)
   * Can transition from WAITING or IN_PROGRESS
   */
  abandonGame(): void {
    if (this._status === 'COMPLETED' || this._status === 'ABANDONED') {
      throw new Error(`Cannot abandon game: current status is ${this._status}`);
    }
    this._status = 'ABANDONED';
  }

  /**
   * Check if game is still active (can accept actions)
   */
  isActive(): boolean {
    return this._status === 'IN_PROGRESS';
  }

  static generateId(): string {
    const b64 = randomBytes(4).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static createInitialGameState(): GameState {
    const grid = createInitialGrid();
    const initialDeploymentCounts = {
      swordsman: 0, shieldman: 0, axeman: 0,
      cavalry: 0, archer: 0, spearman: 0,
    };
    const players = [
      { id: 0, actionsRemaining: 1, deploymentsRemaining: 10, deploymentCounts: { ...initialDeploymentCounts } },
      { id: 1, actionsRemaining: 0, deploymentsRemaining: 10, deploymentCounts: { ...initialDeploymentCounts } },
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

  // =========================================================================
  // Player Management
  // =========================================================================

  addPlayer(playerId: PlayerId, socketId: string, userId: string): void {
    this.playerSockets.set(playerId, socketId);
    this.playerUserIds.set(playerId, userId);
    
    // Auto-start game when second player joins
    if (this.areBothPlayersPresent() && this._status === 'WAITING') {
      this.startGame();
    }
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.playerSockets.has(playerId);
  }

  areBothPlayersPresent(): boolean {
    return this.hasPlayer(0) && this.hasPlayer(1);
  }

  getPlayerSocketId(playerId: PlayerId): string | undefined {
    return this.playerSockets.get(playerId);
  }

  getUserId(playerId: PlayerId): string | undefined {
    return this.playerUserIds.get(playerId);
  }

  getPlayerIdByUserId(userId: string): PlayerId | null {
    for (const [pid, uid] of this.playerUserIds.entries()) {
      if (uid === userId) return pid;
    }
    return null;
  }

  /**
   * Check if a userId is a registered participant in this game
   */
  isParticipant(userId: string): boolean {
    return this.getPlayerIdByUserId(userId) !== null;
  }

  /**
   * Get the userId of the player whose turn it currently is
   */
  getCurrentPlayerUserId(): string | undefined {
    return this.playerUserIds.get(this.state.currentPlayer as PlayerId);
  }

  bindPlayerSocket(playerId: PlayerId, socketId: string): string | undefined {
    const oldId = this.playerSockets.get(playerId);
    this.playerSockets.set(playerId, socketId);
    return oldId;
  }

  /**
   * Reconnect a player with a new socket
   * - Cancels disconnect grace timer
   * - Replaces old socket reference
   * - Notifies opponent that player has reconnected
   * - Returns old socket ID for cleanup
   */
  reconnectPlayer(playerId: PlayerId, newSocketId: string, io: IOServer): string | undefined {
    // Cancel any pending disconnect timer
    this.cancelDisconnectGrace(playerId, io);

    // Replace socket reference
    const oldSocketId = this.bindPlayerSocket(playerId, newSocketId);

    // Notify opponent that player has reconnected
    const opponentId = this.getOpponentId(playerId);
    const oppSocket = this.getPlayerSocketId(opponentId);
    if (oppSocket) {
      io.to(oppSocket).emit('OPPONENT_RECONNECTED', { gameId: this.id });
    }

    console.log(`[Reconnect] Player ${playerId} reconnected to game ${this.id}`);

    return oldSocketId;
  }

  // =========================================================================
  // Reconnect Tokens
  // =========================================================================

  setReconnectToken(playerId: PlayerId, token: string): void {
    this.reconnectTokens.set(playerId, token);
  }

  getReconnectToken(playerId: PlayerId): string | undefined {
    return this.reconnectTokens.get(playerId);
  }

  // =========================================================================
  // Disconnect Grace Period
  // =========================================================================

  getOpponentId(playerId: PlayerId): PlayerId {
    return playerId === 0 ? 1 : 0;
  }

  startDisconnectGrace(
    playerId: PlayerId, 
    io: IOServer, 
    seconds = 60, 
    onTimeout?: () => void
  ): void {
    const existing = this.disconnectTimers.get(playerId);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(playerId);
    }

    const opponentId = this.getOpponentId(playerId);
    const oppSocket = this.getPlayerSocketId(opponentId);
    if (oppSocket) {
      io.to(oppSocket).emit('OPPONENT_DISCONNECTED', { 
        gameId: this.id, 
        graceSeconds: seconds 
      });
    }

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      const winner: PlayerId = opponentId;
      this.abandonGame();
      io.to(this.roomName()).emit('PLAYER_LEFT', { gameId: this.id, playerId });
      io.to(this.roomName()).emit('GAME_CONCLUDED', { gameId: this.id, winner });
      if (onTimeout) onTimeout();
    }, seconds * 1000);
    
    this.disconnectTimers.set(playerId, timer);
  }

  cancelDisconnectGrace(playerId: PlayerId, io?: IOServer): void {
    const t = this.disconnectTimers.get(playerId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(playerId);
      if (io) {
        const opponentId = this.getOpponentId(playerId);
        const oppSocket = this.getPlayerSocketId(opponentId);
        if (oppSocket) {
          io.to(oppSocket).emit('DISCONNECT_GRACE_CANCEL', { gameId: this.id });
        }
      }
    }
  }

  // =========================================================================
  // Authority Validation (CRITICAL SECURITY LAYER)
  // =========================================================================

  /**
   * Validate that a user has authority to perform an action
   * This is the SINGLE entry point for all authority checks
   * 
   * @throws Error if any invariant is violated
   */
  private validateActionAuthority(userId: string): PlayerId {
    // INVARIANT 1: Game must be active
    if (!this.isActive()) {
      throw new Error(`Game is not active (status: ${this._status})`);
    }

    // INVARIANT 2: User must be a registered participant
    const playerId = this.getPlayerIdByUserId(userId);
    if (playerId === null) {
      throw new Error('User is not a participant in this game');
    }

    // INVARIANT 3: It must be this player's turn
    if (this.state.currentPlayer !== playerId) {
      throw new Error("Not this player's turn");
    }

    return playerId;
  }

  // =========================================================================
  // Action Application (Server-Authoritative)
  // =========================================================================

  /**
   * Apply an action from an authenticated user
   * 
   * @param userId - The authenticated user's ID (from JWT)
   * @param action - The action to apply
   * @returns The new game state
   * @throws Error if authority validation fails or action is invalid
   */
  applyActionFromUser(userId: string, action: PlayerAction): GameState {
    // Validate authority FIRST (fail fast)
    const playerId = this.validateActionAuthority(userId);
    
    // Now apply the action (playerId is guaranteed valid)
    return this.applyPlayerAction(playerId, action);
  }

  /**
   * Internal action application - only called after authority is validated
   * @deprecated Use applyActionFromUser for external calls
   */
  applyPlayerAction(fromPlayer: PlayerId, action: PlayerAction): GameState {
    // Double-check turn ownership (defense in depth)
    if (this.state.currentPlayer !== fromPlayer) {
      throw new Error('Not your turn');
    }

    let newState = this.state;

    switch (action.kind) {
      case 'MOVE': {
        const strict: StrictAction = { type: 'MOVE', unitId: action.unitId, to: action.target };
        newState = applyStrictAction(newState, strict);
        newState = { ...newState, lastAction: { type: 'MOVE', by: fromPlayer, unitId: action.unitId, to: action.target } };
        newState = this.decrementActions(newState);
        break;
      }
      case 'ATTACK': {
        const defender = newState.grid[action.targetPos.row - 1][action.targetPos.col - 1].unit;
        if (!defender) throw new Error('No defender at target');
        const strict: StrictAction = { type: 'ATTACK', unitId: action.attackerId, targetId: defender.id };
        newState = applyStrictAction(newState, strict);
        newState = { ...newState, lastAction: { type: 'ATTACK', by: fromPlayer, unitId: action.attackerId, targetId: defender.id } };
        newState = this.decrementActions(newState);
        break;
      }
      case 'ROTATE': {
        newState = applyRotate(newState, action.unitId, action.targetPos);
        newState = { ...newState, lastAction: { type: 'ROTATE', by: fromPlayer, unitId: action.unitId, to: action.targetPos } };
        newState = this.decrementActions(newState);
        break;
      }
      case 'DEPLOY': {
        newState = applyDeployUnit(newState, action.unitType as any, action.targetPos);
        newState = { ...newState, lastAction: { type: 'DEPLOY', by: fromPlayer, unitType: action.unitType as any, to: action.targetPos } };
        const freeAvailable = newState.freeDeploymentsRemaining > 0 && !newState.hasActedThisTurn;
        if (freeAvailable) {
          newState = { ...newState, freeDeploymentsRemaining: newState.freeDeploymentsRemaining - 1 };
        } else {
          newState = this.decrementActions(newState);
        }
        break;
      }
      case 'END_TURN': {
        newState = applyStrictAction(newState, { type: 'END_TURN' });
        newState = { ...newState, lastAction: { type: 'END_TURN', by: fromPlayer } };
        break;
      }
      default:
        throw new Error('Unknown action');
    }

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
    if (controlsAllPoints(state, current)) return state;
    return endTurn(state);
  }

  // =========================================================================
  // Victory / Draw Checks
  // =========================================================================

  checkVictory(): PlayerId | null {
    if (controlsAllPoints(this.state, 0)) return 0;
    if (controlsAllPoints(this.state, 1)) return 1;
    const eliminated = checkElimination(this.state);
    if (eliminated === 0) return 1;
    if (eliminated === 1) return 0;
    return null;
  }

  checkDrawCondition(): DrawReason {
    return checkDraw(this.state);
  }

  // =========================================================================
  // Broadcasting
  // =========================================================================

  broadcastState(io: IOServer): void {
    io.to(this.roomName()).emit('STATE_UPDATE', { gameId: this.id, state: this.state });
  }

  roomName(): string {
    return `game:${this.id}`;
  }

  // =========================================================================
  // Inactivity Timer
  // =========================================================================

  startInactivityTimer(
    io: IOServer, 
    seconds = 30, 
    onTimeout?: () => void,
    onWin?: (winner: PlayerId) => void,
    onDraw?: (reason: DrawReason) => void
  ): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    // Don't start timer if game is not active
    if (!this.isActive()) {
      return;
    }

    const deadline = Date.now() + seconds * 1000;
    io.to(this.roomName()).emit('INACTIVITY_TIMER_START', {
      gameId: this.id,
      seconds,
      currentPlayer: this.state.currentPlayer,
      deadline,
    });

    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null;
      
      // Don't process if game ended while waiting
      if (!this.isActive()) {
        return;
      }

      const newState = endTurn(this.state);
      this.state = newState;
      this.broadcastState(io);

      const winner = this.checkVictory();
      if (winner !== null) {
        this.completeGame();
        setTimeout(() => {
          io.to(this.roomName()).emit('GAME_CONCLUDED', { gameId: this.id, winner });
          if (onWin) onWin(winner);
        }, 0);
        return;
      }

      const drawReason = this.checkDrawCondition();
      if (drawReason !== null) {
        this.completeGame();
        setTimeout(() => {
          io.to(this.roomName()).emit('GAME_DRAW', { gameId: this.id, reason: drawReason });
          if (onDraw) onDraw(drawReason);
        }, 0);
        return;
      }

      this.startInactivityTimer(io, seconds, undefined, onWin, onDraw);
    }, seconds * 1000);
  }

  cancelInactivityTimer(io?: IOServer): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
      if (io) {
        io.to(this.roomName()).emit('INACTIVITY_TIMER_CANCEL', { gameId: this.id });
      }
    }
  }
}
