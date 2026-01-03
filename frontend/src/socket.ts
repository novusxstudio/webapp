/**
 * Centralized Socket.IO connection module
 * 
 * RULES:
 * - Only ONE socket instance exists
 * - Socket connects ONLY after auth token is available
 * - All pages import getSocket() - never create their own
 * - Socket.IO handles reconnection automatically
 */

import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;

if (!SERVER_URL) {
  console.error('[SOCKET] VITE_SERVER_URL not set in environment');
}

let socket: Socket | null = null;
let connectionPromise: Promise<Socket> | null = null;

/**
 * Connect to the backend with an auth token
 * Call this ONCE after Auth.js session is available
 */
export function connectSocket(token: string): Promise<Socket> {
  // If already connected with same token, return existing
  if (socket?.connected) {
    return Promise.resolve(socket);
  }
  
  // If connection in progress, return existing promise
  if (connectionPromise) {
    return connectionPromise;
  }
  
  // Disconnect any existing socket first
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  connectionPromise = new Promise((resolve, reject) => {
    console.log('[SOCKET] Connecting with token...');
    
    socket = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });

    const onConnect = () => {
      console.log('[SOCKET] Connected:', socket!.id);
      socket!.off('connect_error', onConnectError);
      resolve(socket!);
    };
    
    const onConnectError = (err: Error) => {
      console.error('[SOCKET] Connection error:', err.message);
      // If it's an auth error, reject immediately
      if (err.message === 'Unauthorized' || err.message.includes('auth')) {
        socket!.off('connect', onConnect);
        connectionPromise = null;
        socket?.disconnect();
        socket = null;
        reject(new Error('Authentication failed'));
      }
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onConnectError);

    socket.on('disconnect', (reason) => {
      console.log('[SOCKET] Disconnected:', reason);
      if (reason === 'io server disconnect') {
        connectionPromise = null;
      }
    });

    // Handle reconnection events
    socket.on('RECONNECTED', (data: { gameId: string; state: any }) => {
      console.log('[SOCKET] Server acknowledged reconnect to game:', data.gameId);
    });

    socket.on('NO_ACTIVE_GAME', () => {
      console.log('[SOCKET] No active game to reconnect to');
    });
  });

  return connectionPromise;
}

/**
 * Get the current socket instance
 * Throws if socket not connected - catch this to redirect to login
 */
export function getSocket(): Socket {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected - user must authenticate first');
  }
  return socket;
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket !== null && socket.connected;
}

/**
 * Disconnect and cleanup
 * Call on logout
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    connectionPromise = null;
    console.log('[SOCKET] Manually disconnected');
  }
}

/**
 * Get socket instance without throwing (for optional operations)
 */
export function getSocketOrNull(): Socket | null {
  return socket?.connected ? socket : null;
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      socket?.disconnect();
    } catch {}
  });
}
