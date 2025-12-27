import { useState, useEffect } from 'react';
import { GameState, PlayerId, Unit as UnitType, Card, Position } from '../types';
import { gameClient } from '../services/gameClient';
import Grid from './Grid';
import Hand from './Hand';
import ActionPanel from './ActionPanel';

interface GameBoardProps {
  gameId: string;
  playerId: PlayerId;
}

type ActionMode = 'none' | 'move' | 'attack' | 'swap' | 'play_unit' | 'play_lightning' | 'play_healing';

export default function GameBoard({ gameId, playerId }: GameBoardProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('none');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Register handlers BEFORE connecting to avoid missing initial state
    gameClient.onStateUpdate((state) => {
      setGameState(state);
      setError(null);
    });

    gameClient.onError((err) => {
      setError(err);
      setTimeout(() => setError(null), 3000);
    });

    // Now connect
    gameClient.connect(gameId, playerId).then(() => {
      console.log('Connected to game');
    }).catch((err) => {
      console.error('Failed to connect:', err);
      setError('Failed to connect to game server');
    });

    return () => {
      gameClient.disconnect();
    };
  }, [gameId, playerId]);

  // Loading state
  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl bg-slate-800 p-8 rounded-2xl shadow-2xl border-2 border-slate-700">
          <div className="animate-pulse flex items-center gap-3">
            <div className="text-3xl">⏳</div>
            <div>Loading game...</div>
          </div>
        </div>
      </div>
    );
  }

  const myPlayer = gameState.players[playerId];
  const isMyTurn = gameState.currentPlayer === playerId;
  const selectedUnit = selectedUnitId ? getUnitById(gameState, selectedUnitId) : null;
  const selectedCard = selectedCardId ? (myPlayer.hand.find((c: Card) => c.id === selectedCardId) || null) : null;

  function getUnitById(state: GameState, unitId: string): UnitType | null {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const unit = state.board[row][col];
        if (unit && unit.id === unitId) {
          return unit;
        }
      }
    }
    return null;
  }

  function handleUnitClick(unitId: string) {
    if (!isMyTurn) return;

    if (actionMode === 'attack') {
      // Attack target
      if (selectedUnitId && unitId !== selectedUnitId) {
        gameClient.sendAction({
          type: 'attack',
          attackerId: selectedUnitId,
          targetId: unitId
        });
        resetSelection();
      }
    } else if (actionMode === 'swap') {
      // Swap with another unit
      if (selectedUnitId && unitId !== selectedUnitId) {
        gameClient.sendAction({
          type: 'swap',
          unitId1: selectedUnitId,
          unitId2: unitId
        });
        resetSelection();
      }
    } else if (actionMode === 'play_lightning') {
      // Lightning strike target
      gameClient.sendAction({
        type: 'play_card',
        cardId: selectedCardId!,
        targetUnitId: unitId
      });
      resetSelection();
    } else {
      // Select unit
      setSelectedUnitId(unitId);
      setSelectedCardId(null);
      setActionMode('none');
    }
  }

  function handleCellClick(row: number, col: number) {
    if (!isMyTurn) return;

    const position: Position = { row, col };

    if (actionMode === 'move' && selectedUnit) {
      gameClient.sendAction({
        type: 'move',
        unitId: selectedUnit.id,
        to: position
      });
      resetSelection();
    } else if (actionMode === 'play_unit' && selectedCard) {
      const spawnRow = playerId === 'A' ? 1 : 5;
      if (row === spawnRow) {
        gameClient.sendAction({
          type: 'play_card',
          cardId: selectedCard.id,
          spawnCol: col
        });
        resetSelection();
      }
    } else if (actionMode === 'play_healing') {
      gameClient.sendAction({
        type: 'play_card',
        cardId: selectedCardId!,
        targetPosition: position
      });
      resetSelection();
    }
  }

  function handleCardClick(cardId: string) {
    if (!isMyTurn) return;
    setSelectedCardId(cardId);
    setSelectedUnitId(null);
    setActionMode('none');
  }

  function resetSelection() {
    setSelectedUnitId(null);
    setSelectedCardId(null);
    setActionMode('none');
  }

  function handleMove() {
    setActionMode('move');
  }

  function handleAttack() {
    setActionMode('attack');
  }

  function handleSwap() {
    setActionMode('swap');
  }

  function handlePlayCard() {
    if (!selectedCard) return;

    if (selectedCard.type === 'unit') {
      setActionMode('play_unit');
    } else if (selectedCard.spellEffect === 'lightning_strike') {
      setActionMode('play_lightning');
    } else if (selectedCard.spellEffect === 'healing_circle') {
      setActionMode('play_healing');
    }
  }

  function handleDrawCard() {
    gameClient.sendAction({ type: 'draw_card' });
  }

  function handleSellCard() {
    if (selectedCardId) {
      gameClient.sendAction({
        type: 'sell_card',
        cardId: selectedCardId
      });
      resetSelection();
    }
  }

  function handleEndTurn() {
    gameClient.sendAction({ type: 'end_turn' });
    resetSelection();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-white bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-2xl border-2 border-slate-700">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-3">
            <span className="text-4xl">⚔️</span>
            Grid Strategy Game
          </h1>
          <div className="flex gap-6 text-lg items-center flex-wrap">
            <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
              <span className="text-slate-400">You:</span>
              <span className={`font-bold ${
                playerId === 'A' ? 'text-blue-400' : 'text-red-400'
              }`}>Player {playerId}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
              <span className="text-slate-400">Turn:</span>
              <span className="font-bold text-purple-400">{gameState.turnNumber}</span>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${
              isMyTurn 
                ? 'bg-green-600 text-white animate-pulse' 
                : 'bg-slate-700/50 text-slate-400'
            }`}>
              {isMyTurn ? '● Your Turn' : '○ Opponent\'s Turn'}
            </div>
          </div>
          <div className="mt-3 text-sm text-slate-400 flex items-center gap-2">
            <span className="font-semibold">Game ID:</span>
            <span className="font-mono bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600">{gameId}</span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-4 rounded-xl mb-4 shadow-lg border-2 border-red-500 animate-pulse">
            <div className="font-bold flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              Error: {error}
            </div>
          </div>
        )}

        {/* Action hint */}
        {actionMode !== 'none' && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-xl mb-4 shadow-lg border-2 border-blue-500 animate-pulse">
            <div className="font-bold flex items-center gap-2">
              <span className="text-xl">👆</span>
              {actionMode === 'move' && 'Click a tile to move'}
              {actionMode === 'attack' && 'Click an enemy unit to attack'}
              {actionMode === 'swap' && 'Click a friendly unit to swap with'}
              {actionMode === 'play_unit' && `Click a tile in row ${playerId === 'A' ? '1' : '5'} to spawn unit`}
              {actionMode === 'play_lightning' && 'Click a unit to strike with lightning'}
              {actionMode === 'play_healing' && 'Click a tile to center healing'}
            </div>
          </div>
        )}

        {/* Winner announcement */}
        {gameState.winner && (
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black p-6 rounded-2xl mb-4 text-center text-2xl font-bold shadow-2xl border-4 border-yellow-300 animate-bounce">
            <div className="text-4xl mb-2">🏆</div>
            Player {gameState.winner} wins!
            <div className="text-4xl mt-2">🎉</div>
          </div>
        )}

        {/* Main game layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Grid */}
          <div className="lg:col-span-2">
            <Grid
              board={gameState.board}
              controlPoints={gameState.controlPoints}
              selectedUnit={selectedUnitId}
              onCellClick={handleCellClick}
              onUnitClick={handleUnitClick}
            />
          </div>

          {/* Right column: Actions */}
          <div className="space-y-6">
            <ActionPanel
              currentPlayer={myPlayer}
              isMyTurn={isMyTurn}
              selectedUnit={selectedUnit}
              selectedCard={selectedCard}
              onMove={handleMove}
              onAttack={handleAttack}
              onSwap={handleSwap}
              onPlayCard={handlePlayCard}
              onDrawCard={handleDrawCard}
              onSellCard={handleSellCard}
              onEndTurn={handleEndTurn}
              onCancelSelection={resetSelection}
            />
          </div>
        </div>

        {/* Hand */}
        <div className="mt-6">
          <Hand
            cards={myPlayer.hand}
            onCardClick={handleCardClick}
            selectedCard={selectedCardId}
          />
        </div>

        {/* Opponent info */}
        <div className="mt-6 bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl text-white shadow-2xl border-2 border-slate-700">
          <h3 className="font-bold mb-3 text-lg flex items-center gap-2">
            <span className="text-xl">👥</span>
            Opponent (Player {playerId === 'A' ? 'B' : 'A'})
          </h3>
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
              <span className="text-yellow-400 text-xl">💰</span>
              <span className="font-bold">{gameState.players[playerId === 'A' ? 'B' : 'A'].coins}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
              <span className="text-green-400 text-xl">⚡</span>
              <span className="font-bold">{gameState.players[playerId === 'A' ? 'B' : 'A'].actions}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
              <span className="text-blue-400 text-xl">🃏</span>
              <span className="font-bold">{gameState.players[playerId === 'A' ? 'B' : 'A'].hand.length} cards</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
