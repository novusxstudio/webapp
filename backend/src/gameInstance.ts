import { randomBytes } from 'crypto';
import type { Server as IOServer, Socket } from 'socket.io';
import type { PlayerId, PlayerAction, GameInstanceDescriptor } from './types';
import type { GameState, Position } from './logic/GameState';
import { createInitialGrid } from './logic/setup';
import { applyMove, applyAttack, applyRotate, applyDeployUnit, endTurn, controlsAllPoints, checkDraw, checkElimination, type DrawReason } from './logic/rules';
import { getAvailableActions as getAvailableStrictActions, applyAction as applyStrictAction, includesAction as includesStrictAction, type Action as StrictAction } from './engine/actions';
import { BOT_REGISTRY } from './bots';

// Authoritative game instance: owns state and applies actions using existing game logic
export class GameInstance implements GameInstanceDescriptor {
  id: string;
  players: Map<PlayerId, string> = new Map(); // playerId -> socket.id
  reconnectTokens: Map<PlayerId, string> = new Map();
  disconnectTimers: Map<PlayerId, NodeJS.Timeout> = new Map();
  inactivityTimer: NodeJS.Timeout | null = null;
  state: GameState;
  private botInstances: Map<PlayerId, import('./bots').Bot> = new Map();

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
    const initialDeploymentCounts = {
      swordsman: 0,
      shieldman: 0,
      axeman: 0,
      cavalry: 0,
      archer: 0,
      spearman: 0,
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

  addPlayer(playerId: PlayerId, socketId: string) {
    this.players.set(playerId, socketId);
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.players.has(playerId);
  }

  /**
   * Check if a player slot is filled (either by a human socket or a bot)
   */
  isPlayerPresent(playerId: PlayerId): boolean {
    return this.players.has(playerId) || !!this.state.players[playerId]?.isBot;
  }

  /**
   * Check if both players are present (human or bot)
   */
  areBothPlayersPresent(): boolean {
    return this.isPlayerPresent(0) && this.isPlayerPresent(1);
  }

  /**
   * Check if this is a bot game (either player is a bot)
   */
  isBotGame(): boolean {
    return !!this.state.players[0]?.isBot || !!this.state.players[1]?.isBot;
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
        // Route through strict engine for parity with bots
        const strict: StrictAction = { type: 'MOVE', unitId: action.unitId, to: action.target };
        newState = applyStrictAction(newState, strict);
        newState = { ...newState, lastAction: { type: 'MOVE', by: fromPlayer, unitId: action.unitId, to: action.target } };
        // decrement actions
        newState = this.decrementActions(newState);
        break;
      }
      case 'ATTACK': {
        // Convert to strict action by resolving defender at position
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
        // Place unit
        newState = applyDeployUnit(newState, action.unitType as any, action.targetPos);
        newState = { ...newState, lastAction: { type: 'DEPLOY', by: fromPlayer, unitType: action.unitType as any, to: action.targetPos } };
        // Determine free vs action spend
        const freeAvailable = newState.freeDeploymentsRemaining > 0 && !newState.hasActedThisTurn;
        if (freeAvailable) {
          // Free deployment: do not decrement deploymentsRemaining again (already done in applyDeployUnit)
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
        newState = applyStrictAction(newState, { type: 'END_TURN' });
        newState = { ...newState, lastAction: { type: 'END_TURN', by: fromPlayer } };
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

  isCurrentPlayerBot(): boolean {
    const current = this.state.currentPlayer as PlayerId;
    const player = this.state.players[current];
    return !!player?.isBot && !!player?.botId;
  }

  private getOrCreateBotInstance(playerId: PlayerId) {
    const existing = this.botInstances.get(playerId);
    if (existing) return existing;
    const botId = this.state.players[playerId].botId!;
    const factory = BOT_REGISTRY[botId];
    if (!factory) throw new Error(`Bot not found: ${botId}`);
    const instance = factory();
    this.botInstances.set(playerId, instance);
    return instance;
  }

  executeBotTurn(): void {
    const MAX_STEPS = 10;
    let steps = 0;
    while (this.isCurrentPlayerBot() && steps < MAX_STEPS) {
      steps++;
      const playerId = this.state.currentPlayer as PlayerId;
      const bot = this.getOrCreateBotInstance(playerId);
      const actions = getAvailableStrictActions(this.state, playerId);
      const action = bot.decideAction({ gameState: this.state, playerId, availableActions: actions });
      if (!includesStrictAction(actions, action)) {
        throw new Error('Bot attempted illegal action');
      }
      let newState = applyStrictAction(this.state, action);
      // Record lastAction for bot decisions
      switch (action.type) {
        case 'MOVE':
          newState = { ...newState, lastAction: { type: 'MOVE', by: playerId, unitId: action.unitId, to: action.to } };
          break;
        case 'ATTACK':
          newState = { ...newState, lastAction: { type: 'ATTACK', by: playerId, unitId: action.unitId, targetId: action.targetId } };
          break;
        case 'DEPLOY':
          newState = { ...newState, lastAction: { type: 'DEPLOY', by: playerId, unitType: action.unitType as any, to: action.to } };
          break;
        case 'END_TURN':
          newState = { ...newState, lastAction: { type: 'END_TURN', by: playerId } };
          break;
      }
      if (action.type === 'MOVE' || action.type === 'ATTACK' || action.type === 'DEPLOY' || action.type === 'ROTATE') {
        newState = this.decrementActions(newState);
      }
      this.state = this.maybeEndTurnOnZero(newState);
      // Break if turn passed to human
      if (!this.isCurrentPlayerBot()) break;
      // If END_TURN was chosen, current player changed; loop condition handles it
      // Otherwise continue performing bot actions until turn ends or step limit hit
    }
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

  // Determine if either player controls all control points or opponent is eliminated
  checkVictory(): PlayerId | null {
    // Control point victory
    if (controlsAllPoints(this.state, 0)) return 0;
    if (controlsAllPoints(this.state, 1)) return 1;
    
    // Elimination victory - if one player has no units and no deployments left
    const eliminated = checkElimination(this.state);
    if (eliminated === 0) return 1; // Player 0 eliminated, Player 1 wins
    if (eliminated === 1) return 0; // Player 1 eliminated, Player 0 wins
    
    return null;
  }

  // Check if game should end in a draw
  checkDrawCondition(): DrawReason {
    return checkDraw(this.state);
  }

  startInactivityTimer(io: IOServer, seconds = 30, onTimeout?: () => void, onWin?: (winner: PlayerId) => void, onDraw?: (reason: DrawReason) => void) {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    
    // Don't start inactivity timer if current player is a bot - bots act instantly
    if (this.isCurrentPlayerBot()) {
      // Cancel any displayed timer on the client since it's the bot's turn
      io.to(this.roomName()).emit('INACTIVITY_TIMER_CANCEL', { gameId: this.id });
      return;
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
        return;
      }
      
      // Check draw after endTurn
      const drawReason = this.checkDrawCondition();
      if (drawReason !== null) {
        setTimeout(() => {
          io.to(this.roomName()).emit('GAME_DRAW', { gameId: this.id, reason: drawReason });
          if (onDraw) onDraw(drawReason);
        }, 0);
        return;
      }
      
      // If it's now a bot's turn, execute bot actions
      if (this.isCurrentPlayerBot()) {
        this.executeBotTurn();
        this.broadcastState(io);
        const winner2 = this.checkVictory();
        if (winner2 !== null) {
          setTimeout(() => {
            io.to(this.roomName()).emit('GAME_CONCLUDED', { gameId: this.id, winner: winner2 });
            if (onWin) onWin(winner2);
          }, 0);
          return;
        }
        const drawReason2 = this.checkDrawCondition();
        if (drawReason2 !== null) {
          setTimeout(() => {
            io.to(this.roomName()).emit('GAME_DRAW', { gameId: this.id, reason: drawReason2 });
            if (onDraw) onDraw(drawReason2);
          }, 0);
          return;
        }
      }
      // Start the inactivity timer for the next human player's turn
      this.startInactivityTimer(io, seconds, undefined, onWin, onDraw);
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
