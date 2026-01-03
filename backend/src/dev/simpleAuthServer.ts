// Minimal test server: ONLY tests socket authentication
// No database, no game logic - just proves JWT wiring works
import "dotenv/config";
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { verifyAuthToken, type VerifiedUser } from '../auth/jwt';

const PORT = parseInt(process.env.PORT || '3001', 10);

// Note: Socket.data type is already extended in middleware.ts
// We just use it here

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

// Auth middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    
    if (!token) {
      throw new Error("Missing token");
    }

    const user = await verifyAuthToken(token);
    socket.data.user = user;

    console.log("[SOCKET AUTH OK]", user.userId);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[SOCKET AUTH FAIL]", message);
    next(new Error("Unauthorized"));
  }
});

// Simple handler
io.on('connection', (socket) => {
  const user = socket.data.user!;
  console.log(`[CONNECTED] ${user.email ?? 'no-email'} (${user.userId})`);

  // Test handler - no game logic
  socket.on('CREATE_GAME', () => {
    console.log("[HANDLER USER]", socket.data.user);
    socket.emit('GAME_CREATED', { 
      gameId: 'test-game-id',
      playerId: 0,
      message: 'This is a mock response - DB not connected'
    });
  });

  socket.on('disconnect', () => {
    console.log(`[DISCONNECTED] ${user.email ?? 'no-email'}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Simple Auth Server] Listening on port ${PORT}`);
  console.log(`[Simple Auth Server] AUTH_SECRET loaded: ${process.env.AUTH_SECRET ? 'YES' : 'NO'}`);
});

