// Simplified GameManager for PvP-only deployment
// Removed: Bot game creation, rematch system (DEFERRED)
// Mode: IN-MEMORY ONLY - no database reads/writes during gameplay
// Feature: Reconnect support via userId → gameId mapping

import type { Server as IOServer, Socket } from 'socket.io';
import { GameInstance } from './GameInstance';
import type { PlayerId, CreateGameResponse, JoinGameRequest, JoinGameResponse } from '../types';

export class GameManager {
  // Active games by gameId
  private games: Map<string, GameInstance> = new Map();
  
  // userId → gameId mapping for reconnection
  // A user may have at most ONE active game
  private userToGame: Map<string, string> = new Map();

  /**
   * Create a new game (in-memory only)
   * Enforces: user can only be in one game at a time
   */
  createGame(socket: Socket, userId: string): CreateGameResponse {
    // Check if user already has an active game
    const existingGameId = this.userToGame.get(userId);
    if (existingGameId) {
      const existingGame = this.games.get(existingGameId);
      if (existingGame && !this.isGameOver(existingGame)) {
        throw new Error('You already have an active game');
      }
      // Clean up stale mapping
      this.userToGame.delete(userId);
    }

    const game = new GameInstance();
    this.games.set(game.id, game);

    const reconnectToken = GameManager.generateToken();
    game.addPlayer(0, socket.id, userId);
    game.setReconnectToken(0, reconnectToken);
    socket.join(game.roomName());

    // Track userId → gameId mapping
    this.userToGame.set(userId, game.id);

    return { 
      gameId: game.id, 
      playerId: 0, 
      state: game.state, 
      reconnectToken 
    };
  }

  /**
   * Join an existing game (in-memory only)
   * Enforces: user can only be in one game at a time
   */
  joinGame(
    socket: Socket, 
    req: JoinGameRequest, 
    userId: string
  ): JoinGameResponse {
    // Check if user already has an active game
    const existingGameId = this.userToGame.get(userId);
    if (existingGameId && existingGameId !== req.gameId) {
      const existingGame = this.games.get(existingGameId);
      if (existingGame && !this.isGameOver(existingGame)) {
        throw new Error('You already have an active game');
      }
      // Clean up stale mapping
      this.userToGame.delete(userId);
    }

    const game = this.games.get(req.gameId);
    if (!game) {
      throw new Error('Game does not exist');
    }

    if (game.hasPlayer(1)) {
      throw new Error('Game already has Player 1');
    }

    // Prevent self-join
    if (game.getUserId(0) === userId) {
      throw new Error('Cannot join your own game');
    }

    const reconnectToken = GameManager.generateToken();
    game.addPlayer(1, socket.id, userId);
    game.setReconnectToken(1, reconnectToken);
    socket.join(game.roomName());

    // Track userId → gameId mapping
    this.userToGame.set(userId, game.id);

    return { 
      gameId: game.id, 
      playerId: 1, 
      state: game.state, 
      reconnectToken 
    };
  }

  /**
   * Check if user has an active game they can reconnect to
   */
  getActiveGameForUser(userId: string): GameInstance | null {
    const gameId = this.userToGame.get(userId);
    if (!gameId) return null;

    const game = this.games.get(gameId);
    if (!game) {
      // Stale mapping, clean up
      this.userToGame.delete(userId);
      return null;
    }

    // Only return if game is still active
    if (this.isGameOver(game)) {
      this.userToGame.delete(userId);
      return null;
    }

    return game;
  }

  /**
   * Handle reconnection: reattach socket to existing game
   * Returns the playerId if successful, null if no game found
   */
  handleReconnect(socket: Socket, userId: string, io: IOServer): { game: GameInstance; playerId: PlayerId } | null {
    const game = this.getActiveGameForUser(userId);
    if (!game) return null;

    // Get player ID for this user
    const playerId = game.getPlayerIdByUserId(userId);
    if (playerId === null) {
      // User is not a participant (shouldn't happen, but defensive)
      this.userToGame.delete(userId);
      return null;
    }

    // Reconnect the player
    game.reconnectPlayer(playerId, socket.id, io);
    socket.join(game.roomName());

    return { game, playerId };
  }

  getGame(gameId: string): GameInstance | undefined {
    return this.games.get(gameId);
  }

  /**
   * List available games (in-memory only)
   * Games waiting for a second player
   */
  listAvailableGames(): string[] {
    const ids: string[] = [];
    for (const [id, game] of this.games.entries()) {
      if (!game.hasPlayer(1)) ids.push(id);
    }
    return ids;
  }

  /**
   * Handle socket disconnection
   * Starts grace period for reconnection
   */
  handleDisconnect(socket: Socket, io: IOServer, userId: string): void {
    const game = this.getActiveGameForUser(userId);
    if (!game) return;

    const playerId = game.getPlayerIdByUserId(userId);
    if (playerId === null) return;

    // Only start grace if this is the current socket for the player
    if (game.getPlayerSocketId(playerId) !== socket.id) {
      return; // Stale socket, ignore
    }

    console.log(`[Disconnect] User ${userId} disconnected from game ${game.id}, starting grace period`);
    
    game.startDisconnectGrace(playerId, io, 60, async () => {
      // Grace period expired - game is abandoned
      console.log(`[Abandon] User ${userId} did not reconnect, abandoning game ${game.id}`);
      this.endGame(game.id);
    });
  }

  /**
   * Clean up a game from memory
   * Called after game is completed/abandoned
   */
  endGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (game) {
      // Clean up timers
      game.cancelDisconnectGrace(0);
      game.cancelDisconnectGrace(1);
      game.cancelInactivityTimer();

      // Clean up userId → gameId mappings
      const user0 = game.getUserId(0);
      const user1 = game.getUserId(1);
      if (user0 && this.userToGame.get(user0) === gameId) {
        this.userToGame.delete(user0);
      }
      if (user1 && this.userToGame.get(user1) === gameId) {
        this.userToGame.delete(user1);
      }
    }
    this.games.delete(gameId);
  }

  /**
   * Check if a game is over (completed or abandoned)
   */
  private isGameOver(game: GameInstance): boolean {
    return game.status === 'COMPLETED' || game.status === 'ABANDONED';
  }

  static generateToken(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
