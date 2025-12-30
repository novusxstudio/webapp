import React, { useState } from 'react';

interface UnitProps {
  unitId: string;
  ownerId: number;
  unitSize: number;
}

/**
 * Unit: Displays a unit card image with owner-colored border.
 * - Derives image path and fallback abbreviation from `unitId`.
 * - Shows a text fallback when the image fails to load.
 */
export const Unit: React.FC<UnitProps> = ({ unitId, ownerId, unitSize }) => {
  const [imageError, setImageError] = useState(false);

  /** Extract the unit type from its id string. */
  const getUnitType = (id: string): string => {
    // Remove player prefix and timestamp if present (e.g., "p0-spearman-123" -> "spearman")
    const parts = id.split('-');
    return parts[1] || parts[0];
  };

  /** Resolve the image path for the given unit type. */
  const getImagePath = (unitType: string): string => {
    // Convert to lowercase and remove spaces for filename
    const filename = unitType.toLowerCase().replace(/\s+/g, '');
    return `/src/assets/cards/${filename}.png`;
  };

  /** Provide a short text abbreviation used as a fallback label. */
  const getUnitAbbreviation = (id: string): string => {
    const unitType = getUnitType(id);
    
    const abbreviations: Record<string, string> = {
      spearman: 'SP',
      swordsman: 'SW',
      archer: 'AR',
      shieldman: 'SH',
      cavalry: 'CV',
    };
    
    return abbreviations[unitType] || unitType.substring(0, 2).toUpperCase();
  };

  const unitType = getUnitType(unitId);
  const imagePath = getImagePath(unitType);
  const borderColor = ownerId === 0 ? '#3b82f6' : '#ef4444';

  const containerStyle: React.CSSProperties = {
    width: `${unitSize}px`,
    height: `${unitSize}px`,
    border: `3px solid ${borderColor}`,
    backgroundColor: '#2d2d2d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  };

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: imageError ? 'none' : 'block',
  };

  const fallbackStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: imageError ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: borderColor,
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div style={containerStyle}>
      <img
        src={imagePath}
        alt={unitType}
        style={imageStyle}
        onError={() => setImageError(true)}
      />
      <div style={fallbackStyle}>
        {getUnitAbbreviation(unitId)}
      </div>
    </div>
  );
};
