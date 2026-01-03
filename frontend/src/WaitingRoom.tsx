import React, { useEffect, useState } from 'react';
import { getSocket } from './socket';

/**
 * WaitingRoom: Shows the game ID and waits for opponent.
 * - Listens for `GAME_JOINED` to transition into the game view.
 * - Displays status updates and preserves any state/token from server.
 */
export const WaitingRoom: React.FC = () => {
  const [gameId] = useState<string>(() => localStorage.getItem('novusx.gameId') || '');
  const [status, setStatus] = useState<string>('Waiting for player to join...');

  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch {
      setStatus('Error: Not connected to server');
      return;
    }

    const onJoined = (resp: { gameId: string; playerId: 0 | 1; state?: any; reconnectToken?: string }) => {
      if (resp?.gameId === gameId) {
        // Persist any state/token from server
        if (resp.state) {
          try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {}
        }
        if (resp.reconnectToken) {
          localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
        }
        setStatus('Player joined! Loading game...');
        window.location.hash = '#/game';
      }
    };

    const onError = (e: { message: string }) => {
      setStatus(`Error: ${e?.message ?? 'Unknown error'}`);
    };

    socket.on('GAME_JOINED', onJoined);
    socket.on('ERROR', onError);

    return () => {
      socket.off('GAME_JOINED', onJoined);
      socket.off('ERROR', onError);
    };
  }, [gameId]);

  const handleCancel = () => {
    // Clear session and return to lobby
    localStorage.removeItem('novusx.gameId');
    localStorage.removeItem('novusx.playerId');
    localStorage.removeItem('novusx.reconnectToken');
    localStorage.removeItem('novusx.state');
    window.location.hash = '#/lobby';
  };

  const container: React.CSSProperties = {
    padding: '24px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    maxWidth: '600px',
    margin: '24px auto',
    textAlign: 'center',
    color: '#000',
  };
  const title: React.CSSProperties = { fontSize: '18px', fontWeight: 700, marginBottom: '12px' };
  const idBox: React.CSSProperties = { fontSize: '14px', marginTop: '8px' };
  const button: React.CSSProperties = { 
    padding: '8px 16px', 
    borderRadius: '6px', 
    border: '1px solid #ef4444', 
    background: '#fee2e2', 
    color: '#b91c1c', 
    cursor: 'pointer',
    marginTop: '16px',
  };

  return (
    <div style={container}>
      <div style={title}>Waiting for Opponent...</div>
      <div>Share this Game ID with your friend:</div>
      <div style={idBox}>
        <strong>Game ID:</strong> {gameId}
        <button
          onClick={() => {
            navigator.clipboard.writeText(gameId);
          }}
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            background: '#f9fafb',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Copy
        </button>
      </div>
      <div style={{ marginTop: '16px', color: '#374151', fontSize: '12px' }}>{status}</div>
      <button style={button} onClick={handleCancel}>Cancel</button>
    </div>
  );
};
