import React from 'react';
import type { Position } from '../src/game/GameState';

interface SpellOverlayProps {
  position: Position;
  spellType: 'lightning' | 'healing';
  tileSize: number;
  unitSize: number;
  ownerId: number;
}

export const SpellOverlay: React.FC<SpellOverlayProps> = ({
  position,
  spellType,
  tileSize,
  unitSize,
  ownerId,
}) => {
  const spellIcons = {
    lightning: '/src/assets/spells/lightningstrike.png',
    healing: '/src/assets/spells/healingcircle.png',
  };

  const borderColor = ownerId === 0 ? '#3b82f6' : '#ef4444';
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(position.col - 1) * tileSize}px`,
    top: `${(position.row - 1) * tileSize}px`,
    width: `${tileSize}px`,
    height: `${tileSize}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 1000,
  };

  const iconContainerStyle: React.CSSProperties = {
    width: `${unitSize}px`,
    height: `${unitSize}px`,
    border: `3px solid ${borderColor}`,
    backgroundColor: '#000000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const iconStyle: React.CSSProperties = {
    width: '90%',
    height: '90%',
    opacity: 0.9,
    filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.8))',
    animation: 'spellFadeIn 0.2s ease-in',
  };

  return (
    <>
      <style>
        {`
          @keyframes spellFadeIn {
            from {
              opacity: 0;
              transform: scale(0.8);
            }
            to {
              opacity: 0.9;
              transform: scale(1);
            }
          }
        `}
      </style>
      <div style={overlayStyle}>
        <div style={iconContainerStyle}>
          <img src={spellIcons[spellType]} alt={spellType} style={iconStyle} />
        </div>
      </div>
    </>
  );
}
