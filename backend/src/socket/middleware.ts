/**
 * Socket.IO authentication middleware
 * Verifies JWT on connection and attaches user to socket.data
 * 
 * Note: SocketData type is extended in src/types/socket.d.ts
 */

import type { Server as IOServer, Socket } from 'socket.io';
import { verifyAuthToken, type VerifiedUser } from '../auth/jwt';

/**
 * Apply authentication middleware to Socket.IO server
 * Must be called BEFORE registering handlers
 */
export function socketAuthMiddleware(io: IOServer): void {
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      // Extract token from handshake auth
      const token = socket.handshake.auth?.token as string | undefined;
      
      if (!token) {
        throw new Error("Missing token");
      }

      // Verify JWT and extract user
      const user = await verifyAuthToken(token);

      // Attach identity to socket.data (the ONLY source of identity)
      socket.data.user = user;

      console.log("[SOCKET AUTH OK]", user.userId);
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[SOCKET AUTH FAIL]", message);
      next(new Error("Unauthorized"));
    }
  });
}

/**
 * Get authenticated user from socket.data
 * Throws if not authenticated (should never happen after middleware)
 * 
 * Call this at the start of every handler to enforce the invariant
 */
export function getAuthenticatedUser(socket: Socket): VerifiedUser {
  if (!socket.data.user) {
    throw new Error("Unauthenticated socket");
  }
  return socket.data.user;
}
