# NovusX Frontend

React SPA that renders the game UI, connects to the backend via Socket.IO, and displays the authoritative `GameState`. Uses hash-based routing for Lobby, Join, Waiting, Bots, Play, and Game screens.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Create `.env` for LAN or remote backend:
```
VITE_SERVER_URL=http://localhost:3001
```

Open `http://localhost:5173`

## Directory Structure

```
frontend/src/
├── main.tsx           # App bootstrap and hash routing
├── App.tsx            # Game container, socket subscriptions
├── socket.ts          # Socket.IO client
├── LobbyPage.tsx      # Main menu
├── PlayPage.tsx       # Create/join options
├── JoinPage.tsx       # Join existing game
├── BotsPage.tsx       # Challenge bots and RL agents
├── WaitingRoom.tsx    # Wait for opponent
├── game/
│   ├── GameState.ts   # Frontend model types
│   ├── rules.ts       # UI helpers (server is authoritative)
│   ├── setup.ts       # Initial state helpers
│   ├── units.ts       # Unit data
│   └── cards.ts       # Card definitions
├── ui/
│   ├── GameBoard.tsx  # 5×5 grid renderer
│   ├── Tile.tsx       # Individual tile
│   ├── Unit.tsx       # Unit sprite
│   ├── HUD.tsx        # Game info display
│   ├── Hand.tsx       # Card hand
│   ├── Card.tsx       # Card component
│   ├── UnitPicker.tsx # Deployment selector
│   ├── DeckPicker.tsx # Deck selection
│   ├── UnitStatsPanel.tsx # Unit info
│   ├── DiscardViewer.tsx  # Discard pile
│   ├── RulesModal.tsx # Game rules
│   ├── SpellOverlay.tsx # Spell effects
│   └── BackgroundMusic.tsx # Audio
├── types/
│   └── socket.io-client.d.ts
└── assets/
    ├── audio/         # Sound effects
    ├── background/    # Background images
    ├── cards/         # Card art
    └── spells/        # Spell effects
```

## Key Components

### App.tsx

Main game container:
- Subscribes to server events (`STATE_UPDATE`, `GAME_CONCLUDED`, timers)
- Manages game state, winner detection, rematch flow
- Renders board, HUD, and overlays
- Emits `PLAYER_ACTION` on user input

### Pages

| Page | Purpose |
|------|---------|
| `LobbyPage` | Main menu with Play button |
| `PlayPage` | Create game, join, or challenge bot |
| `JoinPage` | List available games, join by ID |
| `BotsPage` | List scripted bots and RL agents |
| `WaitingRoom` | Wait for opponent to join |

### UI Components

| Component | Purpose |
|-----------|---------|
| `GameBoard` | Renders 5×5 grid of tiles |
| `Tile` | Individual tile with unit/highlight |
| `Unit` | Unit sprite with type/owner styling |
| `HUD` | Turn info, actions remaining, timers |
| `UnitPicker` | Select unit type for deployment |
| `RulesModal` | Game rules reference |

## Socket Events

### Emitted (Client → Server)

- `CREATE_GAME` - Start human vs human game
- `CREATE_BOT_GAME` - Start game vs bot/RL agent
- `JOIN_GAME` - Join as Player 1
- `PLAYER_ACTION` - Send move/attack/deploy/etc
- `RECONNECT` - Restore session
- `SURRENDER` - Give up
- `REQUEST_REMATCH` / `ACCEPT_REMATCH` - Rematch flow

### Received (Server → Client)

- `STATE_UPDATE` - New game state
- `GAME_CONCLUDED` - Game ended
- `OPPONENT_DISCONNECTED` - Grace period started
- `RESUME_GAME` - Reconnection successful
- `INACTIVITY_TIMER_START` / `CANCEL` - Timer events
- `REMATCH_*` - Rematch flow events

## Game Flow

1. **Create/Join**: Navigate to PlayPage → Create game or join existing
2. **Waiting**: If Player 0, wait in WaitingRoom for opponent
3. **Play**: Game renders in App.tsx, take turns making moves
4. **End**: Winner announced, option to rematch or return to lobby

## Bot/RL Agent Games

- Select from BotsPage
- Scripted bots (EndTurnBot, CavalryRushBot, CounterBot)
- RL agents (trained neural networks at various checkpoints)
- **Instant rematch**: No offer flow needed, just click "Rematch"
- `localStorage.setItem('novusx.botId', botId)` tracks current bot

## Session Persistence

Uses localStorage for reconnection:
- `novusx.gameId` - Current game ID
- `novusx.playerId` - Player number (0 or 1)
- `novusx.reconnectToken` - Session token
- `novusx.state` - Cached game state
- `novusx.botId` - Bot ID for rematch (cleared for human games)

## Development Notes

- Server is authoritative; UI renders updates
- `rules.ts` provides UI helpers but server validates
- Hot reload with Vite
- Ensure `VITE_SERVER_URL` matches backend

