# Backend Server

Authoritative game server for Grid Strategy Game.

## Quick Start

```powershell
npm install
npm run dev
```

Server runs on `http://localhost:3001`

## API Endpoints

### REST API

- `POST /api/games` - Create new game
  - Returns: `{ gameId: string, state: GameState }`

- `GET /api/games/:gameId` - Get game state
  - Returns: `{ state: GameState }`

### WebSocket

Connect to `ws://localhost:3001`

#### Messages from Client

**Join Game:**
```json
{
  "type": "join",
  "gameId": "game-123",
  "playerId": "A"
}
```

**Send Action:**
```json
{
  "type": "action",
  "action": {
    "type": "move",
    "unitId": "unit-1",
    "to": { "row": 2, "col": 3 }
  }
}
```

#### Messages from Server

**Game State Update:**
```json
{
  "type": "state",
  "state": { ...GameState }
}
```

**Error:**
```json
{
  "type": "error",
  "error": "Error message"
}
```

## Game Engine

All game logic is in [gameEngine.ts](src/gameEngine.ts):

- `createInitialGameState()` - Create new game
- `applyAction(state, action)` - Process and validate actions

## Development

- `npm run dev` - Development with hot reload (ts-node)
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled server
