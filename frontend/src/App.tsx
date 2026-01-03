import { useState, useEffect, useMemo, useRef } from 'react';
import './App.css'
import { GameBoard } from '../ui/GameBoard';
import GameLog from '../ui/GameLog';
import { UnitPicker } from '../ui/UnitPicker';
import { UnitStatsPanel } from '../ui/UnitStatsPanel';
import { HUD } from '../ui/HUD';
import { BackgroundMusic } from '../ui/BackgroundMusic';
import { RulesModal } from '../ui/RulesModal';
import type { GameState, Unit, Position } from './game/GameState';
import bgImage from './assets/background/Gemini_Generated_Image_u709ybu709ybu709.png';
import { getSocket } from './socket';

// =============================================================================
// LOGGING HELPERS
// =============================================================================

function posStr(pos?: { row: number; col: number }) {
  return pos ? `[${pos.row},${pos.col}]` : '';
}

function unitTypeStr(unit?: { stats: { type: string } }) {
  return unit?.stats?.type || '';
}

function findUnitById(state: GameState, id: string | undefined): Unit | undefined {
  if (!id) return undefined;
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.unit && tile.unit.id === id) return tile.unit;
    }
  }
  return undefined;
}

function findUnitAt(state: GameState, pos: Position | undefined): Unit | undefined {
  if (!pos) return undefined;
  const tile = state.grid[pos.row - 1]?.[pos.col - 1];
  return tile?.unit || undefined;
}

function formatLogEntry(prevState: GameState, newState: GameState, lastAction: any): string | null {
  if (!lastAction) return null;
  const p = `player ${lastAction.by}`;
  switch (lastAction.type) {
    case 'DEPLOY': {
      return `${p} deployed ${lastAction.unitType} at ${posStr(lastAction.to)}`;
    }
    case 'MOVE': {
      const before = findUnitById(prevState, lastAction.unitId);
      const after = findUnitById(newState, lastAction.unitId);
      if (before && after) {
        return `${p} moved ${unitTypeStr(before)} from ${posStr(before.position)} to ${posStr(after.position)}`;
      }
      return `${p} moved unit`;
    }
    case 'ROTATE': {
      const u1Before = findUnitById(prevState, lastAction.unitId);
      const u2Before = findUnitAt(prevState, lastAction.to);
      const u1After = findUnitById(newState, lastAction.unitId);
      let u2After: Unit | undefined = undefined;
      if (u1Before && u2Before && u1After) {
        u2After = findUnitAt(newState, u1Before.position);
        const dx = Math.abs(u1Before.position.col - u2Before.position.col);
        const dy = Math.abs(u1Before.position.row - u2Before.position.row);
        const isCavalryLong = (u1Before.stats.type === 'Cavalry') && ((dx === 2 && dy === 0) || (dx === 0 && dy === 2));
        if (isCavalryLong) {
          const midPos = {
            row: dy === 0 ? u1Before.position.row : (u1Before.position.row + u2Before.position.row) / 2,
            col: dx === 0 ? u1Before.position.col : (u1Before.position.col + u2Before.position.col) / 2,
          };
          const midAfter = findUnitAt(newState, midPos);
          let log = `${p} rotated ${unitTypeStr(u1Before)} from ${posStr(u1Before.position)} to ${posStr(u1After.position)}, ${unitTypeStr(u2Before)} from ${posStr(u2Before.position)} to ${posStr(midAfter?.position)}`;
          const midBefore = findUnitAt(prevState, midPos);
          if (midBefore && midAfter && u2After) {
            log += `, and ${unitTypeStr(midBefore)} from ${posStr(midPos)} to ${posStr(u2After.position)}`;
          }
          return log;
        }
      }
      if (u1Before && u2Before && u1After && u2After) {
        return `${p} rotated ${unitTypeStr(u1Before)} from ${posStr(u1Before.position)} to ${posStr(u1After.position)} and ${unitTypeStr(u2Before)} from ${posStr(u2Before.position)} to ${posStr(u2After.position)}`;
      }
      return `${p} rotated units`;
    }
    case 'ATTACK': {
      const attackerBefore = findUnitById(prevState, lastAction.unitId);
      const defenderBefore = findUnitById(prevState, lastAction.targetId);
      if (attackerBefore && defenderBefore) {
        const attackerAfter = findUnitById(newState, lastAction.unitId);
        const defenderAfter = findUnitById(newState, lastAction.targetId);
        const dist = Math.abs(attackerBefore.position.row - defenderBefore.position.row) + 
                     Math.abs(attackerBefore.position.col - defenderBefore.position.col);
        const battleType = dist > 1 ? 'ranged' : 'melee';
        let outcome = '';
        if (!attackerAfter && !defenderAfter) {
          outcome = ` → Both units defeated!`;
        } else if (!defenderAfter) {
          outcome = ` → ${unitTypeStr(defenderBefore)} defeated!`;
        } else if (!attackerAfter) {
          outcome = ` → ${unitTypeStr(attackerBefore)} defeated!`;
        } else {
          outcome = ` → No casualties`;
        }
        return `${p}'s ${unitTypeStr(attackerBefore)} at ${posStr(attackerBefore.position)} ${battleType} battled player ${defenderBefore.ownerId}'s ${unitTypeStr(defenderBefore)} at ${posStr(defenderBefore.position)}${outcome}`;
      }
      return `${p} attacked`;
    }
    case 'END_TURN':
      return `${p} ended their turn`;
    default:
      return null;
  }
}

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

