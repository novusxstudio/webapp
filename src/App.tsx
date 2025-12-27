import { useState } from 'react';
import { PlayerId } from './types';
import { gameClient } from './services/gameClient';
import GameBoard from './components/GameBoard';

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [joinGameId, setJoinGameId] = useState('');

  async function handleCreateGame(player: PlayerId) {
    try {
      const { gameId } = await gameClient.createGame();
      setGameId(gameId);
      setPlayerId(player);
    } catch (error) {
      console.error('Failed to create game:', error);
      alert('Failed to create game');
    }
  }

  function handleJoinGame(player: PlayerId) {
    if (joinGameId.trim()) {
      setGameId(joinGameId.trim());
      setPlayerId(player);
    }
  }

  if (gameId && playerId) {
    return <GameBoard gameId={gameId} playerId={playerId} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-2xl max-w-md w-full shadow-2xl border-2 border-slate-700">
        <h1 className="text-4xl font-bold text-white mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          ⚔️ Grid Strategy
        </h1>

        <div className="space-y-6">
          {/* Create new game */}
          <div className="bg-slate-700/50 p-5 rounded-xl border-2 border-slate-600">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>🎮</span>
              Create New Game
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => handleCreateGame('A')}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white py-3 px-4 rounded-xl font-bold transition-all hover:scale-105 shadow-lg"
              >
                🔵 Create as Player A
              </button>
              <button
                onClick={() => handleCreateGame('B')}
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-3 px-4 rounded-xl font-bold transition-all hover:scale-105 shadow-lg"
              >
                🔴 Create as Player B
              </button>
            </div>
          </div>

          {/* Join existing game */}
          <div className="bg-slate-700/50 p-5 rounded-xl border-2 border-slate-600">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>🔗</span>
              Join Game
            </h2>
            <input
              type="text"
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value)}
              placeholder="Enter Game ID"
              className="w-full bg-slate-600 text-white px-4 py-3 rounded-lg mb-3 border-2 border-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
            />
            <div className="space-y-2">
              <button
                onClick={() => handleJoinGame('A')}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white py-2.5 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-md"
              >
                Join as Player A
              </button>
              <button
                onClick={() => handleJoinGame('B')}
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-2.5 px-4 rounded-lg font-semibold transition-all hover:scale-105 shadow-md"
              >
                Join as Player B
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-slate-700/30 p-5 rounded-xl text-sm text-slate-300 border border-slate-600">
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
              <span>📖</span>
              Quick Start
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-300">
              <li>Create a game and copy the Game ID</li>
              <li>Share Game ID with your opponent</li>
              <li>Opponent joins using the Game ID</li>
              <li>Player A starts first - Good luck! 🍀</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
