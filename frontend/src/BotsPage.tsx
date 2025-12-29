import React, { useEffect, useState } from 'react';
import { socket } from './socket';

interface BotInfo { id: string; name: string }
interface CreateGameResponse { gameId: string; playerId: 0 | 1; state?: any; reconnectToken: string }

const container: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px', margin: '24px auto' };
const section: React.CSSProperties = { padding: '12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' };
const title: React.CSSProperties = { fontWeight: 700, fontSize: '16px', marginBottom: '8px' };
const button: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer' };
const listItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' };
const card: React.CSSProperties = { padding: '16px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)' };
const page: React.CSSProperties = { padding: '20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 6px 10px rgba(0, 0, 0, 0.08)' };

export const BotsPage: React.FC = () => {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (payload: { message: string }) => setError(payload?.message ?? 'Unknown error');
    const onBots = (payload: { bots: BotInfo[] }) => setBots(payload?.bots ?? []);
    socket.on('ERROR', onErr);
    socket.on('AVAILABLE_BOTS', onBots);
    socket.emit('LIST_BOTS');
    return () => {
      socket.off('ERROR', onErr);
      socket.off('AVAILABLE_BOTS', onBots);
    };
  }, []);

  const navigateToGame = (resp: CreateGameResponse) => {
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
    if (resp.state) { try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {} }
    window.location.hash = '#/game';
  };

  const challengeBot = (botId: string) => {
    setError(null);
    socket.emit('CREATE_BOT_GAME', { botId }, (resp: CreateGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to create bot game'); return; }
      navigateToGame(resp);
    });
  };

  return (
    <div style={container}>
      <div style={page}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={title}>Challenge a Bot</div>
          <button style={button} onClick={() => window.location.hash = '#/lobby'}>Back to Lobby</button>
        </div>
        <div style={card}>
          <div style={section}>
            {bots.length === 0 && <div style={{ color: '#6b7280' }}>No bots available</div>}
            {bots.map(b => (
              <div key={b.id} style={listItem}>
                <span>{b.name}</span>
                <button style={button} onClick={() => challengeBot(b.id)}>Challenge</button>
              </div>
            ))}
            {error && <div style={{ color: '#ef4444', marginTop: '8px' }}>{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
