import React from 'react';
import { Tile } from './Tile';
import type { GameState, Position, Unit } from '../src/game/GameState';
import { getDistance, canRotate, canAttack, canDeployUnit } from '../src/game/rules';

interface GameBoardProps {
  gameState: GameState;
  selectedUnitId: string | null;
  onSelectUnit: (unit: Unit | null) => void;
  onMove: (unitId: string, target: Position) => void;
  onAttack: (attackerId: string, targetPos: Position) => void;
  onRotate: (unitId: string, targetPos: Position) => void;
  selectedDeployUnitType?: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer' | null;
  onDeploy?: (unitType: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer', targetPos: Position) => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ gameState, selectedUnitId, onSelectUnit, onMove, onAttack, onRotate, selectedDeployUnitType = null, onDeploy }) => {
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

    // Use rules.canAttack for Archer line-of-sight and ranges
    return canAttack(gameState, selectedUnit.id, { row, col });
  };

  const isValidRotateTarget = (row: number, col: number): boolean => {
    if (!selectedUnitId) return false;
    
    if (!canTakeAction()) return false;
    
    return canRotate(gameState, selectedUnitId, { row, col });
  };

  const isValidDeploymentTile = (row: number, col: number): boolean => {
    if (!selectedDeployUnitType) return false;
    try {
      return canDeployUnit(gameState, selectedDeployUnitType as any, { row, col });
    } catch {
      return false;
    }
  };

  const handleTileClick = (row: number, col: number) => {
    // Deployment: place unit if valid
    if (selectedDeployUnitType && onDeploy) {
      if (isValidDeploymentTile(row, col)) {
        onDeploy(selectedDeployUnitType, { row, col });
        return;
      }

      // In deploy mode: clicking on a unit while a unit is already selected
      // should deselect the currently selected unit instead of switching selection.
      const clicked = gameState.grid[row - 1][col - 1];
      if (clicked.unit) {
        if (selectedUnitId) {
          onSelectUnit(null);
          return;
        }
        // If no unit is currently selected and it's your own unit, select it
        // (App will reset the picker to None when selecting your own unit).
        if (clicked.unit.ownerId === gameState.currentPlayer) {
          onSelectUnit(clicked.unit);
          return;
        }
      }
    }

    // Simplified interactions: move/attack/rotate only (Action phase)
    const isMoveTarget = isValidMoveDestination(row, col);
    const isAttackTarget = isValidAttackTarget(row, col);
    const isRotateTarget = isValidRotateTarget(row, col);
    
    // If tile is a rotate target, execute rotate
    if (isRotateTarget && selectedUnitId) {
      onRotate(selectedUnitId, { row, col });
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
              isHighlighted={isValidMoveDestination(row, col) || isValidDeploymentTile(row, col)}
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
    </div>
  );
};
