import React from 'react';
import type { Unit } from '../src/game/GameState';

interface UnitStatsPanelProps {
  unit: Unit | null;
}

export const UnitStatsPanel: React.FC<UnitStatsPanelProps> = ({ unit }) => {
  const panelStyle: React.CSSProperties = {
    backgroundColor: '#f3f4f6',
    border: '2px solid #d1d5db',
    borderRadius: '8px',
    padding: '20px',
    minWidth: '250px',
    maxWidth: '300px',
    fontFamily: 'monospace',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#1f2937',
    borderBottom: '2px solid #9ca3af',
    paddingBottom: '8px',
  };

  const placeholderStyle: React.CSSProperties = {
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '40px 0',
  };

  const statRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px',
  };

  const statLabelStyle: React.CSSProperties = {
    color: '#4b5563',
    fontWeight: 'bold',
  };

  const statValueStyle: React.CSSProperties = {
    color: '#1f2937',
  };

  const ownerStyle = (ownerId: number): React.CSSProperties => ({
    color: ownerId === 0 ? '#3b82f6' : '#ef4444',
    fontWeight: 'bold',
  });

  if (!unit) {
    return (
      <div style={panelStyle}>
        <div style={titleStyle}>Unit Stats</div>
        <div style={placeholderStyle}>No unit selected</div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>Unit Stats</div>
      
      <div style={statRowStyle}>
        <span style={statLabelStyle}>ID:</span>
        <span style={statValueStyle}>{unit.id}</span>
      </div>

      <div style={statRowStyle}>
        <span style={statLabelStyle}>Owner:</span>
        <span style={ownerStyle(unit.ownerId)}>Player {unit.ownerId}</span>
      </div>

      <div style={statRowStyle}>
        <span style={statLabelStyle}>Type:</span>
        <span style={statValueStyle}>{unit.stats.type}</span>
      </div>

      <div style={statRowStyle}>
        <span style={statLabelStyle}>Move Range:</span>
        <span style={statValueStyle}>{unit.stats.moveRange}</span>
      </div>

      <div style={statRowStyle}>
        <span style={statLabelStyle}>Attack Range:</span>
        <span style={statValueStyle}>{unit.stats.attackRange}</span>
      </div>
    </div>
  );
};
