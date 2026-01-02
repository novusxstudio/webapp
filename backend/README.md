# NovusX Backend

Authoritative Socket.IO server that owns the `GameState`, validates player intents, applies game rules, and broadcasts updates. Supports human vs human, human vs scripted bots, and human vs RL-trained agents.

## Quick Start

```bash
cd backend
npm install
npm run dev
```

- Default port: `3001`
- CORS: `*` for local/LAN development

## Core Responsibilities

- Accept player intents (move, attack, rotate, deploy, end turn) and apply rules
- Manage per-game rooms, player socket bindings, and lifecycle
- Execute bot turns (scripted bots and RL agents via Python subprocess)
- Handle reconnection with tokens and grace periods
- Manage inactivity timers (disabled for bot games)

## Directory Structure

```
backend/src/
├── server.ts          # Socket.IO server entry point
├── gameManager.ts     # Game lifecycle orchestration
├── gameInstance.ts    # Per-game state and logic
├── types.ts           # Message contracts and shared types
├── logic/
│   ├── GameState.ts   # Core game model
│   ├── rules.ts       # Game mechanics (movement, combat, etc.)
│   ├── setup.ts       # Board initialization
│   └── units.ts       # Unit stats catalog
├── engine/
│   └── actions.ts     # Strict action engine for bots
└── bots/
    ├── index.ts       # Bot registry
    ├── types.ts       # Bot interface
    ├── EndTurnBot.ts  # Basic bot (just ends turn)
    ├── CavalryRushBot.ts  # Aggressive cavalry strategy
    ├── CounterBot.ts  # Reactive counter-play strategy
    └── RLAgentBot.ts  # Wrapper for RL-trained neural networks
```

## Key Files

### Server (`server.ts`)

Socket.IO event handlers:
- `CREATE_GAME` / `CREATE_BOT_GAME` - Start new games
- `JOIN_GAME` - Join existing game as Player 1
- `PLAYER_ACTION` - Process player moves
- `RECONNECT` - Restore session with token
- `LEAVE_GAME` / `SURRENDER` - End game early
- `REQUEST_REMATCH` / `ACCEPT_REMATCH` - Rematch flow

### Game Manager (`gameManager.ts`)

- Creates human and bot games
- Assigns player roles (RL agents: P0 bots → human is P1)
- Tracks joinable games
- Handles disconnect grace and reconnection

### Game Instance (`gameInstance.ts`)

- Holds authoritative `GameState`
- `applyPlayerAction()` - Validates and applies actions
- `executeBotTurn()` - Runs bot decision logic
- Timer management (inactivity, disconnect grace)
- `isBotGame()` helper to disable timers for bot matches

### Bots

| Bot | Strategy |
|-----|----------|
| `EndTurnBot` | Always ends turn (baseline) |
| `CavalryRushBot` | Aggressive cavalry deployment and attack |
| `CounterBot` | Reactive counter-play based on opponent |
| `RLAgentBot` | Calls Python `inference.py` for neural network actions |

RL agents are registered with IDs like `rl_agent_iter_1000_p0` and appear in the Bots page.

## Socket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `CREATE_GAME` | `{}` | Create human vs human game |
| `CREATE_BOT_GAME` | `{ botId }` | Create game vs bot |
| `JOIN_GAME` | `{ gameId }` | Join as Player 1 |
| `PLAYER_ACTION` | `{ gameId, action }` | Send move/attack/deploy/etc |
| `RECONNECT` | `{ gameId, playerId, reconnectToken }` | Restore session |
| `LEAVE_GAME` | `{ gameId }` | Forfeit game |
| `SURRENDER` | `{ gameId }` | Surrender (opponent wins) |
| `REQUEST_REMATCH` | `{ oldGameId }` | Request rematch |
| `ACCEPT_REMATCH` | `{ oldGameId }` | Accept rematch offer |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `STATE_UPDATE` | `{ gameId, state }` | New game state |
| `GAME_CONCLUDED` | `{ gameId, winner }` | Game ended |
| `OPPONENT_DISCONNECTED` | `{ gameId, graceSeconds }` | Opponent dropped |
| `RESUME_GAME` | `{ gameId, state }` | Reconnection successful |
| `INACTIVITY_TIMER_START` | `{ gameId, seconds, deadline }` | Timer warning |
| `REMATCH_OFFER` | `{ oldGameId }` | Opponent wants rematch |
| `REMATCH_STARTED` | `{ gameId, playerId, state }` | New game from rematch |

## Game Logic (`logic/`)

### rules.ts

- `canMove()` / `applyMove()` - Movement validation
- `canAttack()` / `applyAttack()` - Combat with matchups
- `canRotate()` / `applyRotate()` - Unit facing
- `canDeploy()` / `applyDeploy()` - Unit placement
- `checkVictory()` - Control point evaluation

### GameState.ts

Core types: `Position`, `Unit`, `Tile`, `Player`, `GameState`, `LastAction`

## Integration with RL System

The `RLAgentBot` wrapper:
1. Encodes `GameState` → observation vector
2. Spawns Python subprocess calling `rl/inference.py`
3. Decodes action index → game action
4. Falls back to heuristics if inference fails

## Development Notes

- State is in-memory; restart clears all games
- All validation is server-side; clients display updates
- Bot games have no inactivity timer
- RL agents require Python + PyTorch installed

## Quick Test (Browser Console)

```js
// Connect
var socket = io('http://localhost:3001');

// Create game
socket.emit('CREATE_GAME', {}, console.log);

// Listen for updates
socket.on('STATE_UPDATE', console.log);
```

