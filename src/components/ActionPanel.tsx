import { PlayerState, Card, Unit as UnitType } from '../types';

interface ActionPanelProps {
  currentPlayer: PlayerState;
  isMyTurn: boolean;
  selectedUnit: UnitType | null;
  selectedCard: Card | null;
  onMove: () => void;
  onAttack: () => void;
  onSwap: () => void;
  onPlayCard: () => void;
  onDrawCard: () => void;
  onSellCard: () => void;
  onEndTurn: () => void;
  onCancelSelection: () => void;
}

export default function ActionPanel({
  currentPlayer,
  isMyTurn,
  selectedUnit,
  selectedCard,
  onMove,
  onAttack,
  onSwap,
  onPlayCard,
  onDrawCard,
  onSellCard,
  onEndTurn,
  onCancelSelection
}: ActionPanelProps) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-2xl border-2 border-slate-700">
      <h3 className="text-white font-bold mb-4 text-lg flex items-center gap-2">
        <span className="text-2xl">🎮</span>
        Actions
      </h3>
      
      {/* Player stats */}
      <div className="bg-gradient-to-br from-slate-700 to-slate-800 p-4 rounded-xl mb-4 text-white border-2 border-slate-600 shadow-lg">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold text-slate-300">Coins</span>
          <span className="font-bold text-2xl text-yellow-400 flex items-center gap-1">
            {currentPlayer.coins} 💰
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-slate-300">Actions</span>
          <span className="font-bold text-2xl text-green-400 flex items-center gap-1">
            {currentPlayer.actions} ⚡
          </span>
        </div>
      </div>

      {!isMyTurn && (
        <div className="bg-gradient-to-r from-red-900 to-red-800 text-white p-4 rounded-xl mb-4 text-center border-2 border-red-700 shadow-lg animate-pulse">
          <div className="text-lg font-bold">⏳ Waiting for opponent...</div>
        </div>
      )}

      {/* Selection info */}
      {(selectedUnit || selectedCard) && (
        <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-4 rounded-xl mb-4 text-white border-2 border-blue-600 shadow-lg">
          <div className="text-sm mb-3 font-semibold">
            {selectedUnit && `⚔️ Selected: ${selectedUnit.name}`}
            {selectedCard && `🃏 Selected: ${selectedCard.name}`}
          </div>
          <button
            onClick={onCancelSelection}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-all hover:scale-105"
          >
            ❌ Cancel
          </button>
        </div>
      )}

      {/* Unit actions */}
      {selectedUnit && isMyTurn && (
        <div className="space-y-2 mb-4">
          <h4 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
            <span>⚔️</span> Unit Actions
          </h4>
          <button
            onClick={onMove}
            disabled={currentPlayer.actions < 1}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-lg disabled:shadow-none"
          >
            🏃 Move (1 ⚡)
          </button>
          <button
            onClick={onAttack}
            disabled={currentPlayer.actions < 1}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-lg disabled:shadow-none"
          >
            ⚔️ Attack (1 ⚡)
          </button>
          <button
            onClick={onSwap}
            disabled={currentPlayer.actions < 1}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-lg disabled:shadow-none"
          >
            🔄 Swap (1 ⚡)
          </button>
        </div>
      )}

      {/* Card actions */}
      {selectedCard && isMyTurn && (
        <div className="space-y-2 mb-4">
          <h4 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
            <span>🃏</span> Card Actions
          </h4>
          <button
            onClick={onPlayCard}
            disabled={currentPlayer.actions < 1 || currentPlayer.coins < selectedCard.cost}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-lg disabled:shadow-none"
          >
            ✨ Play ({selectedCard.cost} 💰, 1 ⚡)
          </button>
          <button
            onClick={onSellCard}
            disabled={currentPlayer.actions < 1}
            className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-lg disabled:shadow-none"
          >
            💵 Sell (+1 💰, 1 ⚡)
          </button>
        </div>
      )}

      {/* General actions */}
      {isMyTurn && (
        <div className="space-y-2">
          <h4 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
            <span>⚙️</span> General
          </h4>
          <button
            onClick={onDrawCard}
            disabled={currentPlayer.actions < 1 || currentPlayer.hand.length >= 5}
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-lg disabled:shadow-none"
          >
            🃏 Draw Card (1 ⚡)
          </button>
          <button
            onClick={onEndTurn}
            className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white py-3 px-4 rounded-lg font-bold transition-all hover:scale-105 shadow-lg text-lg"
          >
            ⏭️ End Turn
          </button>
        </div>
      )}
    </div>
  );
}
