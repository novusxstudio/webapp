import type { Server as IOServer, Socket } from 'socket.io';
import { GameInstance } from './gameInstance';
import type { PlayerId, PlayerAction, CreateGameResponse, JoinGameRequest, JoinGameResponse } from './types';

export class GameManager {
  private games: Map<string, GameInstance> = new Map();
  // Recently concluded games kept briefly for rematch handshake
  private recentGames: Map<string, { p0?: string; p1?: string; expiresAt: number }> = new Map();
  // Track outstanding rematch offers by old gameId -> requester socketId
  private rematchOffers: Map<string, string> = new Map();

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

    // For RL agents, assign roles based on which agent is being challenged:
    // - agent_p0 was trained as player 0, so human should be player 1
    // - agent_p1 was trained as player 1, so human should be player 0
    // For other bots, human is always player 0
    const isRLAgentP0 = botId.includes('rl_agent_') && botId.includes('_p0');
    const humanPlayerId: 0 | 1 = isRLAgentP0 ? 1 : 0;
    const botPlayerId: 0 | 1 = isRLAgentP0 ? 0 : 1;

    // Human player
    game.addPlayer(humanPlayerId, socket.id);
    game.setReconnectToken(humanPlayerId, GameManager.generateToken());
    socket.join(game.roomName());

    // Bot player
    const botPlayer = game.state.players[botPlayerId];
    game.state.players[botPlayerId] = { ...botPlayer, isBot: true, botId };

    return { gameId: game.id, playerId: humanPlayerId, state: game.state, reconnectToken: game.getReconnectToken(humanPlayerId)! };
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
      // Record participants for rematch window (60s)
      const p0 = game.getPlayerSocketId(0);
      const p1 = game.getPlayerSocketId(1);
      this.recentGames.set(gameId, { p0, p1, expiresAt: Date.now() + 60_000 });
      // Schedule cleanup
      setTimeout(() => {
        const rec = this.recentGames.get(gameId);
        if (rec && rec.expiresAt <= Date.now()) {
          this.recentGames.delete(gameId);
          this.rematchOffers.delete(gameId);
        }
      }, 60_000);
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

  /**
   * Register a rematch request and notify the opponent. Returns opponent socket id if found.
   */
  requestRematch(oldGameId: string, requesterSocketId: string, io: IOServer): string | null {
    const rec = this.recentGames.get(oldGameId);
    if (!rec) return null;
    // If an offer is already pending for this game, disallow new offers
    if (this.rematchOffers.has(oldGameId)) return null;
    const isP0 = rec.p0 === requesterSocketId;
    const isP1 = rec.p1 === requesterSocketId;
    if (!isP0 && !isP1) return null;
    const opponent = isP0 ? rec.p1 : rec.p0;
    if (!opponent) return null;
    // Opponent must be currently connected
    const oppSock = io.sockets.sockets.get(opponent);
    if (!oppSock || oppSock.disconnected) return null;
    // Record offer
    this.rematchOffers.set(oldGameId, requesterSocketId);
    // Notify opponent
    io.to(opponent).emit('REMATCH_OFFER', { oldGameId });
    return opponent;
  }

  /**
   * Accept a rematch offer; creates a new game with same seats and returns response for each player.
   */
  acceptRematch(oldGameId: string, accepterSocketId: string): { p0?: { socketId: string; resp: ReturnType<GameManager['createGame']> }, p1?: { socketId: string; resp: ReturnType<GameManager['createGame']> } } | null {
    const rec = this.recentGames.get(oldGameId);
    if (!rec) return null;
    const offerBy = this.rematchOffers.get(oldGameId);
    if (!offerBy) return null;
    const isP0Accepter = rec.p0 === accepterSocketId;
    const isP1Accepter = rec.p1 === accepterSocketId;
    if (!isP0Accepter && !isP1Accepter) return null;
    // Ensure offer/accepter are the two participants
    const p0Sock = rec.p0;
    const p1Sock = rec.p1;
    if (!p0Sock || !p1Sock) return null;

    // Create new game and bind both players to their original seats
    const game = new GameInstance();
    this.games.set(game.id, game);
    // Player 0
    game.addPlayer(0, p0Sock);
    game.setReconnectToken(0, GameManager.generateToken());
    // Player 1
    game.addPlayer(1, p1Sock);
    game.setReconnectToken(1, GameManager.generateToken());

    // Prepare responses for both players with correct playerId
    const p0Resp = { gameId: game.id, playerId: 0 as 0 | 1, state: game.state, reconnectToken: game.getReconnectToken(0)! };
    const p1Resp = { gameId: game.id, playerId: 1 as 0 | 1, state: game.state, reconnectToken: game.getReconnectToken(1)! };

    // Clear old offer; keep recentGames entry until cleanup timeout to avoid race
    this.rematchOffers.delete(oldGameId);

    return {
      p0: { socketId: p0Sock, resp: p0Resp },
      p1: { socketId: p1Sock, resp: p1Resp },
    };
  }

  /**
   * Decline a rematch; notify requester if present.
   */
  declineRematch(oldGameId: string, declinerSocketId: string): string | null {
    const rec = this.recentGames.get(oldGameId);
    const offerBy = this.rematchOffers.get(oldGameId);
    if (!rec || !offerBy) return null;
    const isParticipant = rec.p0 === declinerSocketId || rec.p1 === declinerSocketId;
    if (!isParticipant) return null;
    this.rematchOffers.delete(oldGameId);
    return offerBy;
  }
}
