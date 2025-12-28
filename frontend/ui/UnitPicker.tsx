import React from 'react';
import { UNIT_DATA } from '../src/game/units';
import { getMatchupsForType } from '../src/game/rules';

interface UnitPickerProps {
  selected: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer' | null;
  onSelect: (u: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer' | null) => void;
  disabled?: boolean;
}

const options: Array<'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer'> = [
  'Swordsman',
  'Shieldman',
  'Spearman',
  'Cavalry',
  'Archer',
];

export const UnitPicker: React.FC<UnitPickerProps> = ({ selected, onSelect, disabled = false }) => {
  const container: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    minWidth: '180px',
  };
  const title: React.CSSProperties = {
    fontWeight: 700,
    fontSize: '14px',
    color: '#374151',
  };
  const list: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  };
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
    background: disabled ? '#f3f4f6' : active ? '#dbeafe' : '#f9fafb',
    color: disabled ? '#9ca3af' : active ? '#1d4ed8' : '#374151',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    textAlign: 'left',
  });

  return (
    <div style={container}>
      <div style={title}>Deployment</div>
      {disabled && (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Available in Deployment phase</div>
      )}
      <div style={list}>
        {options.map(o => (
          <button key={o} style={btn(selected === o)} onClick={() => !disabled && onSelect(o)} disabled={disabled}>
            {o}
          </button>
        ))}
        <button style={btn(selected === null)} onClick={() => !disabled && onSelect(null)} disabled={disabled}>None</button>
      </div>
      {selected && (() => {
        const entry = Object.entries(UNIT_DATA).find(([, stats]) => stats.type === selected);
        if (!entry) return null;
        const stats = entry[1];
        const match = getMatchupsForType(stats.type);
        const card: React.CSSProperties = {
          marginTop: '10px',
          padding: '10px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          background: '#f9fafb',
          fontSize: '12px',
          color: '#374151',
        };
        const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' };
        const label: React.CSSProperties = { fontWeight: 700 };
        const value: React.CSSProperties = { marginLeft: '8px' };
        return (
          <div style={card}>
            <div style={row}><span style={label}>Move Range:</span><span style={value}>{stats.moveRange}</span></div>
            <div style={row}><span style={label}>Attack Range:</span><span style={value}>{stats.attackRange}</span></div>
            <div style={row}><span style={label}>Beats:</span><span style={value}>{match.beats.join(', ') || '—'}</span></div>
            <div style={row}><span style={label}>Dies To:</span><span style={value}>{match.diesTo.join(', ') || '—'}</span></div>
          </div>
        );
      })()}
    </div>
  );
};
