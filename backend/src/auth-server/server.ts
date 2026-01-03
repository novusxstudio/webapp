/**
 * Standalone Auth.js Authentication Server
 * 
 * Issues JWTs compatible with the existing backend verification.
 * Runs on port 3002, completely isolated from game server.
 * 
 * Endpoints:
 *   POST /api/auth/signin - Sign in with username, returns JWT
 *   GET  /api/auth/session - Get current session (for debugging)
 * 
 * Usage:
 *   npm run auth-server
 */

import 'dotenv/config';
import http from 'http';
import { Auth } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import type { AuthConfig } from '@auth/core';

const PORT = parseInt(process.env.AUTH_PORT || '3002', 10);
const AUTH_SECRET = process.env.AUTH_SECRET;

if (!AUTH_SECRET) {
  console.error('❌ AUTH_SECRET is required');
  process.exit(1);
}

// Auth.js configuration
const authConfig: AuthConfig = {
  secret: AUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Username',
      credentials: {
        username: { label: 'Username', type: 'text' },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        
        if (!username || username.trim().length < 1) {
          return null;
        }

        // Return user object - this becomes the JWT payload
        return {
          id: username.trim(),
          email: `${username.trim()}@local`,
          name: username.trim(),
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      // On sign in, add user info to token
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      // Add token info to session
      if (token.sub) {
        session.user = {
          id: token.sub,
          email: token.email as string | null,
          name: token.name as string | null,
        };
      }
      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
};

// Convert Node.js IncomingMessage to Web Request
function toWebRequest(req: http.IncomingMessage, body: string): Request {
  const protocol = 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || '/', `${protocol}://${host}`);
  
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }

  const init: RequestInit = {
    method: req.method || 'GET',
    headers,
  };

  // Add body for POST requests
  if (req.method === 'POST' && body) {
    init.body = body;
  }

  return new Request(url.toString(), init);
}

// Convert Web Response to Node.js response
async function sendWebResponse(res: http.ServerResponse, webResponse: Response) {
  res.statusCode = webResponse.status;
  
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = await webResponse.text();
  res.end(body);
}

// Simple CORS headers
function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// Custom endpoint to get raw JWT for frontend
async function handleGetToken(req: http.IncomingMessage, res: http.ServerResponse, body: string) {
  setCorsHeaders(res);
  
  try {
    const data = JSON.parse(body);
    const username = data.username?.trim();

    if (!username) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Username is required' }));
      return;
    }

    // Create JWT directly using jose (same as backend verification expects)
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(AUTH_SECRET);
    
    const token = await new SignJWT({
      email: `${username}@local`,
      name: username,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(username)  // This becomes userId in backend
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 
      token,
      user: {
        id: username,
        email: `${username}@local`,
      }
    }));
  } catch (err) {
    console.error('[AUTH] Token generation error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to generate token' }));
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Collect body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  
  await new Promise<void>(resolve => req.on('end', resolve));

  const url = req.url || '/';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  // Health check
  if (url === '/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Custom token endpoint for frontend (simpler than Auth.js flow)
  if (url === '/api/token' && req.method === 'POST') {
    await handleGetToken(req, res, body);
    return;
  }

  // Auth.js routes
  if (url.startsWith('/api/auth')) {
    try {
      const webRequest = toWebRequest(req, body);
      const response = await Auth(webRequest, authConfig);
      setCorsHeaders(res);
      await sendWebResponse(res, response);
    } catch (err) {
      console.error('[AUTH] Error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // 404 for unknown routes
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔐 Auth Server running on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/token     - Get JWT (simple)`);
  console.log(`  POST /api/auth/*    - Auth.js routes`);
  console.log(`  GET  /health        - Health check`);
  console.log(`\nExample:`);
  console.log(`  curl -X POST http://localhost:${PORT}/api/token \\`);
  console.log(`       -H "Content-Type: application/json" \\`);
  console.log(`       -d '{"username": "player1"}'`);
  console.log('');
});

