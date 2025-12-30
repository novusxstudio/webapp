import type { Server as IOServer, Socket } from 'socket.io';
import { GameInstance } from './gameInstance';
import type { PlayerId, PlayerAction, CreateGameResponse, JoinGameRequest, JoinGameResponse } from './types';

export class GameManager {
  private games: Map<string, GameInstance> = new Map();

  createGame(socket: Socket): CreateGameResponse {
    const game = new GameInstance();
    this.games.set(game.id, game);

    // Creator is Player 0
    game.addPlayer(0, socket.id);
    game.setReconnectToken(0, GameManager.generateToken());
    socket.join(game.roomName());

    return { gameId: game.id, playerId: 0, state: game.state, reconnectToken: game.getReconnectToken(0)! };
  }

  createBotGame(socket: Socket, botId: string): CreateGameResponse {
    const game = new GameInstance();
    this.games.set(game.id, game);

    // Player 0 is human
    game.addPlayer(0, socket.id);
    game.setReconnectToken(0, GameManager.generateToken());
    socket.join(game.roomName());

    // Player 1 is bot
    const p1 = game.state.players[1];
    game.state.players[1] = { ...p1, isBot: true, botId };

    return { gameId: game.id, playerId: 0, state: game.state, reconnectToken: game.getReconnectToken(0)! };
  }

  joinGame(socket: Socket, req: JoinGameRequest): JoinGameResponse {
    const game = this.games.get(req.gameId);
    if (!game) {
      throw new Error('Game does not exist');
    }

    // Player 1 slot must be free
    if (game.hasPlayer(1)) {
      throw new Error('Game already has Player 1');
    }

    game.addPlayer(1, socket.id);
    game.setReconnectToken(1, GameManager.generateToken());
    socket.join(game.roomName());

    return { gameId: game.id, playerId: 1, state: game.state, reconnectToken: game.getReconnectToken(1)! };
  }

  getGame(gameId: string): GameInstance | undefined {
    return this.games.get(gameId);
  }

  listAvailableGames(): string[] {
    // Joinable: game exists and Player 1 slot is free (not a bot)
    const ids: string[] = [];
    for (const [id, game] of this.games.entries()) {
      const p1IsBot = !!game.state.players[1]?.isBot;
      if (!game.hasPlayer(1) && !p1IsBot) ids.push(id);
    }
    return ids;
  }

  removeSocket(socket: Socket, io: IOServer) {
    // On disconnect, start grace timer for the affected player and keep inactivity timer running
    for (const [, game] of this.games.entries()) {
      for (const [pid, sid] of game.players.entries()) {
        if (sid === socket.id) {
          // Do NOT cancel inactivity timer; it should continue running independently
          game.startDisconnectGrace(pid, io, 60, () => this.endGame(game.id));
          return;
        }
      }
    }
  }

  endGame(gameId: string) {
    const game = this.games.get(gameId);
    if (game) {
      // Cancel any outstanding timers
      game.cancelDisconnectGrace(0);
      game.cancelDisconnectGrace(1);
      game.cancelInactivityTimer();
    }
    this.games.delete(gameId);
  }

  static generateToken(): string {
    // Simple random token
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
