# NovusX Frontend (React + Vite)

SPA that renders the game UI, connects to the backend via Socket.IO, and displays the authoritative `GameState`. Routing is hash-based for simple navigation across Lobby, Join, Waiting, Bots, Play, and Game screens.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Create `.env` in `frontend/` for LAN or remote backend:

```
VITE_SERVER_URL=http://<your-lan-ip-or-host>:3001
```

Open `http://localhost:5173` (or `http://<your-lan-ip>:5173` from another device).

## Important Backend Files (as referenced by the UI)

- [backend/src/server.ts](../backend/src/server.ts): Socket.IO server. Emits `STATE_UPDATE`, `GAME_CONCLUDED`, timers, and lobby events used by the UI.
- [backend/src/gameManager.ts](../backend/src/gameManager.ts): Creates and tracks games; used by `JOIN_GAME`, `LIST_GAMES`, `CREATE_BOT_GAME` flows the UI triggers.
- [backend/src/gameInstance.ts](../backend/src/gameInstance.ts): Holds per-game `GameState`, applies actions, and emits updates the UI subscribes to.
- [backend/src/types.ts](../backend/src/types.ts): Message contracts. Frontend sends `PLAYER_ACTION` matching these shapes.
- [backend/src/logic/GameState.ts](../backend/src/logic/GameState.ts): Authoritative data model mirrored by the frontend for typing.
- [backend/src/logic/rules.ts](../backend/src/logic/rules.ts): Mechanics applied by the server; the UI aligns UX affordances with these rules but defers to server.
- [backend/src/bots/index.ts](../backend/src/bots/index.ts): Bot registry. UI can list bots and start bot games.

## Important Frontend Files

- [src/main.tsx](src/main.tsx): App bootstrap and simple hash routing.
- [src/App.tsx](src/App.tsx): Game container. Subscribes to server events, renders board/HUD, and emits `PLAYER_ACTION`s.
- [src/socket.ts](src/socket.ts): Socket.IO client bound to `VITE_SERVER_URL`.
- [src/game/GameState.ts](src/game/GameState.ts): Frontend model types for `GameState` used by UI components.
- [src/game/rules.ts](src/game/rules.ts): UI helpers aligned with backend rules (server remains authoritative).
- [src/ui/*](src/ui): Components for board, units, HUD, pickers, overlays, and audio.

## Common Flows

- Create Game: UI sends `CREATE_GAME` → receives `GAME_CREATED` → navigates to game route.
- Join Game: UI sends `JOIN_GAME` → receives `GAME_JOINED` and `STATE_UPDATE`.
- Player Actions: UI emits `PLAYER_ACTION` → server validates, applies, emits `STATE_UPDATE`.
- Reconnect: UI emits `RECONNECT` with stored token → server sends `RESUME_GAME`.

## Notes

- The server is the source of truth for rules and state; the UI renders updates.
- Ensure `VITE_SERVER_URL` matches the backend host/port for LAN play.

