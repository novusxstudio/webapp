import React from 'react';
import type { Card } from '../src/game/cards';

interface DiscardViewerProps {
  discard: Card[];
  coins: number;
  actionsRemaining: number;
  onRetrieve: (cardId: string) => void;
  onClose: () => void;
}

export const DiscardViewer: React.FC<DiscardViewerProps> = ({ discard, coins, actionsRemaining, onRetrieve, onClose }) => {
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '700px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '12px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
  };

  const closeButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    backgroundColor: '#6b7280',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
  };

  const cardStyle = (canAfford: boolean, hasActions: boolean): React.CSSProperties => {
    const isDisabled = !canAfford || !hasActions;
    return {
      padding: '16px',
      backgroundColor: isDisabled ? '#f3f4f6' : '#ffffff',
      border: isDisabled ? '2px solid #d1d5db' : '2px solid #3b82f6',
      borderRadius: '8px',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.5 : 1,
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    };
  };

  const cardNameStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
  };

  const cardCostStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#6b7280',
  };

  const cardTypeStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#9ca3af',
    textTransform: 'capitalize',
  };

  const emptyStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px',
    color: '#6b7280',
    fontSize: '16px',
  };

  const infoStyle: React.CSSProperties = {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#4b5563',
  };

  const handleCardClick = (card: Card) => {
    const canAfford = coins >= card.cost;
    const hasActions = actionsRemaining > 0;
    
    if (canAfford && hasActions) {
      onRetrieve(card.id);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={titleStyle}>Discard Pile</span>
          <button style={closeButtonStyle} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={infoStyle}>
          💰 Coins: {coins} | ⚡ Actions: {actionsRemaining}
          <br />
          Click a card to retrieve it for its cost (requires 1 action)
        </div>

        {discard.length === 0 ? (
          <div style={emptyStyle}>
            Your discard pile is empty.
          </div>
        ) : (
          <div style={gridStyle}>
            {discard.map((card, index) => {
              const canAfford = coins >= card.cost;
              const hasActions = actionsRemaining > 0;
              
              return (
                <div
                  key={`${card.id}-${index}`}
                  style={cardStyle(canAfford, hasActions)}
                  onClick={() => handleCardClick(card)}
                >
                  <div style={cardNameStyle}>{card.name}</div>
                  <div style={cardCostStyle}>💰 Cost: {card.cost}</div>
                  <div style={cardTypeStyle}>{card.type}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
