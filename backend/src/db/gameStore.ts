// Game persistence - WRITE-ONLY MODE
// Games run entirely in memory. DB only records completed games.
// 
// This file does NOT:
// - Load games from DB
// - Persist in-progress state
// - Store move history
// - Handle reconnection

import { prisma } from './client';
import type { GameInstance, GameStatus } from '../game/GameInstance';
import type { GameResult } from '@prisma/client';

/**
 * Ensure a user exists in the database.
 * Called when a user first connects (upsert pattern).
 * 
 * @param userId - Auth.js user ID from JWT sub claim
 */
export async function ensureUser(userId: string): Promise<void> {
  try {
    await prisma.user.upsert({
      where: { id: userId },
      update: {}, // No updates needed for now
      create: { id: userId },
    });
  } catch (err) {
    // Log but don't throw - user creation failure shouldn't block gameplay
    console.error('[DB] Failed to ensure user:', userId, err);
  }
}

/**
 * Save a completed game to the database.
 * This is the ONLY write operation for games.
 * 
 * Called ONLY when GameInstance transitions to COMPLETED or ABANDONED.
 * 
 * @param game - The completed GameInstance
 * @param winnerId - User ID of the winner (null for draw)
 */
export async function saveCompletedGame(
  game: GameInstance,
  winnerId: string | null
): Promise<void> {
  // Only save if game is actually finished
  if (game.status !== 'COMPLETED' && game.status !== 'ABANDONED') {
    console.warn('[DB] Attempted to save non-completed game:', game.id, game.status);
    return;
  }

  const playerAId = game.getUserId(0);
  const playerBId = game.getUserId(1);

  // Both players must exist to record the game
  if (!playerAId || !playerBId) {
    console.warn('[DB] Cannot save game - missing player IDs:', game.id);
    return;
  }

  // Determine result type
  let result: GameResult;
  if (game.status === 'ABANDONED') {
    result = 'ABANDONED';
  } else if (winnerId === null) {
    result = 'DRAW';
  } else {
    result = 'WIN';
  }

  try {
    await prisma.game.create({
      data: {
        id: game.id,
        playerAId,
        playerBId,
        result,
        winnerId,
        turnCount: game.state.turnNumber,
      },
    });
    console.log('[DB] Saved completed game:', game.id, result, winnerId ? `winner: ${winnerId}` : 'draw');
  } catch (err) {
    // Log but don't throw - DB failure shouldn't corrupt game state
    console.error('[DB] Failed to save completed game:', game.id, err);
  }
}

// =============================================================================
// DEFERRED FUNCTIONS - Not implemented in write-only mode
// =============================================================================

// export async function loadGame(gameId: string): Promise<GameInstance | null> {
//   // DEFERRED: Load game from DB for reconnection
// }

// export async function saveGameState(game: GameInstance): Promise<void> {
//   // DEFERRED: Persist in-progress game state
// }

// export async function saveGameAction(gameId: string, action: PlayerAction): Promise<void> {
//   // DEFERRED: Record individual moves for replay
// }
