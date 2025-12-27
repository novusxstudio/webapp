# ⚡ Quick Start Guide

Get the game running in 2 minutes!

## Step 1: Install Dependencies

```powershell
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

## Step 2: Start Backend

Open a terminal and run:

```powershell
cd backend
npm run dev
```

You should see:
```
Game server running on port 3001
WebSocket server ready
```

## Step 3: Start Frontend

Open a **NEW** terminal and run:

```powershell
npm run dev
```

You should see:
```
VITE ready in X ms
Local: http://localhost:5173/
```

## Step 4: Play!

### Option A: Play Against Yourself (Testing)

1. Open `http://localhost:5173` in Chrome
2. Click **"Create Game as Player A"**
3. Note the Game ID (e.g., `game-1703712345678`)
4. Open `http://localhost:5173` in a **new tab** or **incognito window**
5. Enter the Game ID
6. Click **"Join as Player B"**
7. Play! Switch between tabs to control each player

### Option B: Play with a Friend (Multiplayer)

1. You: Open `http://localhost:5173`
2. You: Click **"Create Game as Player A"**
3. You: Copy the Game ID and send it to your friend
4. Friend: Opens `http://localhost:5173`
5. Friend: Enters the Game ID
6. Friend: Clicks **"Join as Player B"**
7. Play together in real-time!

## 🎮 Basic Controls

1. **Select a unit**: Click on your unit
2. **Move**: Click "Move" → Click destination tile
3. **Attack**: Click "Attack" → Click enemy unit
4. **Play card**: Click card in hand → Click "Play" → Click spawn tile
5. **End turn**: Click "End Turn"

## 🎯 Quick Win

Try this to test the win condition:

1. Move units to control points at (3,1), (3,3), (3,5)
2. At end of your turn, if you control all 3 → YOU WIN! 🎉

## 🆘 Troubleshooting

**Backend won't start?**
- Make sure port 3001 is not in use
- Check: `npm list` shows all packages installed

**Frontend won't connect?**
- Make sure backend is running FIRST
- Check browser console (F12) for errors
- Look for "WebSocket connected" message

**Can't join game?**
- Make sure Game ID is copied exactly
- Both players must use the same Game ID
- Game ID looks like: `game-1703712345678`

## 📚 Next Steps

- Read [README.md](README.md) for full documentation
- Read [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for technical details
- Check [backend/README.md](backend/README.md) for API docs

---

**🎉 That's it! You're ready to play!**
