// Entry point for PvP-only deployment
// Replaces server.ts for internet deployment

import "dotenv/config";
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { config, validateConfig } from './config';
import { socketAuthMiddleware } from './socket/middleware';
import { registerSocketHandlers } from './socket/handlers';
import { GameManager } from './game/GameManager';
import { prisma } from './db/client';

// Validate environment before starting
validateConfig();

const server = http.createServer((req, res) => {
  // Health check endpoint for Railway
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  res.writeHead(404);
  res.end();
});

const io = new IOServer(server, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 5000,
  pingTimeout: 8000,
});

// ORDER MATTERS:
// 1. Apply auth middleware FIRST
socketAuthMiddleware(io);

// 2. Then register handlers
const manager = new GameManager();
registerSocketHandlers(io, manager);

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  await prisma.$disconnect();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`[PvP Server] Listening on port ${config.port}`);
  console.log(`[PvP Server] Frontend URL: ${config.frontendUrl}`);
  console.log(`[PvP Server] Environment: ${config.nodeEnv}`);
});
