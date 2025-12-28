import React from 'react';
import { CardComponent } from './Card';
import type { Card } from '../src/game/cards';

interface HandProps {
  cards: Card[];
  selectedCardId: string | null;
  onSelectCard: (cardId: string | null) => void;
  onSellCard: (cardId: string) => void;
  onDrawCard: () => void;
  playerCoins: number;
  deckSize: number;
  actionsRemaining: number;
}

export const Hand: React.FC<HandProps> = ({ cards, selectedCardId, onSelectCard, onSellCard, onDrawCard, playerCoins, deckSize, actionsRemaining }) => {
  const handleCardClick = (cardId: string) => {
    if (selectedCardId === cardId) {
      onSelectCard(null);
    } else {
      onSelectCard(cardId);
    }
  };

  const handleSellClick = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSellCard(cardId);
  };

  const handContainerStyle: React.CSSProperties = {
    backgroundColor: '#1f2937',
    padding: '16px',
    borderRadius: '8px',
    boxShadow: '0 -4px 6px rgba(0, 0, 0, 0.1)',
  };

  const handStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    alignItems: 'center',
  };

  const titleStyle: React.CSSProperties = {
    color: '#f3f4f6',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '12px',
    textAlign: 'center',
  };

  const cardContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'center',
  };

  const sellButtonStyle: React.CSSProperties = {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const drawButtonStyle: React.CSSProperties = {
    backgroundColor: playerCoins >= 1 && deckSize > 0 && actionsRemaining > 0 ? '#059669' : '#6b7280',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: playerCoins >= 1 && deckSize > 0 && actionsRemaining > 0 ? 'pointer' : 'not-allowed',
    transition: 'background-color 0.2s',
    opacity: playerCoins >= 1 && deckSize > 0 && actionsRemaining > 0 ? 1 : 0.5,
  };

  const drawButtonContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '8px',
  };

  const canDraw = playerCoins >= 1 && deckSize > 0 && actionsRemaining > 0;

  return (
    <div style={handContainerStyle}>
      <div style={titleStyle}>Your Hand</div>
      <div style={handStyle}>
        {cards.map((card, index) => (
          <div key={`${card.id}-${index}`} style={cardContainerStyle}>
            <CardComponent
              card={card}
              isSelected={selectedCardId === card.id}
              onSelect={() => handleCardClick(card.id)}
              canAfford={playerCoins >= card.cost}
            />
            {selectedCardId === card.id && (
              <button
                style={sellButtonStyle}
                onClick={(e) => handleSellClick(card.id, e)}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              >
                Sell (+1 coin)
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={drawButtonContainerStyle}>
        <button
          style={drawButtonStyle}
          onClick={onDrawCard}
          disabled={!canDraw}
          onMouseOver={(e) => {
            if (canDraw) {
              e.currentTarget.style.backgroundColor = '#047857';
            }
          }}
          onMouseOut={(e) => {
            if (canDraw) {
              e.currentTarget.style.backgroundColor = '#059669';
            }
          }}
        >
          Draw Card (1 coin)
        </button>
      </div>
    </div>
  );
};
