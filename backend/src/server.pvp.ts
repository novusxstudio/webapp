// Entry point for PvP-only deployment
// Combined game server + auth endpoints

import "dotenv/config";
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { SignJWT } from 'jose';
import { config, validateConfig } from './config';
import { socketAuthMiddleware } from './socket/middleware';
import { registerSocketHandlers } from './socket/handlers';
import { GameManager } from './game/GameManager';
import { prisma } from './db/client';

// Validate environment before starting
validateConfig();

// CORS headers helper
function setCorsHeaders(res: http.ServerResponse) {
  const origin = config.frontendUrl || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// Read request body
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

// Auth token endpoint - issues JWTs for authenticated users
async function handleAuthToken(req: http.IncomingMessage, res: http.ServerResponse) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const username = data.username?.trim();

    if (!username || username.length < 1 || username.length > 20) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username must be 1-20 characters' }));
      return;
    }

    // Validate username format (alphanumeric + underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username must be alphanumeric' }));
      return;
    }

    // Create JWT signed with AUTH_SECRET
    const secret = new TextEncoder().encode(config.authSecret);
    const token = await new SignJWT({
      email: `${username}@local`,
      name: username,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(username)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token,
      user: {
        id: username,
        email: `${username}@local`,
      }
    }));
    
    console.log(`[AUTH] Token issued for: ${username}`);
  } catch (err) {
    console.error('[AUTH] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to generate token' }));
  }
}

// HTTP Server - handles REST endpoints
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint for Railway
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Auth token endpoint
  if (url === '/api/auth/token') {
    await handleAuthToken(req, res);
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Socket.IO Server - handles real-time game communication
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
  if (prisma) {
    await prisma.$disconnect();
  }
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n🎮 NovusX PvP Server`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Frontend: ${config.frontendUrl}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET  /health          - Health check`);
  console.log(`   POST /api/auth/token  - Get auth token`);
  console.log(`   WS   /                - Socket.IO\n`);
});
