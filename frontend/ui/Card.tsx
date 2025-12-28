import React from 'react';
import type { Card } from '../src/game/cards';

interface CardProps {
  card: Card;
  isSelected: boolean;
  onSelect: () => void;
  canAfford?: boolean;
}

export const CardComponent: React.FC<CardProps> = ({ card, isSelected, onSelect, canAfford = true }) => {
  const cardStyle: React.CSSProperties = {
    width: '140px',
    height: '180px',
    backgroundColor: card.type === 'unit' ? '#fef3c7' : '#ddd6fe',
    border: isSelected ? '3px solid #3b82f6' : '2px solid #6b7280',
    borderRadius: '8px',
    padding: '12px',
    cursor: canAfford ? 'pointer' : 'not-allowed',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: isSelected ? '0 0 12px rgba(59, 130, 246, 0.6)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s ease',
    userSelect: 'none',
    opacity: canAfford ? 1 : 0.5,
    filter: canAfford ? 'none' : 'grayscale(50%)',
  };

  const nameStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  };

  const costStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 'bold',
    color: canAfford ? '#059669' : '#dc2626',
    textAlign: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    border: `2px solid ${canAfford ? '#059669' : '#dc2626'}`,
  };

  const typeStyle: React.CSSProperties = {
    fontSize: '11px',
    textTransform: 'uppercase',
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: 'bold',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#4b5563',
    textAlign: 'center',
    flex: 1,
    overflow: 'hidden',
  };

  return (
    <div style={cardStyle} onClick={onSelect}>
      <div style={nameStyle}>{card.name}</div>
      <div style={costStyle}>{card.cost}</div>
      <div style={typeStyle}>{card.type}</div>
      <div style={descriptionStyle}>{card.description}</div>
    </div>
  );
};
