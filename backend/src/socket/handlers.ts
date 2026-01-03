// Socket event handlers for PvP game flow
// Simplified from original server.ts - NO BOTS
// Database: WRITE-ONLY mode - only saves completed games
// Feature: Auto-reconnect on socket connect via userId

import type { Server as IOServer, Socket } from 'socket.io';
import { getAuthenticatedUser } from './middleware';
import { GameManager } from '../game/GameManager';
import type { PlayerActionRequest } from '../types';
import { ensureUser, saveCompletedGame } from '../db/gameStore';

export function registerSocketHandlers(io: IOServer, manager: GameManager): void {
  io.on('connection', async (socket: Socket) => {
    // Get authenticated user from socket.data (set by middleware)
    const user = getAuthenticatedUser(socket);
    console.log(`[WS] Connected: ${user.email ?? 'no-email'} (${user.userId})`);

    // Ensure user exists in DB (fire-and-forget, won't block)
    ensureUser(user.userId);

    // =========================================================================
    // AUTO-RECONNECT: Check if user has an active game
    // =========================================================================
    const reconnectResult = manager.handleReconnect(socket, user.userId, io);
    if (reconnectResult) {
      const { game, playerId } = reconnectResult;
      console.log(`[Auto-Reconnect] User ${user.userId} reconnected to game ${game.id} as player ${playerId}`);
      
      // Send current game state to reconnected player
      socket.emit('RECONNECTED', { 
        gameId: game.id, 
        playerId, 
        state: game.state,
        reconnectToken: game.getReconnectToken(playerId)
      });
    }

    // =========================================================================
    // CREATE_GAME - Create a new PvP game
    // =========================================================================
    socket.on('CREATE_GAME', async (_, cb?: (resp: any) => void) => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }
      
      try {
        const resp = manager.createGame(socket, user.userId);
        if (cb) cb(resp);
        socket.emit('GAME_CREATED', resp);
        
        const game = manager.getGame(resp.gameId);
        if (game) {
          game.broadcastState(io);
        }
        
        // Broadcast updated lobby (in-memory only)
        io.emit('AVAILABLE_GAMES', { 
          type: 'AVAILABLE_GAMES', 
          games: manager.listAvailableGames() 
        });
      } catch (err: any) {
        socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
      }
    });

    // =========================================================================
    // JOIN_GAME - Join an existing PvP game
    // =========================================================================
    socket.on('JOIN_GAME', async (payload: { gameId: string }, cb?: (resp: any) => void) => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }
      
      try {
        const resp = manager.joinGame(socket, payload, user.userId);
        if (cb) cb(resp);
        
        const game = manager.getGame(resp.gameId)!;
        io.to(game.roomName()).emit('GAME_JOINED', resp);
        game.broadcastState(io);
        
        // Start inactivity timer
        if (game.areBothPlayersPresent()) {
          game.startInactivityTimer(io, 30, undefined, async (winner) => {
            // Game ended via inactivity - save to DB
            const winnerId = game.getUserId(winner);
            await saveCompletedGame(game, winnerId ?? null);
            manager.endGame(game.id);
          });
        }
        
        io.emit('AVAILABLE_GAMES', { 
          type: 'AVAILABLE_GAMES', 
          games: manager.listAvailableGames() 
        });
      } catch (err: any) {
        socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
      }
    });

    // =========================================================================
    // LIST_GAMES - Get available games to join (in-memory only)
    // =========================================================================
    socket.on('LIST_GAMES', () => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }
      
      const games = manager.listAvailableGames();
      socket.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games });
    });

    // =========================================================================
    // PLAYER_ACTION - Submit a game action
    // =========================================================================
    socket.on('PLAYER_ACTION', async (msg: PlayerActionRequest) => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }
      
      try {
        const game = manager.getGame(msg.gameId);
        if (!game) throw new Error('Game not found');

        // Apply action using the hardened method
        // This validates: game active, user is participant, user's turn
        game.applyActionFromUser(user.userId, msg.action);
        game.broadcastState(io);

        // NO database write during gameplay - games run in memory only

        // Check victory
        const winner = game.checkVictory();
        if (winner !== null) {
          game.completeGame();
          const winnerId = game.getUserId(winner);
          
          // WRITE-ONLY: Save completed game to DB
          await saveCompletedGame(game, winnerId ?? null);
          
          setTimeout(() => {
            io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
            manager.endGame(game.id);
          }, 0);
          return;
        }

        // Check draw
        const drawReason = game.checkDrawCondition();
        if (drawReason !== null) {
          game.completeGame();
          
          // WRITE-ONLY: Save completed game to DB (draw = null winner)
          await saveCompletedGame(game, null);
          
          setTimeout(() => {
            io.to(game.roomName()).emit('GAME_DRAW', { gameId: game.id, reason: drawReason });
            manager.endGame(game.id);
          }, 0);
          return;
        }

        // Reset inactivity timer
        if (game.areBothPlayersPresent()) {
          game.startInactivityTimer(io, 30, undefined, async (winner) => {
            const winnerId = game.getUserId(winner);
            await saveCompletedGame(game, winnerId ?? null);
            manager.endGame(game.id);
          });
        }
      } catch (err: any) {
        socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
      }
    });

    // =========================================================================
    // CHECK_ACTIVE_GAME - Explicit check for reconnectable game
    // =========================================================================
    socket.on('CHECK_ACTIVE_GAME', () => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }

      const game = manager.getActiveGameForUser(user.userId);
      if (game) {
        const playerId = game.getPlayerIdByUserId(user.userId);
        socket.emit('ACTIVE_GAME_FOUND', {
          gameId: game.id,
          playerId,
          state: game.state,
          reconnectToken: playerId !== null ? game.getReconnectToken(playerId) : undefined
        });
      } else {
        socket.emit('NO_ACTIVE_GAME');
      }
    });

    // =========================================================================
    // LEAVE_GAME - Forfeit the game
    // =========================================================================
    socket.on('LEAVE_GAME', async (payload: { gameId: string }) => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }
      
      try {
        const game = manager.getGame(payload.gameId);
        if (!game) throw new Error('Game not found');

        // Validate participant
        if (!game.isParticipant(user.userId)) {
          throw new Error('You are not a player in this game');
        }

        const playerId = game.getPlayerIdByUserId(user.userId)!;
        const winner: 0 | 1 = playerId === 0 ? 1 : 0;
        const winnerId = game.getUserId(winner);
        
        game.abandonGame();
        
        // WRITE-ONLY: Save abandoned game to DB
        await saveCompletedGame(game, winnerId ?? null);
        
        io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
        manager.endGame(game.id);
      } catch (err: any) {
        socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
      }
    });

    // =========================================================================
    // SURRENDER - Concede the game
    // =========================================================================
    socket.on('SURRENDER', async (payload: { gameId: string }) => {
      if (!socket.data.user) {
        socket.emit('ERROR', { message: 'Unauthenticated socket' });
        return;
      }
      
      try {
        const game = manager.getGame(payload.gameId);
        if (!game) throw new Error('Game not found');

        // Validate participant
        if (!game.isParticipant(user.userId)) {
          throw new Error('You are not a player in this game');
        }

        // Can only surrender active games
        if (!game.isActive()) {
          throw new Error('Game is not active');
        }

        const playerId = game.getPlayerIdByUserId(user.userId)!;
        const winner: 0 | 1 = playerId === 0 ? 1 : 0;
        const winnerId = game.getUserId(winner);
        
        game.completeGame();
        
        // WRITE-ONLY: Save surrendered game to DB
        await saveCompletedGame(game, winnerId ?? null);
        
        io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
        io.to(game.roomName()).emit('PLAYER_FORFEIT', { gameId: game.id, reason: 'surrender' });
        manager.endGame(game.id);
      } catch (err: any) {
        socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
      }
    });

    // =========================================================================
    // DISCONNECT - Handle disconnection (starts grace period)
    // =========================================================================
    socket.on('disconnect', () => {
      if (!socket.data.user) return; // Should never happen
      
      console.log(`[WS] Disconnected: ${user.email ?? 'no-email'} (${user.userId})`);
      manager.handleDisconnect(socket, io, user.userId);
    });
  });
}
