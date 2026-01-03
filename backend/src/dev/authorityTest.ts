// Test GameInstance authority checks
// Verifies that game-level security invariants are enforced

import { GameInstance } from '../game/GameInstance';
import type { PlayerAction } from '../types';

const endTurnAction: PlayerAction = { kind: 'END_TURN' };

function runTests() {
  console.log("\n=== GAME AUTHORITY TESTS ===\n");

  // Setup: Create a game with two players
  const game = new GameInstance('test-game');
  const player0Id = 'user-0-id';
  const player1Id = 'user-1-id';
  const outsiderId = 'outsider-id';

  // Add player 0 (creator)
  game.addPlayer(0, 'socket-0', player0Id);
  console.log(`Game status after player 0 joins: ${game.status}`); // WAITING

  // Add player 1 (joiner) - game should auto-start
  game.addPlayer(1, 'socket-1', player1Id);
  console.log(`Game status after player 1 joins: ${game.status}`); // IN_PROGRESS

  // =========================================================================
  // TEST 1: Outsider cannot act
  // =========================================================================
  console.log("\nTEST 1: Outsider cannot act");
  try {
    game.applyActionFromUser(outsiderId, endTurnAction);
    console.log("  ❌ FAIL: Outsider was allowed to act!");
  } catch (err: any) {
    if (err.message.includes('not a participant')) {
      console.log("  ✅ PASS: Outsider blocked");
      console.log(`     Error: ${err.message}`);
    } else {
      console.log(`  ❌ FAIL: Wrong error: ${err.message}`);
    }
  }

  // =========================================================================
  // TEST 2: Wrong player cannot act (not their turn)
  // =========================================================================
  console.log("\nTEST 2: Wrong player cannot act (not their turn)");
  console.log(`   Current player: ${game.state.currentPlayer}`); // Should be 0
  try {
    // Player 1 tries to act when it's Player 0's turn
    game.applyActionFromUser(player1Id, endTurnAction);
    console.log("  ❌ FAIL: Wrong player was allowed to act!");
  } catch (err: any) {
    if (err.message.includes("Not this player's turn")) {
      console.log("  ✅ PASS: Wrong player blocked");
      console.log(`     Error: ${err.message}`);
    } else {
      console.log(`  ❌ FAIL: Wrong error: ${err.message}`);
    }
  }

  // =========================================================================
  // TEST 3: Correct player CAN act
  // =========================================================================
  console.log("\nTEST 3: Correct player CAN act");
  try {
    // Player 0 ends turn
    game.applyActionFromUser(player0Id, endTurnAction);
    console.log("  ✅ PASS: Correct player allowed to act");
    console.log(`     Current player is now: ${game.state.currentPlayer}`);
  } catch (err: any) {
    console.log(`  ❌ FAIL: Correct player was blocked: ${err.message}`);
  }

  // =========================================================================
  // TEST 4: After turn ends, other player can act
  // =========================================================================
  console.log("\nTEST 4: After turn ends, other player can act");
  console.log(`   Current player: ${game.state.currentPlayer}`); // Should be 1 now
  try {
    // Player 1 ends turn
    game.applyActionFromUser(player1Id, endTurnAction);
    console.log("  ✅ PASS: Player 1 allowed to act on their turn");
    console.log(`     Current player is now: ${game.state.currentPlayer}`);
  } catch (err: any) {
    console.log(`  ❌ FAIL: Player 1 was blocked: ${err.message}`);
  }

  // =========================================================================
  // TEST 5: Game cannot be completed twice
  // =========================================================================
  console.log("\nTEST 5: Game status transitions are protected");
  try {
    game.completeGame();
    console.log(`   Game status is now: ${game.status}`);
    game.completeGame();
    console.log("  ❌ FAIL: Game was completed twice!");
  } catch (err: any) {
    if (err.message.includes('Cannot complete game')) {
      console.log("  ✅ PASS: Double completion blocked");
      console.log(`     Error: ${err.message}`);
    } else {
      console.log(`  ❌ FAIL: Wrong error: ${err.message}`);
    }
  }

  // =========================================================================
  // TEST 6: No actions after game is completed
  // =========================================================================
  console.log("\nTEST 6: No actions after game is completed");
  try {
    game.applyActionFromUser(player0Id, endTurnAction);
    console.log("  ❌ FAIL: Action was allowed after game ended!");
  } catch (err: any) {
    if (err.message.includes('not active')) {
      console.log("  ✅ PASS: Action after game end blocked");
      console.log(`     Error: ${err.message}`);
    } else {
      console.log(`  ❌ FAIL: Wrong error: ${err.message}`);
    }
  }

  // =========================================================================
  // TEST 7: Fresh game - cannot start if only one player
  // =========================================================================
  console.log("\nTEST 7: Cannot start game with only one player");
  const game2 = new GameInstance('test-game-2');
  game2.addPlayer(0, 'socket-0', 'solo-player');
  try {
    game2.startGame();
    console.log("  ❌ FAIL: Game started with one player!");
  } catch (err: any) {
    if (err.message.includes('waiting for second player')) {
      console.log("  ✅ PASS: Single-player start blocked");
      console.log(`     Error: ${err.message}`);
    } else {
      console.log(`  ❌ FAIL: Wrong error: ${err.message}`);
    }
  }

  // =========================================================================
  // TEST 8: isParticipant helper works
  // =========================================================================
  console.log("\nTEST 8: isParticipant helper works");
  if (game.isParticipant(player0Id) && game.isParticipant(player1Id) && !game.isParticipant(outsiderId)) {
    console.log("  ✅ PASS: isParticipant correctly identifies players");
  } else {
    console.log("  ❌ FAIL: isParticipant returned incorrect results");
  }

  console.log("\n=== ALL AUTHORITY TESTS COMPLETED ===\n");

  // Summary
  console.log("Summary of invariants tested:");
  console.log("  ✅ User is not a participant in this game → BLOCKED");
  console.log("  ✅ Not this player's turn → BLOCKED");
  console.log("  ✅ Game is not active → BLOCKED");
  console.log("  ✅ Status transitions are protected → ENFORCED");
}

runTests();

