# NovusX Multiplayer Backend

Authoritative Socket.IO server that owns the `GameState`, validates player intents, applies game rules, and broadcasts updates. It supports human vs human and human vs bot matches, inactivity and disconnect grace timers, and reconnect tokens.

## Quick Start

```bash
cd backend
npm install
npm run dev
```

- Default port: `3001`
- CORS: `*` for local/LAN development.

## Core Responsibilities

- Accept player intents (move, attack, rotate, deploy, end turn) and apply rules to the authoritative `GameState`.
- Manage per-game rooms, player socket bindings, and lifecycle (create, join, conclude, remove).
- Handle bots by enumerating valid actions and selecting moves.
- Provide reconnect and inactivity flows for resilient multiplayer.

## Important Files (Backend)

- [src/server.ts](src/server.ts): Socket.IO server entry.
  - Registers events: `CREATE_GAME`, `CREATE_BOT_GAME`, `JOIN_GAME`, `LIST_GAMES`, `LIST_BOTS`, `PLAYER_ACTION`, `RECONNECT`, `LEAVE_GAME`.
  - Locates the `GameInstance`, validates turn ownership, applies actions, broadcasts `STATE_UPDATE`, and emits `GAME_CONCLUDED` when a winner is detected.
  - Starts/cancels inactivity timers and updates lobby listings.

- [src/gameManager.ts](src/gameManager.ts): Orchestrates games across sockets.
  - Creates human vs human or human vs bot games; joins Player 1; tracks joinable games.
  - Starts disconnect grace on socket `disconnect` without canceling the inactivity timer.
  - Generates and stores reconnect tokens; ends games and cleans timers.

- [src/gameInstance.ts](src/gameInstance.ts): Per-match state and logic.
  - Holds `id`, `players` map (`PlayerId` → `socket.id`), `reconnectTokens`, timers, and `state`.
  - `applyPlayerAction()` routes intents into strict engine actions or rule helpers and decrements actions with `maybeEndTurnOnZero()`.
  - `executeBotTurn()` enumerates actions via strict engine and lets bots decide legal actions.
  - Timer APIs: `startDisconnectGrace()`, `cancelDisconnectGrace()`, `startInactivityTimer()`, `cancelInactivityTimer()`.
  - `broadcastState()` emits `STATE_UPDATE` to the game room; `checkVictory()` evaluates control points.

- [src/types.ts](src/types.ts): Backend messaging and shared types.
  - `PlayerAction` union and request/response shapes (`CreateGameResponse`, `JoinGameResponse`, etc.).
  - Re-exports `GameState`, `Position`, `Unit` for consistency.

- [src/logic/GameState.ts](src/logic/GameState.ts): Core model.
  - Types for `Position`, `UnitStats`, `Unit`, `Tile`, `Player`, `GameState`, and `LastAction`.

- [src/logic/rules.ts](src/logic/rules.ts): Game mechanics.
  - Movement (`canMove`/`applyMove`), rotation (including Cavalry-specific rules), deployment, attack resolution (matchups, LOS for Archers), control points, and `endTurn()`.

- [src/logic/setup.ts](src/logic/setup.ts): Board initialization.
  - `createInitialGrid()` creates a 5×5 grid of empty `Tile`s.

- [src/logic/units.ts](src/logic/units.ts): Unit stats catalog.
  - `UNIT_DATA` with ranges and type labels for Spearman, Swordsman, Archer, Shieldman, Cavalry.

- [src/engine/actions.ts](src/engine/actions.ts): Strict action engine used by bots and server.
  - Defines normalized `Action` types; enumerates `getAvailableActions()`; validates and `applyAction()` using rule functions.
  - Utility to check `includesAction()`.

- [src/bots/index.ts](src/bots/index.ts) & [src/bots/types.ts](src/bots/types.ts): Bot registry and interface.
  - `BOT_REGISTRY` maps bot IDs to factories; `Bot` interface exposes `decideAction()`.

## Socket Events (Contract)

- `CREATE_GAME` → `GAME_CREATED` with `{ gameId, playerId, state, reconnectToken }`.
- `CREATE_BOT_GAME` with `{ botId }` → `GAME_CREATED` and immediate bot setup.
- `JOIN_GAME` with `{ gameId }` → `GAME_JOINED` to room, plus `STATE_UPDATE`.
- `LIST_GAMES` → `AVAILABLE_GAMES` (joinable IDs).
- `LIST_BOTS` → `AVAILABLE_BOTS` (id/name).
- `PLAYER_ACTION` with `{ type: 'PLAYER_ACTION', gameId, action }` → `STATE_UPDATE`; may emit `GAME_CONCLUDED`.
- `RECONNECT` with `{ type: 'RECONNECT', gameId, playerId, reconnectToken }` → `RESUME_GAME` and grace cancel.
- `LEAVE_GAME` → `GAME_CONCLUDED` (opponent wins) and lobby refresh.

## Development Notes

- State is in-memory per process; restart clears games.
- All rule validation happens server-side; the frontend displays authoritative updates.
- Bot turns execute immediately when the bot is the current player.

## Test Quickly (Browser Console)

```js
// Load Socket.IO client
var s=document.createElement('script');
s.src='https://cdn.socket.io/4.7.2/socket.io.min.js';
document.head.appendChild(s);

// Connect
var socket = io('http://localhost:3001');
socket.emit('CREATE_GAME', {}, console.log);
socket.on('STATE_UPDATE', console.log);
```

