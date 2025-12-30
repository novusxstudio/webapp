import React, { useEffect, useState } from 'react';
import { socket } from './socket';

/**
 * WaitingRoom: Shows the game ID and waits for Player 1.
 * - Listens for `GAME_JOINED` to transition into the game view.
 * - Displays status updates and preserves any state/token from server.
 */
export const WaitingRoom: React.FC = () => {
  const [gameId] = useState<string>(() => localStorage.getItem('novusx.gameId') || '');
  const [status, setStatus] = useState<string>('Waiting for player to join...');

  useEffect(() => {
    const onJoined = (resp: { gameId: string; playerId: 0 | 1; state?: any; reconnectToken?: string }) => {
      // When another player joins, navigate to the game page
      if (resp?.gameId === gameId) {
        // Persist any state/token from server (if provided)
        if (resp.state) {
          try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {}
        }
        if (resp.reconnectToken) {
          localStorage.setItem('novusx.reconnectToken', String(resp.reconnectToken));
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

  return (
    <div style={container}>
      <div style={title}>Waiting for Player...</div>
      <div>Share this Game ID with your friend:</div>
      <div style={idBox}><strong>Game ID:</strong> {gameId}</div>
      <div style={{ marginTop: '16px', color: '#374151', fontSize: '12px' }}>{status}</div>
    </div>
  );
};
