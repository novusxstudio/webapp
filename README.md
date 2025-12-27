<<<<<<< HEAD
# Grid Strategy Game - Prototype

A 2-player turn-based grid strategy game with authoritative backend and React frontend.

## 🎮 Game Features

- **5×5 Grid Board**: Strategic positioning on a compact battlefield
- **Control Points**: Capture left (coins), center (actions), and right (coins) for bonuses
- **Unit Combat**: Deploy units with unique stats (ATK, DEF, HP, Move, Range)
- **Spell Cards**: Lightning Strike, Healing Circle
- **Turn-Based Gameplay**: Each action costs exactly 1 action point
- **Win Condition**: Control all 3 control points at end of turn

## 🏗️ Architecture

### Backend (Authoritative)
- **Node.js + TypeScript + Express + WebSocket**
- All game rules enforced server-side
- Deterministic game engine with full validation
- Real-time state synchronization via WebSockets

### Frontend (Display Only)
- **React + TypeScript + Tailwind CSS**
- Renders game state received from backend
- Sends action intents only
- No client-side rule calculations

## 📋 Prerequisites

- Node.js 18+ and npm
- Two terminal windows (one for backend, one for frontend)

## 🚀 Setup Instructions

### 1. Install Backend Dependencies

```powershell
cd backend
npm install
```

### 2. Install Frontend Dependencies

```powershell
cd ..
npm install
```

### 3. Start the Backend Server

```powershell
cd backend
npm run dev
```

The backend server will start on `http://localhost:3001`

### 4. Start the Frontend (in a new terminal)

```powershell
npm run dev
```

The frontend will start on `http://localhost:5173`

## 🎯 How to Play

### Starting a Game

1. Open `http://localhost:5173` in your browser
2. Player 1: Click "Create Game as Player A" or "Player B"
3. Copy the Game ID displayed (e.g., `game-1234567890`)
4. Player 2: Open the same URL in a different browser/tab
5. Enter the Game ID and join as the other player
6. Player A always starts first

### Game Rules

#### Turn Structure
- **Start of Turn**: Gain 1 base coin + control point bonuses
- **Actions Phase**: Spend actions (1 base + center control bonus)
- **End of Turn**: Check win condition

#### Actions (Each costs 1 action)
1. **Move**: Move a unit (orthogonal=1 distance, diagonal=2)
2. **Attack**: Attack enemy unit within range
3. **Swap**: Swap positions of two adjacent friendly units
4. **Play Card**: Deploy unit or cast spell (costs coins + 1 action)
5. **Draw Card**: Draw from deck (max hand size: 5)
6. **Sell Card**: Discard for +1 coin
7. **End Turn**: Pass to opponent

#### Control Points
- **Left (3,1)**: +1 coin per turn
- **Center (3,3)**: +1 action per turn
- **Right (3,5)**: +1 coin per turn

#### Combat
- Damage = max(ATK - DEF, 1)
- Unit dies when HP ≤ 0
- No randomness

#### Units (Starter Cards)

**1-Coin Units:**
- Spearman: ATK 6 / DEF 2 / HP 2 / Move 1 / Range 1
- Swordsman: ATK 5 / DEF 3 / HP 2 / Move 1 / Range 1
- Archer: ATK 5 / DEF 1 / HP 2 / Move 1 / Range 2
- Shieldman: ATK 3 / DEF 4 / HP 2 / Move 1 / Range 1

**Spells:**
- Lightning Strike (2 coins): Deal 5 damage (ignores DEF)

## 🎮 Controls

### Selecting
- Click a **unit** to select it (shows available actions)
- Click a **card** to select it (shows play/sell options)

### Unit Actions
1. Select your unit
2. Click action button (Move/Attack/Swap)
3. Click target (tile for move, unit for attack/swap)

### Card Actions
1. Select a card from your hand
2. Click "Play" (for units: click spawn row tile)
3. Or click "Sell" to gain 1 coin

### General
- **Draw Card**: Get a card from deck
- **End Turn**: Pass to opponent

## 🏗️ Project Structure

```
/
├── backend/
│   ├── src/
│   │   ├── types.ts          # Type definitions
│   │   ├── cards.ts          # Card definitions
│   │   ├── gameEngine.ts     # Core game logic
│   │   └── server.ts         # Express + WebSocket server
│   ├── package.json
│   └── tsconfig.json
├── src/
│   ├── components/
│   │   ├── GameBoard.tsx     # Main game component
│   │   ├── Grid.tsx          # 5×5 board display
│   │   ├── Unit.tsx          # Unit card display
│   │   ├── Hand.tsx          # Player hand
│   │   └── ActionPanel.tsx   # Action buttons
│   ├── services/
│   │   └── gameClient.ts     # WebSocket client
│   ├── types.ts              # Shared types
│   ├── App.tsx               # App root
│   └── main.tsx              # Entry point
├── package.json
└── README.md
```

## 🔧 Development

### Backend Commands
```powershell
cd backend
npm run dev     # Start development server
npm run build   # Compile TypeScript
npm start       # Run compiled server
```

### Frontend Commands
```powershell
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## 🧪 Testing the Game

### Single-Player Testing
1. Open two browser windows/tabs
2. Create game in first window
3. Join with same Game ID in second window
4. Play against yourself to test mechanics

### Key Things to Test
- ✅ Unit movement (orthogonal vs diagonal)
- ✅ Combat damage calculation
- ✅ Control point bonuses
- ✅ Win condition (control all 3 points)
- ✅ Action economy (coins, actions)
- ✅ Card playing and selling
- ✅ Turn switching

## 📝 Implementation Notes

### Deterministic Rules
- No randomness (RNG) in any calculations
- All combat damage is predictable
- Deck shuffling only occurs when reshuffling discard pile

### Server Authority
- All validation happens server-side
- Frontend cannot cheat or manipulate state
- Actions rejected if invalid (not enough resources, out of range, etc.)

### Future Enhancements
- More unit types (2-coin and 3-coin units)
- More spells (Healing Circle, Recruitment)
- Deck building
- Replay system
- AI opponent

## 🐛 Troubleshooting

### Backend won't start
- Check if port 3001 is available
- Run `npm install` in backend directory

### Frontend won't connect
- Ensure backend is running first
- Check browser console for WebSocket errors
- Verify backend URL in `gameClient.ts`

### Game state not updating
- Check browser console for errors
- Verify WebSocket connection is established
- Check backend terminal for server errors

## 📜 License

MIT License - Feel free to modify and extend!

---

**Enjoy the game! 🎮**
