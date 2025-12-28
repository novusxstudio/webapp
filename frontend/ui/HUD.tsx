import React from 'react';
// Simplified HUD: no game state-derived resources

interface HUDProps {
  currentPlayer: number;
  turnNumber: number;
  actionsRemaining: number;
  actionMode: string;
  freeDeploymentsRemaining: number;
  winner: number | null;
  onEndTurn: () => void;
  onLeaveGame: () => void;
  isTurnBlocked: boolean;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  onOpenRules: () => void;
}

export const HUD: React.FC<HUDProps> = ({ currentPlayer, turnNumber, actionsRemaining, actionMode, freeDeploymentsRemaining, winner, onEndTurn, onLeaveGame, isTurnBlocked, musicEnabled, onToggleMusic, onOpenRules }) => {
  
  const hudStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #d1d5db',
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: 'monospace',
    fontSize: '14px',
  };

  const leftSectionStyle: React.CSSProperties = {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
  };

  const rightSectionStyle: React.CSSProperties = {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#6b7280',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#1f2937',
    fontWeight: 'bold',
  };

  const playerValueStyle: React.CSSProperties = {
    ...valueStyle,
    color: currentPlayer === 0 ? '#3b82f6' : '#ef4444',
  };

  const modeValueStyle: React.CSSProperties = {
    ...valueStyle,
    color: actionMode === 'Idle' ? '#6b7280' : '#059669',
  };

  const buttonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    backgroundColor: disabled ? '#d1d5db' : '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.2s',
  });

  // Keep HUD visible even when game is over; buttons disabled

  return (
    <div style={hudStyle}>
      <div style={leftSectionStyle}>
        <div style={itemStyle}>
          <span style={labelStyle}>Turn</span>
          <span style={valueStyle}>{turnNumber}</span>
        </div>

        <div style={itemStyle}>
          <span style={labelStyle}>Current Player</span>
          <span style={playerValueStyle}>Player {currentPlayer}</span>
        </div>

        <div style={itemStyle}>
          <span style={labelStyle}>Actions Remaining</span>
          <span style={valueStyle}>{actionsRemaining}</span>
        </div>
        <div style={itemStyle}>
          <span style={labelStyle}>Deployments</span>
          <span style={valueStyle}>{freeDeploymentsRemaining}</span>
        </div>
      </div>

      <div style={rightSectionStyle}>
        <button
          style={buttonStyle(false)}
          onClick={onOpenRules}
        >
          Rules
        </button>
        <button
          style={buttonStyle(false)}
          onClick={onToggleMusic}
        >
          {`Music: ${musicEnabled ? 'ON' : 'OFF'}`}
        </button>
        <button
          style={buttonStyle(false)}
          onClick={onLeaveGame}
        >
          Leave Game
        </button>
        <button
          style={buttonStyle(isTurnBlocked || winner !== null)}
          onClick={onEndTurn}
          disabled={isTurnBlocked || winner !== null}
        >
          End Turn
        </button>
        
        <div style={itemStyle}>
          <span style={labelStyle}>Mode</span>
          <span style={modeValueStyle}>{actionMode}</span>
        </div>
      </div>
    </div>
  );
};
