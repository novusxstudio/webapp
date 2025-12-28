import React, { useEffect, useMemo, useState } from 'react';
// Use CDN-loaded Socket.IO client to avoid bundler type resolution issues
declare const io: any;
type Socket = any;

interface AvailableGamesMessage {
  type: 'AVAILABLE_GAMES';
  games: string[];
}

interface CreateGameResponse {
  gameId: string;
  playerId: 0 | 1;
  state?: any;
}

interface JoinGameResponse {
  gameId: string;
  playerId: 0 | 1;
  state?: any;
}

const sectionStyle: React.CSSProperties = {
  padding: '12px',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
};
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '600px',
  margin: '24px auto',
};
const titleStyle: React.CSSProperties = { fontWeight: 700, fontSize: '16px', marginBottom: '8px' };
const buttonStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '6px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer'
};
const inputStyle: React.CSSProperties = {
  padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%'
};
const listItemStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6'
};

export const LobbyPage: React.FC = () => {
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<string[]>([]);

  const [socketReady, setSocketReady] = useState(false);
  useMemo(() => {
    // Ensure the client library is present; if not, inject it
    if (typeof io === 'undefined' && typeof window !== 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      s.onload = () => setSocketReady(true);
      document.head.appendChild(s);
    } else {
      setSocketReady(true);
    }
    // Create connection when ready
    // Note: we return a placeholder; real connection established in effect
    return null as any;
  }, []);

  useEffect(() => {
    if (!socketReady) return;
    const conn: Socket = (window as any).io('http://localhost:3001');
    const onError = (payload: { message: string }) => setError(payload?.message ?? 'Unknown error');
    const onAvailable = (msg: AvailableGamesMessage) => {
      if (msg && msg.type === 'AVAILABLE_GAMES') setGames(msg.games || []);
    };
    conn.on('ERROR', onError);
    conn.on('AVAILABLE_GAMES', onAvailable);

    // Request list on load
    conn.emit('LIST_GAMES');

    // Save connection for handlers
    (window as any).__novusx_socket = conn;

    return () => {
      conn.off('ERROR', onError);
      conn.off('AVAILABLE_GAMES', onAvailable);
      // Keep connection alive across navigation; do not disconnect here.
    };
  }, [socketReady]);

  const navigateToGame = (resp: { gameId: string; playerId: 0 | 1; state?: any }) => {
    // Persist for later use; existing App does not read these yet
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    if (resp.state) {
      try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {}
    }
    // Navigate to game board route (hash-based)
    window.location.hash = '#/game';
  };

  const handleCreate = () => {
    setError(null);
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('CREATE_GAME', null, (resp: CreateGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to create game'); return; }
      navigateToGame(resp);
    });
  };

  const handleJoin = (id: string) => {
    setError(null);
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('JOIN_GAME', { gameId: id }, (resp: JoinGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to join game'); return; }
      navigateToGame(resp);
    });
  };

  return (
    <div style={containerStyle}>
      <div style={sectionStyle}>
        <div style={titleStyle}>Create Game</div>
        <button style={buttonStyle} onClick={handleCreate}>Create New Game</button>
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>Join by ID</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input style={inputStyle} value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Enter Game ID" />
          <button style={buttonStyle} onClick={() => handleJoin(joinId)} disabled={!joinId}>Join Game</button>
        </div>
        {error && <div style={{ color: '#ef4444', marginTop: '8px' }}>{error}</div>}
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>Available Games</div>
        {games.length === 0 && <div style={{ color: '#6b7280' }}>No available games</div>}
        {games.map((g) => (
          <div key={g} style={listItemStyle}>
            <span>{g}</span>
            <button style={buttonStyle} onClick={() => handleJoin(g)}>Join</button>
          </div>
        ))}
      </div>
    </div>
  );
};
