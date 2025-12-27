// Express + WebSocket server for real-time game state synchronization
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { GameState, GameAction, PlayerId } from './types';
import { createInitialGameState, applyAction } from './gameEngine';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// In-memory game storage (for prototype)
const games = new Map<string, GameState>();
const gamePlayers = new Map<string, Map<PlayerId, WebSocket>>();

// Create new game
app.post('/api/games', (req, res) => {
  const gameId = `game-${Date.now()}`;
  const initialState = createInitialGameState();
  
  games.set(gameId, initialState);
  gamePlayers.set(gameId, new Map());
  
  res.json({ gameId, state: initialState });
});

// Get game state
app.get('/api/games/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  res.json({ state: game });
});

// WebSocket connection handling
wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');
  
  let currentGameId: string | null = null;
  let currentPlayerId: PlayerId | null = null;
  
  ws.on('message', (data: string) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'join') {
        const { gameId, playerId } = message;
        
        if (!games.has(gameId)) {
          ws.send(JSON.stringify({ type: 'error', error: 'Game not found' }));
          return;
        }
        
        currentGameId = gameId;
        currentPlayerId = playerId as PlayerId;
        
        // Register player connection
        const players = gamePlayers.get(gameId);
        if (players) {
          players.set(playerId, ws);
        }
        
        // Send current game state
        const gameState = games.get(gameId);
        ws.send(JSON.stringify({ type: 'state', state: gameState }));
        
        console.log(`Player ${playerId} joined game ${gameId}`);
        
      } else if (message.type === 'action') {
        if (!currentGameId || !currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not joined to a game' }));
          return;
        }
        
        const gameState = games.get(currentGameId);
        if (!gameState) {
          ws.send(JSON.stringify({ type: 'error', error: 'Game not found' }));
          return;
        }
        
        // Verify it's the current player's turn
        if (gameState.currentPlayer !== currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not your turn' }));
          return;
        }
        
        const action: GameAction = message.action;
        const result = applyAction(gameState, action);
        
        if (result.success && result.newState) {
          // Update game state
          games.set(currentGameId, result.newState);
          
          // Broadcast new state to all players
          const players = gamePlayers.get(currentGameId);
          if (players) {
            const stateMessage = JSON.stringify({ 
              type: 'state', 
              state: result.newState 
            });
            
            players.forEach(playerWs => {
              if (playerWs.readyState === WebSocket.OPEN) {
                playerWs.send(stateMessage);
              }
            });
          }
        } else {
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: result.error || 'Action failed' 
          }));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    
    if (currentGameId && currentPlayerId) {
      const players = gamePlayers.get(currentGameId);
      if (players) {
        players.delete(currentPlayerId);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