/**
 * App: Main game container (PvP only).
 * 
 * KEY PRINCIPLES:
 * - Server state is the ONLY source of truth
 * - Frontend NEVER computes game outcomes
 * - Frontend ONLY renders and sends actions
 * - All validation happens server-side
 */
function App() {
  // UI State (local only)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedDeployUnitType, setSelectedDeployUnitType] = useState<'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman' | null>(null);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  
  // Game State (from server)
  const [gameState, setGameState] = useState<GameState | null>(() => {
    try {
      const raw = localStorage.getItem('novusx.state');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });
  
  // Game End State
  const [winner, setWinner] = useState<number | null>(null);
  const [drawReason, setDrawReason] = useState<string | null>(null);
  const [isSurrendered, setIsSurrendered] = useState<boolean>(false);
  
  // Timer State
  const [inactivityInfo, setInactivityInfo] = useState<{ seconds: number; deadline: number; currentPlayer: number } | null>(null);
  const [disconnectGrace, setDisconnectGrace] = useState<{ seconds: number; deadline: number } | null>(null);
  
  // Connection Status
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  
  // Game Log
  const [log, setLog] = useState<{ text: string }[]>([]);
  const lastActionRef = useRef<any>(null);
  const prevStateRef = useRef<GameState | null>(null);
  
  // Session Info (from localStorage)
  const gameId = useMemo(() => localStorage.getItem('novusx.gameId') || '', []);
  const playerId = useMemo(() => Number(localStorage.getItem('novusx.playerId') ?? '-1'), []);
  
  // =============================================================================
  // SOCKET EVENTS
  // =============================================================================
  
  useEffect(() => {
    if (!gameId) {
      window.location.hash = '#/lobby';
      return;
    }
    
    let socket;
    try {
      socket = getSocket();
    } catch {
      console.error('[APP] Socket not connected');
      window.location.hash = '#/lobby';
      return;
    }
    
    // Track connection status
    const onConnect = () => setConnectionStatus('connected');
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onReconnectAttempt = () => setConnectionStatus('reconnecting');
    
    // Game state updates
    const onState = (payload: { gameId: string; state: GameState }) => {
      if (payload?.gameId === gameId) {
        setGameState(payload.state);
        try { localStorage.setItem('novusx.state', JSON.stringify(payload.state)); } catch {}
        
        // Log new actions
        const la = payload.state.lastAction;
        if (la && (!lastActionRef.current || JSON.stringify(la) !== JSON.stringify(lastActionRef.current))) {
          const entry = formatLogEntry(prevStateRef.current || payload.state, payload.state, la);
          if (entry) setLog((prev) => [...prev, { text: entry }]);
          lastActionRef.current = la;
        }
        if (!la && log.length > 0) setLog([]);
        prevStateRef.current = payload.state;
      }
    };
    
    // Reconnect handler
    const onReconnected = (payload: { gameId: string; state: GameState }) => {
      console.log('[APP] Reconnected to game:', payload.gameId);
      if (payload.state) {
        setGameState(payload.state);
        try { localStorage.setItem('novusx.state', JSON.stringify(payload.state)); } catch {}
      }
      // Clear any grace timers
      setDisconnectGrace(null);
    };
    
    const onError = (e: { message: string }) => {
      console.warn('[APP] Server error:', e?.message);
    };
    
    const onConcluded = (payload: { gameId: string; winner: number }) => {
      if (payload?.gameId === gameId) {
        setWinner(payload.winner);
        setInactivityInfo(null);
        setDisconnectGrace(null);
      }
    };
    
    const onDraw = (payload: { gameId: string; reason: string }) => {
      if (payload?.gameId === gameId) {
        setDrawReason(payload.reason);
        setInactivityInfo(null);
        setDisconnectGrace(null);
      }
    };
    
    const onOpponentDisc = (payload: { gameId: string; graceSeconds: number }) => {
      if (payload?.gameId === gameId) {
        console.warn('[APP] Opponent disconnected. Grace:', payload.graceSeconds);
        setDisconnectGrace({ seconds: payload.graceSeconds, deadline: Date.now() + payload.graceSeconds * 1000 });
      }
    };
    
    const onOpponentReconnected = (payload: { gameId: string }) => {
      if (payload?.gameId === gameId) {
        console.log('[APP] Opponent reconnected');
        setDisconnectGrace(null);
      }
    };
    
    const onForfeit = (payload: { gameId: string; reason: string }) => {
      if (payload?.gameId === gameId && payload.reason === 'surrender') {
        setIsSurrendered(true);
      }
    };
    
    const onInactivityStart = (payload: { gameId: string; seconds: number; deadline: number; currentPlayer: number }) => {
      if (payload?.gameId === gameId) {
        setInactivityInfo({ seconds: payload.seconds, deadline: payload.deadline, currentPlayer: payload.currentPlayer });
      }
    };
    
    const onInactivityCancel = (payload: { gameId: string }) => {
      if (payload?.gameId === gameId) setInactivityInfo(null);
    };
    
    const onDisconnectGraceCancel = (payload: { gameId: string }) => {
      if (payload?.gameId === gameId) setDisconnectGrace(null);
    };
    
    const onResumeGame = (payload: { gameId: string; state: GameState }) => {
      if (payload?.gameId === gameId) {
        setGameState(payload.state);
        try { localStorage.setItem('novusx.state', JSON.stringify(payload.state)); } catch {}
        setDisconnectGrace(null);
      }
    };
    
    // Subscribe to events
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('STATE_UPDATE', onState);
    socket.on('RECONNECTED', onReconnected);
    socket.on('ERROR', onError);
    socket.on('GAME_CONCLUDED', onConcluded);
    socket.on('GAME_DRAW', onDraw);
    socket.on('OPPONENT_DISCONNECTED', onOpponentDisc);
    socket.on('OPPONENT_RECONNECTED', onOpponentReconnected);
    socket.on('PLAYER_FORFEIT', onForfeit);
    socket.on('INACTIVITY_TIMER_START', onInactivityStart);
    socket.on('INACTIVITY_TIMER_CANCEL', onInactivityCancel);
    socket.on('DISCONNECT_GRACE_CANCEL', onDisconnectGraceCancel);
    socket.on('RESUME_GAME', onResumeGame);
    
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('STATE_UPDATE', onState);
      socket.off('RECONNECTED', onReconnected);
      socket.off('ERROR', onError);
      socket.off('GAME_CONCLUDED', onConcluded);
      socket.off('GAME_DRAW', onDraw);
      socket.off('OPPONENT_DISCONNECTED', onOpponentDisc);
      socket.off('OPPONENT_RECONNECTED', onOpponentReconnected);
      socket.off('PLAYER_FORFEIT', onForfeit);
      socket.off('INACTIVITY_TIMER_START', onInactivityStart);
      socket.off('INACTIVITY_TIMER_CANCEL', onInactivityCancel);
      socket.off('DISCONNECT_GRACE_CANCEL', onDisconnectGraceCancel);
      socket.off('RESUME_GAME', onResumeGame);
    };
  }, [gameId]);
  
  // Tick for timer display
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  
  // Reset selections at turn change
  useEffect(() => {
    setSelectedDeployUnitType(null);
    setSelectedUnitId(null);
    setSelectedUnit(null);
  }, [gameState?.currentPlayer, gameState?.turnNumber]);
  
  // =============================================================================
  // ACTION HANDLERS (Send to server only - no local computation)
  // =============================================================================
  
  const sendAction = (action: any) => {
    if (winner !== null || drawReason !== null) return;
    if (!(gameState && playerId !== -1 && gameState.currentPlayer === playerId)) return;
    
    try {
      const socket = getSocket();
      socket.emit('PLAYER_ACTION', { type: 'PLAYER_ACTION', gameId, action });
    } catch (err) {
      console.error('[APP] Failed to send action:', err);
    }
  };
  
  const endTurnManually = () => {
    sendAction({ kind: 'END_TURN' });
    setSelectedUnitId(null);
    setSelectedUnit(null);
    setSelectedDeployUnitType(null);
  };
  
  const handleMove = (unitId: string, target: Position) => {
    sendAction({ kind: 'MOVE', unitId, target });
    setSelectedUnitId(null);
    setSelectedDeployUnitType(null);
  };
  
  const handleAttack = (attackerId: string, targetPos: Position) => {
    sendAction({ kind: 'ATTACK', attackerId, targetPos });
    setSelectedUnitId(null);
    setSelectedDeployUnitType(null);
  };
  
  const handleRotate = (unitId: string, targetPos: Position) => {
    sendAction({ kind: 'ROTATE', unitId, targetPos });
    setSelectedUnitId(null);
    setSelectedUnit(null);
    setSelectedDeployUnitType(null);
  };
  
  const handleDeploy = (unitType: 'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman', targetPos: Position) => {
    sendAction({ kind: 'DEPLOY', unitType, targetPos });
  };
  
  const handleSelectUnit = (unit: Unit | null) => {
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
  
  const leaveGame = () => {
    try {
      const socket = getSocket();
      socket.emit('LEAVE_GAME', { gameId });
    } catch {}
    localStorage.removeItem('novusx.state');
    localStorage.removeItem('novusx.gameId');
    localStorage.removeItem('novusx.playerId');
    localStorage.removeItem('novusx.reconnectToken');
    window.location.hash = '#/lobby';
  };
  
  const surrender = () => {
    try {
      const socket = getSocket();
      socket.emit('SURRENDER', { gameId });
    } catch {}
  };
  
  // =============================================================================
  // DERIVED STATE
  // =============================================================================
  
  const isMyTurn = !!gameState && playerId !== -1 && gameState.currentPlayer === playerId;
  const inactivityRemaining = inactivityInfo ? Math.max(0, Math.ceil((inactivityInfo.deadline - nowTick) / 1000)) : null;
  const disconnectGraceRemaining = disconnectGrace ? Math.max(0, Math.ceil((disconnectGrace.deadline - nowTick) / 1000)) : null;
  
  const getActionMode = (): string => {
    if (selectedUnitId) return 'Unit Action';
    return 'Idle';
  };
  
  // =============================================================================
  // STYLES
  // =============================================================================
  
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
  
  // =============================================================================
  // RENDER
  // =============================================================================
  
  // Connection status banner
  const connectionBanner = connectionStatus !== 'connected' && (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      padding: '8px',
      background: connectionStatus === 'reconnecting' ? '#fbbf24' : '#ef4444',
      color: 'white',
      textAlign: 'center',
      fontWeight: 'bold',
      zIndex: 1000,
    }}>
      {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected - Check your connection'}
    </div>
  );
  
  return (
    <div style={appStyle}>
      {connectionBanner}
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
          onToggleMusic={() => setMusicEnabled(!musicEnabled)}
          onOpenRules={() => setIsRulesOpen(true)}
          onSurrender={surrender}
        />
      )}
      
      {isRulesOpen && <RulesModal onClose={() => setIsRulesOpen(false)} />}
      
      {/* Winner Message */}
      {gameState && winner !== null && (
        <div style={winnerMessageStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>Player {winner} Wins!{isSurrendered ? ' (win by surrender)' : ''}</span>
            <button
              onClick={() => window.location.hash = '#/lobby'}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', background: '#f3f4f6', color: '#374151', cursor: 'pointer' }}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}
      
      {/* Draw Message */}
      {gameState && drawReason !== null && (
        <div style={winnerMessageStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>Game ended in a Draw! ({
              drawReason === 'turn_limit' ? 'Turn 250 reached' :
              drawReason === 'low_resources' ? 'Both players low on resources' :
              drawReason === 'mutual_invincibility' ? 'Mutual invincibility on control points' :
              'Unknown reason'
            })</span>
            <button
              onClick={() => window.location.hash = '#/lobby'}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', background: '#f3f4f6', color: '#374151', cursor: 'pointer' }}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}
      
      {/* Opponent Disconnect Warning */}
      {disconnectGraceRemaining !== null && disconnectGraceRemaining > 0 && (
        <div style={{
          padding: '12px 20px',
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          color: '#92400e',
          fontWeight: 'bold',
        }}>
          Opponent disconnected - {disconnectGraceRemaining}s to reconnect
        </div>
      )}
      
      {/* Game Board */}
      <div style={contentStyle}>
        <div style={{ minWidth: 260, maxWidth: 320 }}>
          <GameLog log={log} />
        </div>
        
        {gameState && (
          <UnitPicker
            selected={selectedDeployUnitType}
            onSelect={(val) => {
              setSelectedDeployUnitType(val);
              if (val !== null) {
                setSelectedUnitId(null);
                setSelectedUnit(null);
              }
            }}
            deploymentCounts={gameState.players[playerId]?.deploymentCounts}
            disabled={!isMyTurn}
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
            viewerId={playerId}
          />
        )}
        
        <UnitStatsPanel unit={selectedUnit} />
      </div>
    </div>
  );
}

export default App
