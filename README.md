# NovusX Webapp (Overall)

A small multiplayer strategy game where two players (or a player vs bot) place and maneuver units on a 5×5 grid to control three central points. The backend is authoritative: it owns and validates the `GameState`, applies actions, and broadcasts updates. The frontend renders the state and sends player intents.

## High-Level Architecture

- Backend (Node + Socket.IO):
  - Exposes events for creating/joining games, performing actions, listing bots/games, reconnection, and leaving.
  - Maintains per-game rooms and timers (inactivity and disconnect grace).
  - Applies mechanics via rule helpers and a strict action engine used by bots.
- Frontend (React + Vite + Socket.IO client):
  - Renders grid, units, HUD, and controls.
  - Subscribes to `STATE_UPDATE` and other server events.
  - Emits `PLAYER_ACTION` and session events (`CREATE_GAME`, `JOIN_GAME`, `RECONNECT`, `LEAVE_GAME`).

## Data & Gameplay Model

- Board: 5×5 tiles; units occupy tiles.
- Units: `Swordsman`, `Shieldman`, `Spearman`, `Cavalry`, `Archer` with move/attack ranges and matchup rules.
- Turns: Current player has a limited number of actions; some free deployments apply before acting.
- Victory: Control all three central points.

## Key Flows

- Create/Join:
  - Player creates a game → becomes Player 0; joiner becomes Player 1.
  - Bot games set Player 1 as a bot and start bot turns when applicable.
- Actions:
  - Frontend sends intents; server validates and applies (`MOVE`, `ATTACK`, `ROTATE`, `DEPLOY`, `END_TURN`).
  - Server broadcasts `STATE_UPDATE`; clients render immediately.
- Timers:
  - Inactivity timer ends turn when a player stalls; disconnect grace lets a player reconnect before forfeiting.
- Reconnect:
  - Clients store `reconnectToken` and reattach to seats with `RECONNECT`.

## Important Directories

- Backend: see [backend/README.md](backend/README.md) for per-file details.
- Frontend: see [frontend/README.md](frontend/README.md) for UI and integration.

## Local Development

- Start backend:
  ```bash
  cd backend
  npm install
  npm run dev
  ```
- Start frontend:
  ```bash
  cd frontend
  npm install
  echo VITE_SERVER_URL=http://localhost:3001 > .env
  npm run dev
  ```

Open `http://localhost:5173`, create a game, and play. For LAN, set `VITE_SERVER_URL` to `http://<your-lan-ip>:3001`.
