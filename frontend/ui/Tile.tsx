import React from 'react';
import { Unit } from './Unit';

interface TileProps {
  row: number;
  col: number;
  isControlPoint: boolean;
  controlPointOwner?: number | null;
  isHighlighted?: boolean;
  isAttackTarget?: boolean;
  isRotateTarget?: boolean;
  unit?: { id: string; ownerId: number } | null;
  tileSize: number;
  unitSize: number;
  onClick?: () => void;
}

export const Tile: React.FC<TileProps> = ({ isControlPoint, controlPointOwner, isHighlighted, isAttackTarget, isRotateTarget, unit, tileSize, unitSize, onClick }) => {
  let borderColor = '#333';
  let backgroundColor = '#f0f0f0';
  
  // Apply tint for controlled control points
  if (isControlPoint && controlPointOwner !== null && controlPointOwner !== undefined) {
    backgroundColor = controlPointOwner === 0 ? '#dbeafe' : '#fee2e2';
    // Set border to the occupying player's color
    borderColor = controlPointOwner === 0 ? '#3b82f6' : '#ef4444';
  }
  
  // Override with action highlights
  if (isAttackTarget) {
    borderColor = '#dc2626';
    backgroundColor = '#fecaca';
  } else if (isRotateTarget) {
    borderColor = '#8b5cf6';
    backgroundColor = '#e9d5ff';
  } else if (isHighlighted) {
    borderColor = '#fbbf24';
    backgroundColor = '#fef3c7';
  }
  
  const tileStyle: React.CSSProperties = {
    width: `${tileSize}px`,
    height: `${tileSize}px`,
    border: `2px solid ${borderColor}`,
    boxSizing: 'border-box',
    position: 'relative',
    backgroundColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onClick ? 'pointer' : 'default',
  };

  const occupiedPulse = isControlPoint && unit && !isAttackTarget && !isRotateTarget && !isHighlighted;
  const pulseClass = occupiedPulse
    ? unit?.ownerId === 0
      ? 'cp-occupied-blue'
      : unit?.ownerId === 1
        ? 'cp-occupied-red'
        : undefined
    : undefined;

  return (
    <div style={tileStyle} className={pulseClass} onClick={onClick}>
      {isControlPoint && <div style={controlPointStyle} />}
      {unit && <Unit unitId={unit.id} ownerId={unit.ownerId} unitSize={unitSize} />}
    </div>
  );
};

const controlPointStyle: React.CSSProperties = {
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: '#ff6600',
  position: 'absolute',
};
