import React from 'react';
import { Tile } from './Tile';
import { SpellOverlay } from './SpellOverlay';
import type { GameState, Position, Unit } from '../src/game/GameState';
import { getDistance, canDeploy, canCastSpell, canRotate } from '../src/game/rules';
import { CARDS } from '../src/game/cards';

interface GameBoardProps {
  gameState: GameState;
  selectedUnitId: string | null;
  selectedCardId: string | null;
  onSelectUnit: (unit: Unit | null) => void;
  onMove: (unitId: string, target: Position) => void;
  onAttack: (attackerId: string, targetPos: Position) => void;
  onDeploy: (cardId: string, targetPos: Position) => void;
  onCastSpell: (cardId: string, targetPos: Position) => void;
  onRotate: (unitId: string, targetPos: Position) => void;
  activeSpellOverlay: { position: Position; spellType: 'lightning' | 'healing'; ownerId: number } | null;
}

export const GameBoard: React.FC<GameBoardProps> = ({ gameState, selectedUnitId, selectedCardId, onSelectUnit, onMove, onAttack, onDeploy, onCastSpell, onRotate, activeSpellOverlay }) => {
  const TILE_SIZE = 100;
  const UNIT_SIZE = TILE_SIZE * 0.8;
  const controlPoints = [
    { row: 3, col: 1 },
    { row: 3, col: 3 },
    { row: 3, col: 5 },
  ];

  const isControlPoint = (row: number, col: number): boolean => {
    return controlPoints.some(cp => cp.row === row && cp.col === col);
  };

  const getUnitAtPosition = (row: number, col: number) => {
    const tile = gameState.grid[row - 1][col - 1];
    if (tile.unit) {
      return {
        id: tile.unit.id,
        ownerId: tile.unit.ownerId,
      };
    }
    return null;
  };

  const getControlPointOwner = (row: number, col: number): number | null => {
    if (!isControlPoint(row, col)) return null;
    const unit = getUnitAtPosition(row, col);
    return unit ? unit.ownerId : null;
  };

  const findSelectedUnit = () => {
    if (!selectedUnitId) return null;
    
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const unit = gameState.grid[row][col].unit;
        if (unit && unit.id === selectedUnitId) {
          return unit;
        }
      }
    }
    return null;
  };

  const canTakeAction = (): boolean => {
    const selectedUnit = findSelectedUnit();
    if (!selectedUnit) return false;
    
    // Check if unit belongs to current player
    if (selectedUnit.ownerId !== gameState.currentPlayer) return false;
    
    // Check if current player has actions remaining
    const currentPlayerData = gameState.players[gameState.currentPlayer];
    if (currentPlayerData.actionsRemaining <= 0) return false;
    
    return true;
  };

  const isValidMoveDestination = (row: number, col: number): boolean => {
    const selectedUnit = findSelectedUnit();
    if (!selectedUnit) return false;
    
    if (!canTakeAction()) return false;

    const tile = gameState.grid[row - 1][col - 1];
    if (tile.unit !== null) return false;

    const distance = getDistance(selectedUnit.position, { row, col });
    if (distance > selectedUnit.stats.moveRange) return false;

    // Check for blocked path (orthogonal moves with distance > 1)
    const dx = Math.abs(col - selectedUnit.position.col);
    const dy = Math.abs(row - selectedUnit.position.row);
    const isDiagonal = dx === 1 && dy === 1;
    
    if (!isDiagonal && distance > 1) {
      // For orthogonal moves with distance > 1, check intermediate tile
      const midRow = Math.floor((selectedUnit.position.row + row) / 2);
      const midCol = Math.floor((selectedUnit.position.col + col) / 2);
      const intermediateTile = gameState.grid[midRow - 1][midCol - 1];
      if (intermediateTile.unit !== null) return false;
    }

    return true;
  };

  const isValidAttackTarget = (row: number, col: number): boolean => {
    const selectedUnit = findSelectedUnit();
    if (!selectedUnit) return false;

    if (!canTakeAction()) return false;

    const tile = gameState.grid[row - 1][col - 1];
    if (tile.unit === null) return false;

    // Must be enemy unit
    if (tile.unit.ownerId === selectedUnit.ownerId) return false;

    const distance = getDistance(selectedUnit.position, { row, col });
    return distance <= selectedUnit.stats.attackRange;
  };

  const isValidDeployTarget = (row: number, col: number): boolean => {
    if (!selectedCardId) return false;
    
    // Only for unit cards
    const card = CARDS[selectedCardId];
    if (!card || card.type !== 'unit') return false;
    
    // Check if current player has actions remaining
    const currentPlayerData = gameState.players[gameState.currentPlayer];
    if (currentPlayerData.actionsRemaining <= 0) return false;
    
    return canDeploy(gameState, selectedCardId, { row, col });
  };

  const isValidSpellTarget = (row: number, col: number): boolean => {
    if (!selectedCardId) return false;
    
    // Only for spell cards
    const card = CARDS[selectedCardId];
    if (!card || card.type !== 'spell') return false;
    
    // Check if current player has actions remaining
    const currentPlayerData = gameState.players[gameState.currentPlayer];
    if (currentPlayerData.actionsRemaining <= 0) return false;
    
    return canCastSpell(gameState, selectedCardId, { row, col });
  };

  const isValidRotateTarget = (row: number, col: number): boolean => {
    if (!selectedUnitId) return false;
    
    if (!canTakeAction()) return false;
    
    return canRotate(gameState, selectedUnitId, { row, col });
  };

  const handleTileClick = (row: number, col: number) => {
    // Don't allow interactions while spell overlay is active
    if (activeSpellOverlay !== null) return;
    
    const isMoveTarget = isValidMoveDestination(row, col);
    const isAttackTarget = isValidAttackTarget(row, col);
    const isDeployTarget = isValidDeployTarget(row, col);
    const isSpellTarget = isValidSpellTarget(row, col);
    const isRotateTarget = isValidRotateTarget(row, col);
    
    // If tile is a rotate target, execute rotate
    if (isRotateTarget && selectedUnitId) {
      onRotate(selectedUnitId, { row, col });
      return;
    }
    
    // If tile is a spell target, execute spell
    if (isSpellTarget && selectedCardId) {
      onCastSpell(selectedCardId, { row, col });
      return;
    }
    
    // If tile is a deploy target, execute deployment
    if (isDeployTarget && selectedCardId) {
      onDeploy(selectedCardId, { row, col });
      return;
    }
    
    // If tile is an attack target, execute attack
    if (isAttackTarget && selectedUnitId && canTakeAction()) {
      onAttack(selectedUnitId, { row, col });
      return;
    }
    
    // If tile is a move target, execute move
    if (isMoveTarget && selectedUnitId && canTakeAction()) {
      onMove(selectedUnitId, { row, col });
      return;
    }
    
    // Otherwise, handle unit selection
    const tile = gameState.grid[row - 1][col - 1];
    if (tile.unit) {
      if (selectedUnitId === tile.unit.id) {
        onSelectUnit(null);
      } else {
        onSelectUnit(tile.unit);
      }
    }
  };

  const boardStyle: React.CSSProperties = {
    display: 'inline-block',
    position: 'relative',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
  };

  return (
    <div style={boardStyle}>
      {[1, 2, 3, 4, 5].map(row => (
        <div key={row} style={rowStyle}>
          {[1, 2, 3, 4, 5].map(col => (
            <Tile
              key={`${row}-${col}`}
              row={row}
              col={col}
              isControlPoint={isControlPoint(row, col)}
              controlPointOwner={getControlPointOwner(row, col)}
              isHighlighted={isValidMoveDestination(row, col) || isValidDeployTarget(row, col) || isValidSpellTarget(row, col)}
              isAttackTarget={isValidAttackTarget(row, col)}
              isRotateTarget={isValidRotateTarget(row, col)}
              unit={getUnitAtPosition(row, col)}
              tileSize={TILE_SIZE}
              unitSize={UNIT_SIZE}
              onClick={() => handleTileClick(row, col)}
            />
          ))}
        </div>
      ))}
      {activeSpellOverlay && (
        <SpellOverlay
          position={activeSpellOverlay.position}
          spellType={activeSpellOverlay.spellType}
          tileSize={TILE_SIZE}
          unitSize={UNIT_SIZE}
          ownerId={activeSpellOverlay.ownerId}
        />
      )}
    </div>
  );
};
