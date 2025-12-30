import { useState, useEffect, useMemo } from 'react';
import './App.css'
import { GameBoard } from '../ui/GameBoard';
import { UnitPicker } from '../ui/UnitPicker';
import { UnitStatsPanel } from '../ui/UnitStatsPanel';
import { HUD } from '../ui/HUD';
import { BackgroundMusic } from '../ui/BackgroundMusic';
import { RulesModal } from '../ui/RulesModal';
import type { GameState, Unit, Position } from './game/GameState';
import bgImage from './assets/background/Gemini_Generated_Image_u709ybu709ybu709.png';
import { socket } from './socket';

/**
 * App: Main game container.
 * - Subscribes to server state/events and persists session data.
 * - Sends player actions to the backend and renders the board/HUD.
 * - Manages UI selections, timers, music, and rules modal.
 */
function App() {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [inactivityInfo, setInactivityInfo] = useState<{ seconds: number; deadline: number; currentPlayer: number } | null>(null);
  const [disconnectGrace, setDisconnectGrace] = useState<{ seconds: number; deadline: number } | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [rematchOfferGameId, setRematchOfferGameId] = useState<string | null>(null);
  const [rematchRequested, setRematchRequested] = useState<boolean>(false);
  const [rematchUnavailable, setRematchUnavailable] = useState<boolean>(false);
  const [isSurrendered, setIsSurrendered] = useState<boolean>(false);
  
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
  const reconnectToken = useMemo(() => localStorage.getItem('novusx.reconnectToken') || '', []);
  // Subscribe to server events and keep local state in sync
  useEffect(() => {
    if (!gameId) {
      window.location.hash = '#/lobby';
      return;
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
        // Clear any active timers on game end
        setInactivityInfo(null);
        setDisconnectGrace(null);
      }
    };
    const onOpponentDisc = (payload: { gameId: string; graceSeconds: number }) => {
      if (payload?.gameId === gameId) {
        console.warn('Opponent disconnected. Grace seconds:', payload.graceSeconds);
        setDisconnectGrace({ seconds: payload.graceSeconds, deadline: Date.now() + payload.graceSeconds * 1000 });
      }
    };
    const onForfeit = (payload: { gameId: string; reason: string }) => {
      if (payload?.gameId === gameId) {
        if (payload.reason === 'surrender') {
          setIsSurrendered(true);
        }
        console.warn('Opponent forfeited:', payload.reason);
      }
    };
    socket.on('STATE_UPDATE', onState);
    socket.on('ERROR', onError);
    socket.on('GAME_CONCLUDED', onConcluded);
    socket.on('OPPONENT_DISCONNECTED', onOpponentDisc);
    socket.on('PLAYER_FORFEIT', onForfeit);
    // Rematch offer from opponent
    socket.on('REMATCH_OFFER', (payload: { oldGameId: string }) => {
      // Store offer and present UI controls; do not auto-decline
      setRematchOfferGameId(payload.oldGameId);
    });
    // Acknowledgement that our rematch request was sent
    socket.on('REMATCH_REQUESTED', () => {
      setRematchRequested(true);
      setRematchUnavailable(false);
    });
    // Rematch started: set session and reload into new game
    socket.on('REMATCH_STARTED', (resp: { gameId: string; playerId: number; state: GameState; reconnectToken: string }) => {
      try {
        localStorage.setItem('novusx.gameId', resp.gameId);
        localStorage.setItem('novusx.playerId', String(resp.playerId));
        localStorage.setItem('novusx.reconnectToken', resp.reconnectToken);
        localStorage.setItem('novusx.state', JSON.stringify(resp.state));
      } catch {}
      // Force a reload to reinitialize App with the new gameId
      window.location.hash = '#/game';
      window.location.reload();
    });
    socket.on('REMATCH_DECLINED', () => {
      // Optional feedback; keep non-blocking
      console.warn('Rematch declined.');
      setRematchRequested(false);
    });
    socket.on('REMATCH_UNAVAILABLE', () => {
      // Opponent disconnected or offer already pending; disable offer button
      setRematchUnavailable(true);
      setRematchRequested(false);
    });
    socket.on('RESUME_GAME', (payload: { gameId: string; state: GameState }) => {
      if (payload?.gameId === gameId) {
        setGameState(payload.state);
        try { localStorage.setItem('novusx.state', JSON.stringify(payload.state)); } catch {}
        // Clear grace countdown on resume (opponent reconnected)
        setDisconnectGrace(null);
      }
    });
    socket.on('INACTIVITY_TIMER_START', (payload: { gameId: string; seconds: number; deadline: number; currentPlayer: number }) => {
      if (payload?.gameId === gameId) {
        setInactivityInfo({ seconds: payload.seconds, deadline: payload.deadline, currentPlayer: payload.currentPlayer });
      }
    });
    socket.on('INACTIVITY_TIMER_CANCEL', (payload: { gameId: string }) => {
      if (payload?.gameId === gameId) {
        setInactivityInfo(null);
      }
    });
    socket.on('DISCONNECT_GRACE_CANCEL', (payload: { gameId: string }) => {
      if (payload?.gameId === gameId) {
        setDisconnectGrace(null);
      }
    });
    return () => {
      socket.off('STATE_UPDATE', onState);
      socket.off('ERROR', onError);
      socket.off('GAME_CONCLUDED', onConcluded);
      socket.off('OPPONENT_DISCONNECTED', onOpponentDisc);
      socket.off('PLAYER_FORFEIT', onForfeit);
      socket.off('REMATCH_OFFER');
      socket.off('REMATCH_REQUESTED');
      socket.off('REMATCH_STARTED');
      socket.off('REMATCH_UNAVAILABLE');
      socket.off('REMATCH_DECLINED');
      socket.off('INACTIVITY_TIMER_START');
      socket.off('INACTIVITY_TIMER_CANCEL');
      socket.off('DISCONNECT_GRACE_CANCEL');
      socket.off('RESUME_GAME');
      // Keep connection alive; App unmount should not disconnect
    };
  }, [gameId]);

  // Attempt auto-reconnect on app load if reconnect data exists
  useEffect(() => {
    if (gameId && (playerId === 0 || playerId === 1) && reconnectToken) {
      socket.emit('RECONNECT', { type: 'RECONNECT', gameId, playerId, reconnectToken });
    }
  }, [gameId, playerId, reconnectToken]);

  // Update tick for local countdown display
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Reset selections at the start of each turn
  useEffect(() => {
    setSelectedDeployUnitType(null);
    setSelectedUnitId(null);
    setSelectedUnit(null);
  }, [gameState?.currentPlayer, gameState?.turnNumber]);

  /**
   * endTurnManually: Emit `END_TURN` when it's my turn and clear selections.
   */
  const endTurnManually = () => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    socket.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'END_TURN' } });
    // Clear UI selections
    setSelectedUnitId(null);
    setSelectedUnit(null);
    setSelectedDeployUnitType(null);
  };

  /**
   * toggleMusic: Enable/disable background music.
   */
  const toggleMusic = () => {
    setMusicEnabled((prev) => !prev);
  };

  /**
   * leaveGame: Emit `LEAVE_GAME`, clear session storage, and return to lobby.
   */
  const leaveGame = () => {
    socket.emit('LEAVE_GAME', { gameId });
    // Navigate back to lobby; other player will receive winner update
    try {
      localStorage.removeItem('novusx.state');
      localStorage.removeItem('novusx.gameId');
      localStorage.removeItem('novusx.playerId');
    } catch {}
    window.location.hash = '#/lobby';
  };

  /**
   * openRules: Show the rules modal.
   */
  const openRules = () => {
    setIsRulesOpen(true);
  };

  /**
   * closeRules: Hide the rules modal.
   */
  const closeRules = () => {
    setIsRulesOpen(false);
  };

  /**
   * handleMove: Request a unit move and clear selections.
   */
  const handleMove = (unitId: string, target: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    socket.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'MOVE', unitId, target } });
    setSelectedUnitId(null);
    setSelectedDeployUnitType(null);
  };

  /**
   * handleAttack: Request an attack from the selected unit.
   */
  const handleAttack = (attackerId: string, targetPos: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    socket.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'ATTACK', attackerId, targetPos } });
    setSelectedUnitId(null);
    setSelectedDeployUnitType(null);
  };

  /**
   * handleSelectUnit: Select/deselect a unit; blocks selecting enemy units.
   */
  const handleSelectUnit = (unit: Unit | null) => {
    // Allow selection even when it's not my turn (for viewing stats), but disallow selecting enemy units
    if (unit) {
      if (unit.ownerId !== playerId) return;
      if (selectedDeployUnitType !== null && gameState && unit.ownerId === gameState.currentPlayer) {
        setSelectedDeployUnitType(null);
      }
      setSelectedUnitId(unit.id);
      setSelectedUnit(unit);
    } else {
      setSelectedUnitId(null);
      setSelectedUnit(null);
    }
  };

  /**
   * handleRotate: Request a rotate/swap action for the selected unit.
   */
  const handleRotate = (unitId: string, targetPos: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    socket.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'ROTATE', unitId, targetPos } });
    setSelectedUnitId(null);
    setSelectedUnit(null);
    setSelectedDeployUnitType(null);
  };

  /**
   * handleDeploy: Request unit deployment to a valid tile.
   */
  const handleDeploy = (unitType: 'Swordsman' | 'Shieldman' | 'Spearman' | 'Cavalry' | 'Archer', targetPos: Position) => {
    if (winner !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    socket.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action: { kind: 'DEPLOY', unitType, targetPos } });
  };
  const isMyTurn = !!gameState && playerId !== -1 && gameState.currentPlayer === playerId;
  const inactivityRemaining = inactivityInfo ? Math.max(0, Math.ceil((inactivityInfo.deadline - nowTick) / 1000)) : null;
  const disconnectGraceRemaining = disconnectGrace ? Math.max(0, Math.ceil((disconnectGrace.deadline - nowTick) / 1000)) : null;

  /**
   * getActionMode: Compute UI mode label based on current selection.
   */
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

  // Full-screen background and overlay styles (unused styles removed)

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
        gameId={gameId}
        inactivityRemaining={inactivityRemaining}
        disconnectGraceRemaining={disconnectGraceRemaining}
        onEndTurn={endTurnManually}
        onLeaveGame={leaveGame}
        isTurnBlocked={isRulesOpen}
        musicEnabled={musicEnabled}
        onToggleMusic={toggleMusic}
        onOpenRules={openRules}
        onSurrender={() => socket.emit('SURRENDER', { gameId })}
      />)}
      {isRulesOpen && (
        <RulesModal onClose={closeRules} />
      )}
      {gameState && winner !== null && (
        <div style={winnerMessageStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>Player {winner} Wins!{isSurrendered ? ' (win by surrender)' : ''}</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  // Offer rematch to opponent for this finished game
                  socket.emit('REQUEST_REMATCH', { oldGameId: gameId });
                }}
                disabled={rematchRequested || !!rematchOfferGameId || rematchUnavailable}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${(rematchRequested || rematchOfferGameId || rematchUnavailable) ? '#d1d5db' : '#2563eb'}`,
                  background: (rematchRequested || rematchOfferGameId || rematchUnavailable) ? '#f3f4f6' : '#dbeafe',
                  color: (rematchRequested || rematchOfferGameId || rematchUnavailable) ? '#9ca3af' : '#1d4ed8',
                  cursor: (rematchRequested || rematchOfferGameId || rematchUnavailable) ? 'not-allowed' : 'pointer',
                }}
              >
                {rematchUnavailable ? 'Opponent offline' : rematchRequested ? 'Rematch offered…' : (rematchOfferGameId ? 'Rematch pending…' : 'Offer Rematch')}
              </button>
              <button
                onClick={() => {
                  // Return to lobby; keep game concluded state
                  window.location.hash = '#/lobby';
                }}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', background: '#f3f4f6', color: '#374151', cursor: 'pointer' }}
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
        {rematchOfferGameId && (
          <div style={{ marginTop: '12px', padding: '12px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontWeight: 'bold' }}>Opponent offered a rematch.</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    socket.emit('ACCEPT_REMATCH', { oldGameId: rematchOfferGameId });
                    setRematchOfferGameId(null);
                  }}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #059669', background: '#d1fae5', color: '#065f46', cursor: 'pointer' }}
                >
                  Accept
                </button>
                <button
                  onClick={() => {
                    socket.emit('DECLINE_REMATCH', { oldGameId: rematchOfferGameId });
                    setRematchOfferGameId(null);
                  }}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #b91c1c', background: '#fee2e2', color: '#7f1d1d', cursor: 'pointer' }}
                >
                  Decline
                </button>
              </div>
            </div>
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
          disabled={!isMyTurn}
        />
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
          viewerId={playerId}
        />)}
        <UnitStatsPanel unit={selectedUnit} />
      </div>
    </div>
  );
}

export default App
