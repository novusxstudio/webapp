import React from 'react';
import { UNIT_DATA } from '../src/game/units';
import { getMatchupsForType } from '../src/game/rules';

const MAX_DEPLOYMENTS_PER_TYPE = 3;

interface UnitPickerProps {
  selected: 'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman' | null;
  onSelect: (u: 'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman' | null) => void;
  deploymentsRemaining?: number;
  deploymentCounts?: Record<string, number>;
  disabled?: boolean;
}

const options: Array<'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman'> = [
  'Swordsman',
  'Shieldman',
  'Axeman',
  'Cavalry',
  'Archer',
  'Spearman',
];

/**
 * UnitPicker: Lists deployable unit types and shows stats/matchups.
 * - Allows selecting a unit type or None (exit deploy mode).
 * - Disables interactions on opponent's turn.
 */
export const UnitPicker: React.FC<UnitPickerProps> = ({ selected, onSelect, deploymentsRemaining, deploymentCounts = {}, disabled = false }) => {
  // Map display names to normalized keys used in deploymentCounts
  const typeToKey: Record<string, string> = {
    Swordsman: 'swordsman',
    Shieldman: 'shieldman',
    Axeman: 'axeman',
    Cavalry: 'cavalry',
    Archer: 'archer',
    Spearman: 'spearman',
  };
  
  const getRemainingForType = (unitType: string): number => {
    const key = typeToKey[unitType] || unitType.toLowerCase();
    const used = deploymentCounts[key] ?? 0;
    return MAX_DEPLOYMENTS_PER_TYPE - used;
  };
  const container: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    width: '240px',
    minHeight: '360px',
    maxHeight: '500px',
    boxSizing: 'border-box',
  };
  const title: React.CSSProperties = {
    fontWeight: 700,
    fontSize: '14px',
    color: '#374151',
  };
  const contentArea: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflowY: 'auto',
    flex: 1,
  };
  const list: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  };
  const btn = (active: boolean, exhausted: boolean = false): React.CSSProperties => ({
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${exhausted ? '#fecaca' : active ? '#2563eb' : '#d1d5db'}`,
    background: exhausted ? '#fee2e2' : disabled ? '#f3f4f6' : active ? '#dbeafe' : '#f9fafb',
    color: exhausted ? '#b91c1c' : disabled ? '#9ca3af' : active ? '#1d4ed8' : '#374151',
    cursor: (disabled || exhausted) ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    textAlign: 'left',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  
  const countBadge = (remaining: number): React.CSSProperties => ({
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '4px',
    background: remaining === 0 ? '#fecaca' : remaining === 1 ? '#fef3c7' : '#d1fae5',
    color: remaining === 0 ? '#b91c1c' : remaining === 1 ? '#92400e' : '#065f46',
  });

  return (
    <div style={container}>
      <div style={title}>Deployment</div>
      {disabled && (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Unavailable on opponent's turn</div>
      )}
      <div style={contentArea}>
        <div style={list}>
          {options.map(o => {
            const remaining = getRemainingForType(o);
            const exhausted = remaining <= 0;
            return (
              <button 
                key={o} 
                style={btn(selected === o, exhausted)} 
                onClick={() => !disabled && !exhausted && onSelect(o)} 
                disabled={disabled || exhausted}
              >
                <span>{o}</span>
                <span style={countBadge(remaining)}>{remaining}/{MAX_DEPLOYMENTS_PER_TYPE}</span>
              </button>
            );
          })}
          <button style={btn(selected === null)} onClick={() => !disabled && onSelect(null)} disabled={disabled}>None</button>
        </div>
        {selected && (() => {
          const entry = Object.entries(UNIT_DATA).find(([, stats]) => stats.type === selected);
          if (!entry) return null;
          const stats = entry[1];
          const match = getMatchupsForType(stats.type);
          const card: React.CSSProperties = {
            marginTop: '12px',
            padding: '12px',
            border: '2px solid #3b82f6',
            borderRadius: '8px',
            background: '#eff6ff',
            fontSize: '12px',
            color: '#374151',
          };
          const cardTitle: React.CSSProperties = {
            fontWeight: 700,
            fontSize: '13px',
            color: '#1d4ed8',
            marginBottom: '10px',
            borderBottom: '1px solid #bfdbfe',
            paddingBottom: '6px',
          };
          const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' };
          const label: React.CSSProperties = { fontWeight: 600, color: '#4b5563' };
          const value: React.CSSProperties = { marginLeft: '8px', color: '#1f2937' };
          return (
            <div style={card}>
              <div style={cardTitle}>{selected} Stats</div>
              <div style={row}><span style={label}>Move Range:</span><span style={value}>{stats.moveRange}</span></div>
              <div style={row}><span style={label}>Attack Range:</span><span style={value}>{stats.attackRange}</span></div>
              <div style={row}><span style={label}>Beats (Melee):</span><span style={value}>{match.beatsMelee.join(', ') || '—'}</span></div>
              <div style={row}><span style={label}>Beats (Ranged):</span><span style={value}>{match.beatsRanged.length > 0 ? match.beatsRanged.join(', ') : '—'}</span></div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
