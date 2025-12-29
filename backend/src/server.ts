import http from 'http';
import { Server as IOServer } from 'socket.io';
import { GameManager } from './gameManager';
import type { PlayerActionRequest, ReconnectRequest } from './types';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const server = http.createServer();
const io = new IOServer(server, {
  cors: { origin: '*' },
  pingInterval: 5000,
  pingTimeout: 8000,
});

const manager = new GameManager();

io.on('connection', (socket) => {
  // Debug: log new WebSocket connections
  // eslint-disable-next-line no-console
  console.log('WS connected:', socket.id);
  // Create game
  socket.on('CREATE_GAME', (_, cb?: (resp: any) => void) => {
    try {
      const resp = manager.createGame(socket);
      if (cb) cb(resp);
      // Also emit to creator
      socket.emit('GAME_CREATED', resp);
      // Immediately broadcast initial state to the game room so the creator sees the board
      const game = manager.getGame(resp.gameId);
      if (game) {
        game.broadcastState(io);
        // Do not start inactivity timer until both players have joined
      }
      // Broadcast updated available games list to all clients
      io.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games: manager.listAvailableGames() });
    } catch (err: any) {
      socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
    }
  });

  // Join game
  socket.on('JOIN_GAME', (payload: { gameId: string }, cb?: (resp: any) => void) => {
    try {
      const resp = manager.joinGame(socket, payload);
      if (cb) cb(resp);
      // Notify both players with full state
      const game = manager.getGame(resp.gameId)!;
      io.to(game.roomName()).emit('GAME_JOINED', resp);
      game.broadcastState(io);
      // Start inactivity timer only when both players are present (30s)
      if (game.hasPlayer(0) && game.hasPlayer(1)) {
        game.startInactivityTimer(io, 30, undefined, () => {
          manager.endGame(game.id);
          io.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games: manager.listAvailableGames() });
        });
      }
      // Broadcast updated available games list to all clients (game no longer joinable by P1)
      io.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games: manager.listAvailableGames() });
    } catch (err: any) {
      socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
    }
  });

  // List available games (joinable)
  socket.on('LIST_GAMES', () => {
    try {
      const games = manager.listAvailableGames();
      socket.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games });
    } catch (err: any) {
      socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
    }
  });

  // Player action (authoritative server applies)
  socket.on('PLAYER_ACTION', (msg: PlayerActionRequest) => {
    try {
      const game = manager.getGame(msg.gameId);
      if (!game) throw new Error('Game not found');

      // Determine playerId from socket mapping
      let playerId: 0 | 1 | null = null;
      for (const [pid, sid] of game.players.entries()) {
        if (sid === socket.id) { playerId = pid; break; }
      }
      if (playerId === null) throw new Error('You are not a player in this game');

      // Validate turn ownership
      if (game.state.currentPlayer !== playerId) {
        throw new Error('Not your turn');
      }

      // Apply action using existing logic
      game.applyPlayerAction(playerId, msg.action);

      // First broadcast the updated state so the UI shows the move
      game.broadcastState(io);

      // Then check victory condition (all 3 control points)
      const winner = game.checkVictory();
      if (winner !== null) {
        // Defer conclusion to next tick so clients render the move first
        setTimeout(() => {
          io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
          manager.endGame(game.id);
          io.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games: manager.listAvailableGames() });
        }, 0);
        return;
      }

      // Reset/start inactivity timer only if both players are present (30s)
      if (game.hasPlayer(0) && game.hasPlayer(1)) {
        game.startInactivityTimer(io, 30, undefined, () => {
          manager.endGame(game.id);
          io.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games: manager.listAvailableGames() });
        });
      }
    } catch (err: any) {
      socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
    }
  });

  // Reconnect flow: reattach socket using token within grace window
  socket.on('RECONNECT', (msg: ReconnectRequest) => {
    try {
      const game = manager.getGame(msg.gameId);
      if (!game) throw new Error('Game not found');
      if (![0, 1].includes(msg.playerId)) throw new Error('Invalid player');
      const expected = game.getReconnectToken(msg.playerId);
      if (!expected || expected !== msg.reconnectToken) throw new Error('Invalid reconnect token');

      // Cancel grace timer and bind this socket to the seat; notify opponent
      game.cancelDisconnectGrace(msg.playerId, io);
      const oldId = game.bindPlayerSocket(msg.playerId, socket.id);
      socket.join(game.roomName());
      // Disconnect old socket if still connected
      if (oldId && oldId !== socket.id) {
        io.to(oldId).emit('SESSION_REPLACED', { gameId: game.id });
        const oldSock = io.sockets.sockets.get(oldId);
        oldSock?.disconnect(true);
      }
      // Send current state so client can resume
      socket.emit('RESUME_GAME', { gameId: game.id, state: game.state });
    } catch (err: any) {
      socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
    }
  });

  // Leave game: opponent wins, game concluded and removed
  socket.on('LEAVE_GAME', (payload: { gameId: string }) => {
    try {
      const game = manager.getGame(payload.gameId);
      if (!game) throw new Error('Game not found');

      // Determine playerId from socket mapping
      let playerId: 0 | 1 | null = null;
      for (const [pid, sid] of game.players.entries()) {
        if (sid === socket.id) { playerId = pid; break; }
      }
      if (playerId === null) throw new Error('You are not a player in this game');

      const winner: 0 | 1 = playerId === 0 ? 1 : 0;
      // Notify both players
      io.to(game.roomName()).emit('GAME_CONCLUDED', { gameId: game.id, winner });
      // Remove game from manager so it's no longer available
      manager.endGame(game.id);
      // Update lobby lists
      io.emit('AVAILABLE_GAMES', { type: 'AVAILABLE_GAMES', games: manager.listAvailableGames() });
    } catch (err: any) {
      socket.emit('ERROR', { message: err?.message ?? 'Unknown error' });
    }
  });

  socket.on('disconnect', () => {
    manager.removeSocket(socket, io);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Multiplayer server listening on port ${PORT}`);
});
