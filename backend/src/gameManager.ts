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
    socket.join(game.roomName());

    return { gameId: game.id, playerId: 0, state: game.state };
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
    socket.join(game.roomName());

    return { gameId: game.id, playerId: 1, state: game.state };
  }

  getGame(gameId: string): GameInstance | undefined {
    return this.games.get(gameId);
  }

  listAvailableGames(): string[] {
    // Joinable: game exists and Player 1 slot is free
    const ids: string[] = [];
    for (const [id, game] of this.games.entries()) {
      if (!game.hasPlayer(1)) ids.push(id);
    }
    return ids;
  }

  removeSocket(socket: Socket) {
    // If desired, clean up player-slot mappings or end games when both leave
    // For now, no-op: games persist in memory.
  }

  endGame(gameId: string) {
    this.games.delete(gameId);
  }
}
