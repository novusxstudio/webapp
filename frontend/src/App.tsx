import { useState, useRef, useEffect } from 'react';
import './App.css'
import { GameBoard } from '../ui/GameBoard';
import { UnitPicker } from '../ui/UnitPicker';
import { UnitStatsPanel } from '../ui/UnitStatsPanel';
import { HUD } from '../ui/HUD';
import { BackgroundMusic } from '../ui/BackgroundMusic';
import { RulesModal } from '../ui/RulesModal';
import type { GameState, Tile, Unit, Player, Position } from './game/GameState';
import { createInitialGrid } from './game/setup';
import { applyMove, applyAttack, applyRotate, endTurn, controlsAllPoints, controlsPosition, applyDeployUnit } from './game/rules';
import bgImage from './assets/background/Gemini_Generated_Image_u709ybu709ybu709.png';

function App() {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  
  // Simplified: no spells/cards

  const createInitialGameState = (): GameState => {
    const grid: Tile[][] = createInitialGrid();

    // Initial actions: Player 0 starts with 1 action
    const players: Player[] = [
      { id: 0, actionsRemaining: 1 },
      { id: 1, actionsRemaining: 0 },
    ];

    return {
      grid,
      players,
      currentPlayer: 0,
      turnNumber: 1,
      freeDeploymentsRemaining: 0,
      hasActedThisTurn: false,
    };
  };
  const [selectedDeployUnitType, setSelectedDeployUnitType] = useState<'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer' | null>(null);

  const [gameState, setGameState] = useState<GameState>(createInitialGameState());

  // Reset UnitPicker to None at the beginning of each player's turn
  useEffect(() => {
    setSelectedDeployUnitType(null);
  }, [gameState.currentPlayer, gameState.turnNumber]);

  // Manual end-turn handler (does not consume an action)
  const endTurnManually = () => {
    if (winner !== null) return;
    try {
      const newState = endTurn(gameState);
      setGameState(newState);
      // Clear selections
      setSelectedUnitId(null);
      setSelectedUnit(null);
      setSelectedDeployUnitType(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const toggleMusic = () => {
    setMusicEnabled((prev) => !prev);
  };

  const openRules = () => {
    setIsRulesOpen(true);
  };

  const closeRules = () => {
    setIsRulesOpen(false);
  };

  const handleMove = (unitId: string, target: Position) => {
    if (winner !== null) return;
    
    try {
      // Apply move
      let newState = applyMove(gameState, unitId, target);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return { ...player };
      });
      
      newState = {
        ...newState,
        players: updatedPlayers,
        hasActedThisTurn: true,
        freeDeploymentsRemaining: 0,
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedUnitId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedUnitId(null);
      setSelectedDeployUnitType(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleAttack = (attackerId: string, targetPos: Position) => {
    if (winner !== null) return;
    
    try {
      // Apply attack
      let newState = applyAttack(gameState, attackerId, targetPos);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return { ...player };
      });
      
      newState = {
        ...newState,
        players: updatedPlayers,
        hasActedThisTurn: true,
        freeDeploymentsRemaining: 0,
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedUnitId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedUnitId(null);
      setSelectedDeployUnitType(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleSelectUnit = (unit: Unit | null) => {
    if (unit) {
      // If a deploy type is selected and user selects their own unit,
      // prefer selecting the unit and reset the picker to None.
      if (selectedDeployUnitType !== null && unit.ownerId === gameState.currentPlayer) {
        setSelectedDeployUnitType(null);
      }
      setSelectedUnitId(unit.id);
      setSelectedUnit(unit);
    } else {
      setSelectedUnitId(null);
      setSelectedUnit(null);
    }
  };

  const handleRotate = (unitId: string, targetPos: Position) => {
    if (winner !== null) return;
    
    try {
      // Apply rotate
      let newState = applyRotate(gameState, unitId, targetPos);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers,
        hasActedThisTurn: true,
        freeDeploymentsRemaining: 0,
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedUnitId(null);
          setSelectedUnit(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedUnitId(null);
      setSelectedUnit(null);
      setSelectedDeployUnitType(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleDeploy = (unitType: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer', targetPos: Position) => {
    if (winner !== null) return;
    try {
      let newState = applyDeployUnit(gameState, unitType as any, targetPos);

      const current = newState.currentPlayer;
      const freeAvailable = newState.freeDeploymentsRemaining > 0 && !newState.hasActedThisTurn;
      const updatedPlayers = newState.players.map((p, i) => {
        if (i !== current) return p;
        if (freeAvailable) return p; // free deploy, no action spent
        return { ...p, actionsRemaining: p.actionsRemaining - 1 };
      });

      newState = {
        ...newState,
        players: updatedPlayers,
        freeDeploymentsRemaining: freeAvailable ? newState.freeDeploymentsRemaining - 1 : 0,
        hasActedThisTurn: freeAvailable ? newState.hasActedThisTurn : true,
      };

      // If an action was consumed and actions hit 0, end the turn immediately
      if (!freeAvailable) {
        const currentPlayerIndex = newState.currentPlayer;
        if (newState.players[currentPlayerIndex].actionsRemaining <= 0) {
          // Check win before ending turn
          if (controlsAllPoints(newState, currentPlayerIndex)) {
            setWinner(currentPlayerIndex);
            setGameState(newState);
            // Beginning of next turn handled by effect; still clear picker now.
            setSelectedDeployUnitType(null);
            return;
          }
          newState = endTurn(newState);
        }
      }

      setGameState(newState);
    } catch (error) {
      // Ignore errors silently
    }
  };

  // Compute action mode
  const getActionMode = (): string => {
    if (selectedUnitId) {
      return 'Unit Action';
    }
    return 'Idle';
  };

  const appStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: '100vh',
    gap: '20px',
    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${bgImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
  };

  // Full-screen background and overlay styles
  const backgroundRootStyle: React.CSSProperties = {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
  };

  const backgroundImageStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundImage: 'url(/src/assets/background/Gemini_Generated_Image_u709ybu709ybu709.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    zIndex: 0,
    pointerEvents: 'none',
  };

  const backgroundOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 1,
    pointerEvents: 'none',
  };

  const gameContainerStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 2,
  };

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
  };
  const winnerMessageStyle: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 'bold',
    color: winner === 0 ? '#3b82f6' : '#ef4444',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  };

  return (
    <div style={appStyle}>
      <BackgroundMusic enabled={musicEnabled} />
      <HUD 
        currentPlayer={gameState.currentPlayer}
        turnNumber={gameState.turnNumber}
        actionsRemaining={gameState.players[gameState.currentPlayer].actionsRemaining}
        actionMode={getActionMode()}
        freeDeploymentsRemaining={gameState.freeDeploymentsRemaining}
        winner={winner}
        onEndTurn={endTurnManually}
        isTurnBlocked={isRulesOpen}
        musicEnabled={musicEnabled}
        onToggleMusic={toggleMusic}
        onOpenRules={openRules}
      />
      {isRulesOpen && (
        <RulesModal onClose={closeRules} />
      )}
      {winner !== null && (
        <div style={winnerMessageStyle}>
          Player {winner} Wins!
        </div>
      )}
      <div style={contentStyle}>
        <UnitPicker
          selected={selectedDeployUnitType}
          onSelect={(val) => {
            setSelectedDeployUnitType(val);
            // When choosing a deploy type (not None), deselect any currently selected board unit
            if (val !== null) {
              setSelectedUnitId(null);
              setSelectedUnit(null);
            }
          }}
        />
        <GameBoard 
          gameState={gameState}
          selectedUnitId={selectedUnitId}
          onSelectUnit={handleSelectUnit}
          onMove={handleMove}
          onAttack={handleAttack}
          onRotate={handleRotate}
          selectedDeployUnitType={selectedDeployUnitType}
          onDeploy={handleDeploy}
        />
        <UnitStatsPanel unit={selectedUnit} />
      </div>
    </div>
  );
}

export default App
