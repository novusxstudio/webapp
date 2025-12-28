import { useState, useEffect, useMemo } from 'react';
import './App.css'
import { GameBoard } from '../ui/GameBoard';
import { UnitPicker } from '../ui/UnitPicker';
import { UnitStatsPanel } from '../ui/UnitStatsPanel';
import { HUD } from '../ui/HUD';
import { BackgroundMusic } from '../ui/BackgroundMusic';
import { RulesModal } from '../ui/RulesModal';
import type { GameState, Tile, Unit, Player, Position } from './game/GameState';
import { controlsAllPoints } from './game/rules';
import bgImage from './assets/background/Gemini_Generated_Image_u709ybu709ybu709.png';
// Socket.IO client via global (injected by Lobby or fallback here)
declare const io: any;
type Socket = any;

function App() {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  
  // Simplified: no local game mutations; state is authoritative from server
  const [selectedDeployUnitType, setSelectedDeployUnitType] = useState<'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer' | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(() => {
    try {
      const raw = localStorage.getItem('novusx.state');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });
  const gameId = useMemo(() => localStorage.getItem('novusx.gameId') || '', []);
  const playerId = useMemo(() => Number(localStorage.getItem('novusx.playerId') ?? '-1'), []);
  const [socketReady, setSocketReady] = useState(false);
  useMemo(() => {
    if (typeof io === 'undefined' && typeof window !== 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      s.onload = () => setSocketReady(true);
      document.head.appendChild(s);
    } else {
      setSocketReady(true);
    }
    return null as any;
  }, []);
  useEffect(() => {
    if (!gameId) {
      window.location.hash = '#/lobby';
      return;
    }
    if (!socketReady) return;
    // Reuse existing connection if present; otherwise create one
    let conn: Socket = (window as any).__novusx_socket;
    if (!conn) {
      conn = (window as any).io('http://localhost:3001');
      (window as any).__novusx_socket = conn;
    }
    const onState = (payload: { gameId: string; state: GameState }) => {
      if (payload?.gameId === gameId) {
        setGameState(payload.state);
        try { localStorage.setItem('novusx.state', JSON.stringify(payload.state)); } catch {}
      }
    };
    const onError = (e: { message: string }) => {
      // Optionally surface
      console.warn('Server error:', e?.message);
    };
    const onConcluded = (payload: { gameId: string; winner: number }) => {
      if (payload?.gameId === gameId) {
        setWinner(payload.winner);
      }
    };
    conn.on('STATE_UPDATE', onState);
    conn.on('ERROR', onError);
    conn.on('GAME_CONCLUDED', onConcluded);
    return () => {
      conn.off('STATE_UPDATE', onState);
      conn.off('ERROR', onError);
      conn.off('GAME_CONCLUDED', onConcluded);
      // Keep connection alive; App unmount should not disconnect
    };
  }, [socketReady, gameId]);

  // Reset UnitPicker to None at the beginning of each player's turn
  useEffect(() => {
    setSelectedDeployUnitType(null);
    // Clear selection when it's not my turn
    if (gameState && playerId !== -1 && gameState.currentPlayer !== playerId) {
      setSelectedUnitId(null);
      setSelectedUnit(null);
    }
  }, [gameState?.currentPlayer, gameState?.turnNumber]);

  // Manual end-turn: send intent to server
  const endTurnManually = () => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'END_TURN' } });
    // Clear UI selections
    setSelectedUnitId(null);
    setSelectedUnit(null);
    setSelectedDeployUnitType(null);
  };

  const toggleMusic = () => {
    setMusicEnabled((prev) => !prev);
  };

  const leaveGame = () => {
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('LEAVE_GAME', { gameId });
    // Navigate back to lobby; other player will receive winner update
    try {
      localStorage.removeItem('novusx.state');
      localStorage.removeItem('novusx.gameId');
      localStorage.removeItem('novusx.playerId');
    } catch {}
    window.location.hash = '#/lobby';
  };

  const openRules = () => {
    setIsRulesOpen(true);
  };

  const closeRules = () => {
    setIsRulesOpen(false);
  };

  const handleMove = (unitId: string, target: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'MOVE', unitId, target } });
    setSelectedUnitId(null);
    setSelectedDeployUnitType(null);
  };

  const handleAttack = (attackerId: string, targetPos: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'ATTACK', attackerId, targetPos } });
    setSelectedUnitId(null);
    setSelectedDeployUnitType(null);
  };

  const handleSelectUnit = (unit: Unit | null) => {
    // Disable selection when it's not my turn
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
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
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'ROTATE', unitId, targetPos } });
    setSelectedUnitId(null);
    setSelectedUnit(null);
    setSelectedDeployUnitType(null);
  };

  const handleDeploy = (unitType: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer', targetPos: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    const conn: Socket = (window as any).__novusx_socket;
    conn?.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'DEPLOY', unitType, targetPos } });
  };
  const isMyTurn = !!gameState && playerId !== -1 && gameState.currentPlayer === playerId;

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
      {gameState && (
      <HUD 
        currentPlayer={gameState.currentPlayer}
        turnNumber={gameState.turnNumber}
        actionsRemaining={gameState.players[gameState.currentPlayer].actionsRemaining}
        actionMode={getActionMode()}
        freeDeploymentsRemaining={gameState.freeDeploymentsRemaining}
        winner={winner}
        onEndTurn={endTurnManually}
        onLeaveGame={leaveGame}
        isTurnBlocked={isRulesOpen}
        musicEnabled={musicEnabled}
        onToggleMusic={toggleMusic}
        onOpenRules={openRules}
      />)}
      {isRulesOpen && (
        <RulesModal onClose={closeRules} />
      )}
      {gameState && winner !== null && (
        <div style={winnerMessageStyle}>
          Player {winner} Wins!
        </div>
      )}
      <div style={contentStyle}>
        {isMyTurn && (
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
        )}
        {gameState && (
        <GameBoard 
          gameState={gameState}
          selectedUnitId={selectedUnitId}
          onSelectUnit={handleSelectUnit}
          onMove={handleMove}
          onAttack={handleAttack}
          onRotate={handleRotate}
          selectedDeployUnitType={selectedDeployUnitType}
          onDeploy={handleDeploy}
          interactionDisabled={!isMyTurn}
        />)}
        <UnitStatsPanel unit={selectedUnit} />
      </div>
    </div>
  );
}

export default App
