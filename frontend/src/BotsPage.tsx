import React, { useEffect, useState } from 'react';
import { socket } from './socket';

interface BotInfo { id: string; name: string }
interface CreateGameResponse { gameId: string; playerId: 0 | 1; state?: any; reconnectToken: string }

const container: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px', margin: '24px auto' };
const section: React.CSSProperties = { padding: '12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' };
const title: React.CSSProperties = { fontWeight: 700, fontSize: '16px', marginBottom: '8px' };
const subtitle: React.CSSProperties = { fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#374151' };
const button: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer' };
const rlButton: React.CSSProperties = { ...button, border: '1px solid #7c3aed', background: '#ede9fe', color: '#5b21b6' };
const listItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' };
const card: React.CSSProperties = { padding: '16px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)' };
const page: React.CSSProperties = { padding: '20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 6px 10px rgba(0, 0, 0, 0.08)' };
const divider: React.CSSProperties = { borderTop: '2px solid #e5e7eb', margin: '16px 0' };
const badge: React.CSSProperties = { 
  display: 'inline-block', 
  padding: '2px 8px', 
  borderRadius: '12px', 
  fontSize: '11px', 
  fontWeight: 600, 
  marginLeft: '8px'
};
const rlBadge: React.CSSProperties = { ...badge, background: '#ede9fe', color: '#5b21b6' };
const scriptedBadge: React.CSSProperties = { ...badge, background: '#dbeafe', color: '#1d4ed8' };

/**
 * BotsPage: List available bots and start a bot match.
 * - Subscribes to `AVAILABLE_BOTS` and displays bot names.
 * - Emits `CREATE_BOT_GAME` for the selected bot and navigates to game view.
 */
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

  /**
   * navigateToGame: Persist session info and navigate to the game view.
   */
  const navigateToGame = (resp: CreateGameResponse, botId: string) => {
    localStorage.setItem('novusx.gameId', resp.gameId);
    localStorage.setItem('novusx.playerId', String(resp.playerId));
    localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
    localStorage.setItem('novusx.botId', botId); // Store botId for rematch
    if (resp.state) { try { localStorage.setItem('novusx.state', JSON.stringify(resp.state)); } catch {} }
    window.location.hash = '#/game';
  };

  /**
   * challengeBot: Emit `CREATE_BOT_GAME` for the selected bot and handle response/errors.
   */
  const challengeBot = (botId: string) => {
    setError(null);
    socket.emit('CREATE_BOT_GAME', { botId }, (resp: CreateGameResponse) => {
      if (!resp || !resp.gameId) { setError('Failed to create bot game'); return; }
      navigateToGame(resp, botId);
    });
  };

  // Separate RL agents from scripted bots
  const rlAgents = bots.filter(b => b.id.startsWith('rl_agent_'));
  const scriptedBots = bots.filter(b => !b.id.startsWith('rl_agent_'));

  return (
    <div style={container}>
      <div style={page}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={title}>Challenge a Bot</div>
          <button style={button} onClick={() => window.location.hash = '#/lobby'}>Back to Lobby</button>
        </div>
        <div style={card}>
          {/* Scripted Bots Section */}
          <div style={section}>
            <div style={subtitle}>🤖 Scripted Bots<span style={scriptedBadge}>Rule-Based</span></div>
            {scriptedBots.length === 0 && <div style={{ color: '#6b7280' }}>No scripted bots available</div>}
            {scriptedBots.map(b => (
              <div key={b.id} style={listItem}>
                <span>{b.name}</span>
                <button style={button} onClick={() => challengeBot(b.id)}>Challenge</button>
              </div>
            ))}
          </div>
          
          {/* RL Agents Section */}
          {rlAgents.length > 0 && (
            <>
              <div style={divider} />
              <div style={section}>
                <div style={subtitle}>🧠 RL Agents<span style={rlBadge}>Neural Network</span></div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  Trained via self-play reinforcement learning. Higher iterations = stronger agents.<br/>
                  <strong>P0 agents:</strong> You play as Player 1 (bottom). <strong>P1 agents:</strong> You play as Player 0 (top).
                </div>
                {rlAgents.map(b => (
                  <div key={b.id} style={listItem}>
                    <span>{b.name}</span>
                    <button style={rlButton} onClick={() => challengeBot(b.id)}>Challenge</button>
                  </div>
                ))}
              </div>
            </>
          )}
          
          {error && <div style={{ color: '#ef4444', marginTop: '8px' }}>{error}</div>}
        </div>
      </div>
    </div>
  );
};
