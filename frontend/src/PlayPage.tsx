import React, { useState } from 'react';
import { getSocket } from './socket';

interface CreateGameResponse {
  gameId: string;
  playerId: 0 | 1;
  state?: any;
  reconnectToken?: string;
}

const container: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px', margin: '24px auto' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const button: React.CSSProperties = { padding: '10px 16px', borderRadius: '8px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer' };
const actions: React.CSSProperties = { display: 'flex', gap: '12px', justifyContent: 'center' };
const card: React.CSSProperties = { padding: '16px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)' };
const page: React.CSSProperties = { padding: '20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 6px 10px rgba(0, 0, 0, 0.08)' };

/**
 * PlayPage: Entry point to start playing (PvP only).
 * - Creates a new game and navigates to the waiting room.
 * - Offers navigation to Join page.
 * 
 * BOT CHALLENGE: Disabled for PvP-only mode
 */
export const PlayPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /**
   * navigateToWaiting: Persist session and go to waiting room for Player 0.
   */
  const navigateToWaiting = (resp: CreateGameResponse) => {
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    if (resp.reconnectToken) {
      localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
    }
    // Clear any bot ID from previous sessions
    localStorage.removeItem('novusx.botId');
    if (resp.state) {
      try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {}
    }
    window.location.hash = '#/waiting';
  };

  /**
   * createGame: Emit `CREATE_GAME` and handle response/errors.
   */
  const createGame = () => {
    setError(null);
    setCreating(true);
    
    try {
      const socket = getSocket();
      socket.emit('CREATE_GAME', null, (resp: CreateGameResponse) => {
        setCreating(false);
        if (!resp || !resp.gameId) {
          setError('Failed to create game');
          return;
        }
        navigateToWaiting(resp);
      });
    } catch (err) {
      setCreating(false);
      setError('Not connected to server');
    }
  };

  return (
    <div style={container}>
      <div style={page}>
        <div style={header}>
          <h2 style={{ margin: 0 }}>Play</h2>
          <button style={button} onClick={() => window.location.hash = '#/lobby'}>Back</button>
        </div>
        <div style={card}>
          <div style={actions}>
            <button 
              style={{ ...button, opacity: creating ? 0.7 : 1 }} 
              onClick={createGame}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create New Game'}
            </button>
            <button style={button} onClick={() => window.location.hash = '#/join'}>
              Join Existing Game
            </button>
          </div>
          {/* Bot challenge disabled for PvP-only mode */}
          <div style={{ marginTop: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            Bot challenges are currently disabled
          </div>
        </div>
        {error && <div style={{ color: '#ef4444', marginTop: '8px', textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
};
