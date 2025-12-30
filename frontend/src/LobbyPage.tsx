import React, { useState } from 'react';
import { RulesModal } from '../ui/RulesModal';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '600px',
  margin: '24px auto',
};
const buttonStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: '8px', border: '1px solid #2563eb', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer'
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
 * LobbyPage: Entry screen for players.
 * - Opens the Rules modal for quick reference.
 * - Navigates to Play to create/join/challenge a bot.
 */
export const LobbyPage: React.FC = () => {
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);

  return (
    <div style={containerStyle}>
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0 }}>Lobby</h2>
        </div>
        <div style={cardStyle}>
          <div style={actionsStyle}>
            {/** Open the rules modal */}
            <button style={buttonStyle} onClick={() => setIsRulesOpen(true)}>Rules</button>
            {/** Navigate to the Play page to start or join games */}
            <button style={buttonStyle} onClick={() => window.location.hash = '#/play'}>Play Game</button>
          </div>
        </div>
      </div>
      {isRulesOpen && <RulesModal onClose={() => setIsRulesOpen(false)} />}
    </div>
  );
};
