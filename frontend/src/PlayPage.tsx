import React, { useState } from 'react';
import { socket } from './socket';

interface CreateGameResponse {
  gameId: string;
  playerId: 0 | 1;
  state?: any;
  reconnectToken: string;
}

const container: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px', margin: '24px auto' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const button: React.CSSProperties = { padding: '10px 16px', borderRadius: '8px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer' };
const actions: React.CSSProperties = { display: 'flex', gap: '12px', justifyContent: 'center' };
const card: React.CSSProperties = { padding: '16px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)' };
const page: React.CSSProperties = { padding: '20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 6px 10px rgba(0, 0, 0, 0.08)' };

export const PlayPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  const navigateToWaiting = (resp: CreateGameResponse) => {
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
    if (resp.state) { try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {} }
    window.location.hash = '#/waiting';
  };

  const createGame = () => {
    setError(null);
    socket.emit('CREATE_GAME', null, (resp: CreateGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to create game'); return; }
      navigateToWaiting(resp);
    });
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
            <button style={button} onClick={createGame}>Create New Game</button>
            <button style={button} onClick={() => window.location.hash = '#/join'}>Join Existing Game</button>
            <button style={button} onClick={() => window.location.hash = '#/bots'}>Challenge a Bot</button>
          </div>
        </div>
        {error && <div style={{ color: '#ef4444' }}>{error}</div>}
      </div>
    </div>
  );
};
