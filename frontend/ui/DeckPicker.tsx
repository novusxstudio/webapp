import React from 'react';
import type { Card } from '../src/game/cards';

interface DeckPickerProps {
  deck: Card[];
  onChoose: (cardId: string) => void;
  onCancel: () => void;
}

export const DeckPicker: React.FC<DeckPickerProps> = ({ deck, onChoose, onCancel }) => {
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '800px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
  };

  const cancelButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  };

  const cardGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  };

  const cardItemStyle: React.CSSProperties = {
    padding: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#f9fafb',
  };

  const cardNameStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '4px',
    color: '#1f2937',
  };

  const cardTypeStyle: React.CSSProperties = {
    fontSize: '12px',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: '8px',
  };

  const cardDescriptionStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '8px',
  };

  const cardCostStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
  };

  const getCardTypeColor = (type: string): string => {
    switch (type) {
      case 'unit':
        return '#fbbf24';
      case 'spell':
        return '#a855f7';
      default:
        return '#6b7280';
    }
  };

  const handleCardClick = (cardId: string) => {
    onChoose(cardId);
  };

  const handleCardMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'translateY(-4px)';
    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    e.currentTarget.style.borderColor = '#3b82f6';
  };

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.borderColor = '#e5e7eb';
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Choose a Card from Your Deck</h2>
          <button style={cancelButtonStyle} onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div style={cardGridStyle}>
          {deck.map((card, index) => (
            <div
              key={`${card.id}-${index}`}
              style={cardItemStyle}
              onClick={() => handleCardClick(card.id)}
              onMouseEnter={handleCardMouseEnter}
              onMouseLeave={handleCardMouseLeave}
            >
              <div style={cardNameStyle}>{card.name}</div>
              <div style={{ ...cardTypeStyle, color: getCardTypeColor(card.type) }}>
                {card.type}
              </div>
              <div style={cardDescriptionStyle}>{card.description}</div>
              <div style={cardCostStyle}>Cost: {card.cost} 💰</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
