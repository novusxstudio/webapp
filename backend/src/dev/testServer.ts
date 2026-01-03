// Full test server with game logic but NO database
// Use this for manual testing of reconnect, game flow, etc.

import "dotenv/config";
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { verifyAuthToken, type VerifiedUser } from '../auth/jwt';
import { GameManager } from '../game/GameManager';
import type { PlayerActionRequest } from '../types';

const PORT = parseInt(process.env.PORT || '3001', 10);

// Socket.data type is already extended in middleware.ts

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new IOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const manager = new GameManager();

// Auth middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) throw new Error("Missing token");
    const user = await verifyAuthToken(token);
    socket.data.user = user;
    console.log("[AUTH OK]", user.userId);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[AUTH FAIL]", message);
    next(new Error("Unauthorized"));
  }
});

// Game handlers
io.on('connection', (socket) => {
  const user = socket.data.user!;
  console.log(`[CONNECT] ${user.email ?? 'no-email'} (${user.userId})`);

  // Auto-reconnect check
  const reconnectResult = manager.handleReconnect(socket, user.userId, io);
  if (reconnectResult) {
    const { game, playerId } = reconnectResult;
    console.log(`[RECONNECT] ${user.userId} → game ${game.id} as P${playerId}`);
    socket.emit('RECONNECTED', {
      gameId: game.id,
      playerId,
      state: game.state,
      reconnectToken: game.getReconnectToken(playerId)
    });
  }

  // CREATE_GAME
  socket.on('CREATE_GAME', (_, cb?: (resp: any) => void) => {
    try {
      const resp = manager.createGame(socket, user.userId);
      console.log(`[CREATE] Game ${resp.gameId} by ${user.userId}`);
      if (cb) cb(resp);
      socket.emit('GAME_CREATED', resp);
      io.emit('AVAILABLE_GAMES', { games: manager.listAvailableGames() });
    } catch (err: any) {
      console.error("[CREATE ERROR]", err.message);
      socket.emit('ERROR', { message: err.message });
    }
  });

  // JOIN_GAME
  socket.on('JOIN_GAME', (payload: { gameId: string }, cb?: (resp: any) => void) => {
    try {
      const resp = manager.joinGame(socket, payload, user.userId);
      console.log(`[JOIN] ${user.userId} → game ${resp.gameId}`);
      if (cb) cb(resp);
      const game = manager.getGame(resp.gameId)!;
      io.to(game.roomName()).emit('GAME_JOINED', resp);
      game.broadcastState(io);
      
      if (game.areBothPlayersPresent()) {
        game.startInactivityTimer(io, 30, undefined, (winner) => {
          console.log(`[TIMEOUT WIN] P${winner} wins game ${game.id}`);
          manager.endGame(game.id);
        });
      }
      io.emit('AVAILABLE_GAMES', { games: manager.listAvailableGames() });
    } catch (err: any) {
      console.error("[JOIN ERROR]", err.message);
      socket.emit('ERROR', { message: err.message });
    }
  });

  // LIST_GAMES
  socket.on('LIST_GAMES', () => {
    socket.emit('AVAILABLE_GAMES', { games: manager.listAvailableGames() });
  });

  // CHECK_ACTIVE_GAME
  socket.on('CHECK_ACTIVE_GAME', () => {
    const game = manager.getActiveGameForUser(user.userId);
    if (game) {
      const playerId = game.getPlayerIdByUserId(user.userId);
      socket.emit('ACTIVE_GAME_FOUND', {
        gameId: game.id,
        playerId,
        state: game.state
      });
    } else {
      socket.emit('NO_ACTIVE_GAME');
    }
  });

  // PLAYER_ACTION
  socket.on('PLAYER_ACTION', (msg: PlayerActionRequest) => {
    try {
      const game = manager.getGame(msg.gameId);
      if (!game) throw new Error('Game not found');
      
      game.applyActionFromUser(user.userId, msg.action);
      console.log(`[ACTION] ${user.userId} in game ${game.id}: ${msg.action.kind}`);
      game.broadcastState(io);

      const winner = game.checkVictory();
      if (winner !== null) {
        game.completeGame();
        console.log(`[VICTORY] P${winner} wins game ${game.id}`);
        io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
        manager.endGame(game.id);
        return;
      }

      const drawReason = game.checkDrawCondition();
      if (drawReason) {
        game.completeGame();
        console.log(`[DRAW] Game ${game.id}: ${drawReason}`);
        io.to(game.roomName()).emit('GAME_DRAW', { gameId: game.id, reason: drawReason });
        manager.endGame(game.id);
        return;
      }

      if (game.areBothPlayersPresent()) {
        game.startInactivityTimer(io, 30, undefined, (winner) => {
          console.log(`[TIMEOUT WIN] P${winner} wins game ${game.id}`);
          manager.endGame(game.id);
        });
      }
    } catch (err: any) {
      console.error("[ACTION ERROR]", err.message);
      socket.emit('ERROR', { message: err.message });
    }
  });

  // LEAVE_GAME
  socket.on('LEAVE_GAME', (payload: { gameId: string }) => {
    try {
      const game = manager.getGame(payload.gameId);
      if (!game) throw new Error('Game not found');
      if (!game.isParticipant(user.userId)) throw new Error('Not a participant');

      const playerId = game.getPlayerIdByUserId(user.userId)!;
      const winner: 0 | 1 = playerId === 0 ? 1 : 0;
      game.abandonGame();
      console.log(`[LEAVE] ${user.userId} left game ${game.id}, P${winner} wins`);
      io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
      manager.endGame(game.id);
    } catch (err: any) {
      socket.emit('ERROR', { message: err.message });
    }
  });

  // SURRENDER
  socket.on('SURRENDER', (payload: { gameId: string }) => {
    try {
      const game = manager.getGame(payload.gameId);
      if (!game) throw new Error('Game not found');
      if (!game.isParticipant(user.userId)) throw new Error('Not a participant');
      if (!game.isActive()) throw new Error('Game not active');

      const playerId = game.getPlayerIdByUserId(user.userId)!;
      const winner: 0 | 1 = playerId === 0 ? 1 : 0;
      game.completeGame();
      console.log(`[SURRENDER] ${user.userId} surrendered game ${game.id}, P${winner} wins`);
      io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
      io.to(game.roomName()).emit('PLAYER_FORFEIT', { gameId: game.id, reason: 'surrender' });
      manager.endGame(game.id);
    } catch (err: any) {
      socket.emit('ERROR', { message: err.message });
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${user.userId}`);
    manager.handleDisconnect(socket, io, user.userId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== TEST SERVER (No DB) ===`);
  console.log(`Listening on port ${PORT}`);
  console.log(`AUTH_SECRET: ${process.env.AUTH_SECRET ? 'loaded' : 'MISSING!'}\n`);
});

