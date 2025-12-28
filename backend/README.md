# NovusX Multiplayer Backend (Minimalist)

Authoritative WebSocket server that reuses the existing frontend game logic without changing rules.

## Run Locally

```bash
cd backend
npm install
npm run dev
```

Server listens on `http://localhost:3001`.

## Socket Events

- `CREATE_GAME`: creator becomes Player 0
  - Response: `{ gameId, playerId: 0, state }`
- `JOIN_GAME`: join with `{ gameId }`, joiner becomes Player 1
  - Broadcast: `{ gameId, playerId: 1, state }` to both players
  - Also emits `STATE_UPDATE` with full authoritative state
- `PLAYER_ACTION`: `{ type: 'PLAYER_ACTION', gameId, action }`
  - Applies action if it's your turn and you are Player 0/1 in the game
  - Broadcasts `STATE_UPDATE` with updated state

## Notes
- The backend imports and uses `frontend/src/game/*` logic directly. Do not modify frontend logic.
- Games live in memory keyed by `gameId`.
- CORS: allowed for any origin; safe for local development.

## Quick Client Test (DevTools)
You can test without changing the frontend by using Socket.IO client in the browser console:

```js
// Load socket.io client (once per page)
var s=document.createElement('script');
s.src='https://cdn.socket.io/4.7.2/socket.io.min.js';
document.head.appendChild(s);

// Connect to backend
var socket = io('http://localhost:3001');

// Create a game as Player 0
socket.emit('CREATE_GAME', null, console.log);
// Note the gameId from the response

// On another device/browser, join the game
var socket2 = io('http://<your-ip>:3001');
socket2.emit('JOIN_GAME', { gameId: '<id>' }, console.log);

// Listen for state updates
socket.on('STATE_UPDATE', console.log);
socket2.on('STATE_UPDATE', console.log);
```

To play across devices with the existing UI, we need a thin client integration in the frontend that forwards UI actions to the backend and renders `STATE_UPDATE`. This keeps rules untouched. If you want, I can add that next.
