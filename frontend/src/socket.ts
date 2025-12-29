import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;

if (!SERVER_URL) {
  // Surface a clear error to help with LAN setup
  // eslint-disable-next-line no-console
  console.error('VITE_SERVER_URL is not set. Create frontend/.env with VITE_SERVER_URL=http://<LAN_IP>:3001');
}

export const socket: Socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
});

// Temporary debug logging for LAN connectivity
socket.on('connect', () => {
  // eslint-disable-next-line no-console
  console.log('WS connected:', socket.id, 'to', SERVER_URL);
});

socket.on('connect_error', (err) => {
  // eslint-disable-next-line no-console
  console.error('WS connect error:', err);
});

// Explicitly disconnect on tab close/refresh to avoid ghost sessions
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try { socket.disconnect(); } catch {}
  });
}
