# NovusX Webapp

A multiplayer turn-based strategy game where two players (or player vs bot/AI) place and maneuver units on a 5×5 grid to control three central points. Features human vs human, human vs scripted bots, and human vs RL-trained neural network agents.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  • Renders game board, units, HUD                               │
│  • Subscribes to STATE_UPDATE events                            │
│  • Emits PLAYER_ACTION intents                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↕ Socket.IO
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Node + Socket.IO)                   │
│  • Authoritative game state                                     │
│  • Validates actions, applies rules                             │
│  • Manages bots (scripted + RL agents)                          │
│  • Handles reconnection, timers                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↕ subprocess
┌─────────────────────────────────────────────────────────────────┐
│                     RL System (Python + PyTorch)                │
│  • Self-play training with PPO                                  │
│  • inference.py called by backend for RL bot actions            │
└─────────────────────────────────────────────────────────────────┘
```

## Game Rules

- **Board**: 5×5 grid with 3 control points (center column)
- **Units**: Swordsman, Shieldman, Axeman, Cavalry, Archer, Spearman
  - Each has different move/attack ranges and matchup advantages
  - Archer and Spearman have ranged attacks (range 2)
- **Turns**: Current player has limited actions per turn
- **Victory**: Control all 3 central points simultaneously

## Project Structure

```
webapp/
├── backend/           # Node.js + Socket.IO server (authoritative)
├── frontend/          # React + Vite client
└── rl/                # Python reinforcement learning system
```

## Quick Start

### 1. Start Backend
```bash
cd backend
npm install
npm run dev
```

### 2. Start Frontend
```bash
cd frontend
npm install
echo VITE_SERVER_URL=http://localhost:3001 > .env
npm run dev
```

### 3. Play
Open `http://localhost:5173`, create a game, and play!

### 4. (Optional) Train RL Agents
```bash
pip install torch numpy pyyaml tqdm
python -m rl.train_self_play
```

## Game Modes

| Mode | Description |
|------|-------------|
| **Human vs Human** | Create game, share ID, opponent joins |
| **vs Scripted Bots** | Challenge rule-based bots (EndTurnBot, CavalryRushBot, CounterBot) |
| **vs RL Agents** | Challenge neural network agents trained via self-play |

## Features

- **Real-time multiplayer** via Socket.IO
- **Reconnection support** with tokens and grace periods
- **Inactivity timers** to prevent stalling (disabled for bot games)
- **Instant rematch** for bot/AI games
- **RL training system** with fixed-role self-play

## Documentation

- [Backend README](backend/README.md) - Server architecture, socket events, game logic
- [Frontend README](frontend/README.md) - UI components, state management
- [RL System README](rl/README.md) - Training, checkpoints, neural network architecture

## LAN Play

For LAN multiplayer, set `VITE_SERVER_URL` to your machine's IP:
```bash
# In frontend/.env
VITE_SERVER_URL=http://192.168.1.100:3001
```

Then access from other devices at `http://192.168.1.100:5173`.
