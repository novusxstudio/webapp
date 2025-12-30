import React, { useEffect, useState } from 'react';
import { socket } from './socket';

interface AvailableGamesMessage { type: 'AVAILABLE_GAMES'; games: string[] }
interface JoinGameResponse { gameId: string; playerId: 0 | 1; state?: any; reconnectToken: string }

const container: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px', margin: '24px auto' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const section: React.CSSProperties = { padding: '12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' };
const title: React.CSSProperties = { fontWeight: 700, fontSize: '16px', marginBottom: '8px' };
const button: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer' };
const input: React.CSSProperties = { padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%' };
const listItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' };
const card: React.CSSProperties = { padding: '16px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)' };
const page: React.CSSProperties = { padding: '20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 6px 10px rgba(0, 0, 0, 0.08)' };

/**
 * JoinPage: Lists joinable games and lets a player join by ID.
 * - Subscribes to `AVAILABLE_GAMES` and `ERROR`.
 * - Provides join-by-id and quick-join buttons.
 */
export const JoinPage: React.FC = () => {
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<string[]>([]);

  useEffect(() => {
    const onError = (payload: { message: string }) => setError(payload?.message ?? 'Unknown error');
    const onAvailable = (msg: AvailableGamesMessage) => { if (msg && msg.type === 'AVAILABLE_GAMES') setGames(msg.games || []); };
    socket.on('ERROR', onError);
    socket.on('AVAILABLE_GAMES', onAvailable);
    socket.emit('LIST_GAMES');
    return () => { socket.off('ERROR', onError); socket.off('AVAILABLE_GAMES', onAvailable); };
  }, []);

  /**
   * navigateToGame: Persist session info and navigate to the game view.
   */
  const navigateToGame = (resp: JoinGameResponse) => {
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
    if (resp.state) { try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {} }
    window.location.hash = '#/game';
  };

  /**
   * joinById: Emit `JOIN_GAME` and handle response/errors.
   */
  const joinById = (id: string) => {
    setError(null);
    socket.emit('JOIN_GAME', { gameId: id }, (resp: JoinGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to join game'); return; }
      navigateToGame(resp);
    });
  };

  return (
    <div style={container}>
      <div style={page}>
        <div style={header}>
          <h2 style={{ margin: 0 }}>Join Game</h2>
          <button style={button} onClick={() => window.location.hash = '#/play'}>Back</button>
        </div>
        <div style={card}>
          <div style={section}>
            <div style={title}>Join by ID</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={input} value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Enter Game ID" />
              <button style={button} onClick={() => joinById(joinId)} disabled={!joinId}>Join Game</button>
            </div>
            {error && <div style={{ color: '#ef4444', marginTop: '8px' }}>{error}</div>}
          </div>
          <div style={section}>
            <div style={title}>Available Games</div>
            {games.length === 0 && <div style={{ color: '#6b7280' }}>No available games</div>}
            {games.map((g) => (
              <div key={g} style={listItem}>
                <span><strong>Game ID:</strong> {g}</span>
                <button style={button} onClick={() => joinById(g)}>Join</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
