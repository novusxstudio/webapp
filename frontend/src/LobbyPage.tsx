import React, { useState } from 'react';
import { RulesModal } from '../ui/RulesModal';
import { disconnectSocket } from './socket';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '600px',
  margin: '24px auto',
};
const buttonStyle: React.CSSProperties = {
  padding: '10px 16px', 
  borderRadius: '8px', 
  border: '1px solid #2563eb', 
  background: '#dbeafe', 
  color: '#1d4ed8', 
  cursor: 'pointer'
};
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', marginTop: '12px' };
const actionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', gap: '12px' };
const cardStyle: React.CSSProperties = {
  padding: '16px',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.08)',
};
const pageStyle: React.CSSProperties = {
  padding: '20px',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  boxShadow: '0 6px 10px rgba(0, 0, 0, 0.08)'
};

/**
 * LobbyPage: Entry screen for players (PvP only).
 * - Opens the Rules modal for quick reference.
 * - Navigates to Play to create/join games.
 * 
 * BOT CHALLENGE: Disabled for PvP-only mode
 */
export const LobbyPage: React.FC = () => {
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);

  const handleLogout = () => {
    // Clear auth token and session data
    localStorage.removeItem('novusx.authToken');
    localStorage.removeItem('novusx.gameId');
    localStorage.removeItem('novusx.playerId');
    localStorage.removeItem('novusx.reconnectToken');
    localStorage.removeItem('novusx.state');
    localStorage.removeItem('novusx.botId');
    
    // Disconnect socket
    disconnectSocket();
    
    // Reload to show login screen
    window.location.reload();
  };

  return (
    <div style={containerStyle}>
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0 }}>NovusX Lobby</h2>
        </div>
        <div style={cardStyle}>
          <div style={actionsStyle}>
            <button style={buttonStyle} onClick={() => setIsRulesOpen(true)}>Rules</button>
            <button style={buttonStyle} onClick={() => window.location.hash = '#/play'}>Play Game</button>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #ef4444',
              background: '#fee2e2',
              color: '#b91c1c',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
      {isRulesOpen && <RulesModal onClose={() => setIsRulesOpen(false)} />}
    </div>
  );
};
