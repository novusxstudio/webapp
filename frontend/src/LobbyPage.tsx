import React, { useEffect, useState } from 'react';
import { socket } from './socket';
import { RulesModal } from '../ui/RulesModal';

interface AvailableGamesMessage {
  type: 'AVAILABLE_GAMES';
  games: string[];
}

interface CreateGameResponse {
  gameId: string;
  playerId: 0 | 1;
  state?: any;
  reconnectToken: string;
}

interface JoinGameResponse {
  gameId: string;
  playerId: 0 | 1;
  state?: any;
  reconnectToken: string;
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
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);

  // No script injection or per-page socket; use shared socket instance.

  useEffect(() => {
    const onError = (payload: { message: string }) => setError(payload?.message ?? 'Unknown error');
    const onAvailable = (msg: AvailableGamesMessage) => {
      if (msg && msg.type === 'AVAILABLE_GAMES') setGames(msg.games || []);
    };
    socket.on('ERROR', onError);
    socket.on('AVAILABLE_GAMES', onAvailable);

    // Request list on load
    socket.emit('LIST_GAMES');

    return () => {
      socket.off('ERROR', onError);
      socket.off('AVAILABLE_GAMES', onAvailable);
      // Keep socket alive across navigation
    };
  }, []);

  const navigateToGame = (resp: { gameId: string; playerId: 0 | 1; state?: any }) => {
    // Persist for later use; existing App does not read these yet
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    if (resp.state) {
      try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {}
    }
    // Store reconnect token
    if ((resp as any).reconnectToken) {
      localStorage.setItem('novusx.reconnectToken', (resp as any).reconnectToken);
    }
    // Navigate to game board route (hash-based)
    window.location.hash = '#/game';
  };

  const navigateToWaiting = (resp: { gameId: string; playerId: 0 | 1; state?: any }) => {
    // Persist creator's seat and token
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    if ((resp as any).reconnectToken) {
      localStorage.setItem('novusx.reconnectToken', (resp as any).reconnectToken);
    }
    if (resp.state) {
      try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {}
    }
    window.location.hash = '#/waiting';
  };

  const handleCreate = () => {
    setError(null);
    socket.emit('CREATE_GAME', null, (resp: CreateGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to create game'); return; }
      navigateToWaiting(resp);
    });
  };

  const handleJoin = (id: string) => {
    setError(null);
    socket.emit('JOIN_GAME', { gameId: id }, (resp: JoinGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to join game'); return; }
      navigateToGame(resp);
    });
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={buttonStyle} onClick={() => setIsRulesOpen(true)}>Rules</button>
      </div>
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
            <span><strong>Game ID:</strong> {g}</span>
            <button style={buttonStyle} onClick={() => handleJoin(g)}>Join</button>
          </div>
        ))}
      </div>
      {isRulesOpen && <RulesModal onClose={() => setIsRulesOpen(false)} />}
    </div>
  );
};
