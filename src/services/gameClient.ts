// WebSocket client for game communication
import { GameState, GameAction, PlayerId } from './types';

type MessageHandler = (state: GameState) => void;
type ErrorHandler = (error: string) => void;

class GameClient {
  private ws: WebSocket | null = null;
  private gameId: string | null = null;
  private playerId: PlayerId | null = null;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  async createGame(): Promise<{ gameId: string; state: GameState }> {
    const response = await fetch('http://localhost:3001/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error('Failed to create game');
    }
    
    return response.json();
  }

  async getGameState(gameId: string): Promise<GameState> {
    const response = await fetch(`http://localhost:3001/api/games/${gameId}`);
    
    if (!response.ok) {
      throw new Error('Failed to get game state');
    }
    
    const data = await response.json();
    return data.state;
  }

  connect(gameId: string, playerId: PlayerId): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gameId = gameId;
      this.playerId = playerId;
      
      this.ws = new WebSocket('ws://localhost:3001');
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.send({ type: 'join', gameId, playerId });
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'state') {
            this.messageHandlers.forEach(handler => handler(message.state));
          } else if (message.type === 'error') {
            this.errorHandlers.forEach(handler => handler(message.error));
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
      };
    });
  }

  sendAction(action: GameAction): void {
    this.send({ type: 'action', action });
  }

  onStateUpdate(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const gameClient = new GameClient();
