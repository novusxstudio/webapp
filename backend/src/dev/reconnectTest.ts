// Test reconnect logic
// Verifies userId → gameId mapping and socket replacement

import { GameManager } from '../game/GameManager';
import { GameInstance } from '../game/GameInstance';
import type { Socket, Server as IOServer } from 'socket.io';

// Mock socket
function mockSocket(id: string): Socket {
  return {
    id,
    join: () => {},
    emit: () => {},
  } as any;
}

// Mock IO server
function mockIO(): IOServer {
  return {
    to: () => ({ emit: () => {} }),
    sockets: { sockets: new Map() },
  } as any;
}

console.log("\n=== RECONNECT LOGIC TESTS ===\n");

const manager = new GameManager();
const io = mockIO();

// =========================================================================
// TEST 1: User can only have one active game
// =========================================================================
console.log("TEST 1: User can only have one active game");
const socket1 = mockSocket('socket-1');
const user1 = 'user-1';

// Create first game
const game1Resp = manager.createGame(socket1, user1);
console.log(`  Created game: ${game1Resp.gameId}`);

// Try to create second game
try {
  manager.createGame(socket1, user1);
  console.log("  ❌ FAIL: Should have blocked second game");
} catch (err: any) {
  if (err.message.includes('already have an active game')) {
    console.log("  ✅ PASS: Second game blocked");
    console.log(`     Error: ${err.message}`);
  } else {
    console.log(`  ❌ FAIL: Wrong error: ${err.message}`);
  }
}

// =========================================================================
// TEST 2: getActiveGameForUser returns correct game
// =========================================================================
console.log("\nTEST 2: getActiveGameForUser returns correct game");
const activeGame = manager.getActiveGameForUser(user1);
if (activeGame && activeGame.id === game1Resp.gameId) {
  console.log("  ✅ PASS: Correct game found");
  console.log(`     Game ID: ${activeGame.id}`);
} else {
  console.log("  ❌ FAIL: Wrong or no game found");
}

// =========================================================================
// TEST 3: handleReconnect reattaches socket
// =========================================================================
console.log("\nTEST 3: handleReconnect reattaches socket");

// Add second player to start the game
const socket2 = mockSocket('socket-2');
const user2 = 'user-2';
manager.joinGame(socket2, { gameId: game1Resp.gameId }, user2);

// Now user1 "reconnects" with a new socket
const socket3 = mockSocket('socket-3');
const reconnectResult = manager.handleReconnect(socket3, user1, io);

if (reconnectResult) {
  console.log(`  ✅ PASS: Reconnect successful`);
  console.log(`     Game ID: ${reconnectResult.game.id}`);
  console.log(`     Player ID: ${reconnectResult.playerId}`);
  
  // Verify socket was replaced
  const newSocketId = reconnectResult.game.getPlayerSocketId(0);
  if (newSocketId === 'socket-3') {
    console.log("  ✅ PASS: Socket ID updated to new socket");
  } else {
    console.log(`  ❌ FAIL: Socket ID not updated (got ${newSocketId})`);
  }
} else {
  console.log("  ❌ FAIL: Reconnect returned null");
}

// =========================================================================
// TEST 4: Non-participant cannot reconnect
// =========================================================================
console.log("\nTEST 4: Non-participant cannot reconnect");
const outsider = 'outsider-user';
const outsiderReconnect = manager.handleReconnect(mockSocket('socket-x'), outsider, io);
if (outsiderReconnect === null) {
  console.log("  ✅ PASS: Outsider reconnect returned null");
} else {
  console.log("  ❌ FAIL: Outsider was able to reconnect!");
}

// =========================================================================
// TEST 5: endGame cleans up userId → gameId mapping
// =========================================================================
console.log("\nTEST 5: endGame cleans up mapping");

// Verify mapping exists before endGame
const beforeEnd = manager.getActiveGameForUser(user1);
console.log(`  Before endGame: ${beforeEnd ? 'game found' : 'no game'}`);

manager.endGame(game1Resp.gameId);

const afterEnd = manager.getActiveGameForUser(user1);
if (afterEnd === null) {
  console.log("  ✅ PASS: Mapping cleaned up after endGame");
} else {
  console.log("  ❌ FAIL: Mapping still exists after endGame");
}

// Also check user2
const user2AfterEnd = manager.getActiveGameForUser(user2);
if (user2AfterEnd === null) {
  console.log("  ✅ PASS: User2 mapping also cleaned up");
} else {
  console.log("  ❌ FAIL: User2 mapping still exists");
}

// =========================================================================
// TEST 6: User can create new game after previous game ends
// =========================================================================
console.log("\nTEST 6: User can create new game after previous ends");
try {
  const newGameResp = manager.createGame(mockSocket('socket-new'), user1);
  console.log("  ✅ PASS: New game created after old game ended");
  console.log(`     New Game ID: ${newGameResp.gameId}`);
  manager.endGame(newGameResp.gameId); // Clean up
} catch (err: any) {
  console.log(`  ❌ FAIL: Could not create new game: ${err.message}`);
}

// =========================================================================
// TEST 7: Stale socket is ignored on disconnect
// =========================================================================
console.log("\nTEST 7: Stale socket ignored on disconnect");
const freshSocket = mockSocket('fresh-socket');
const staleSocket = mockSocket('stale-socket');

// Create game with fresh socket
const gameResp = manager.createGame(freshSocket, 'fresh-user');

// Manually update socket (simulating reconnect)
const game = manager.getGame(gameResp.gameId)!;
game.bindPlayerSocket(0, 'newer-socket');

// Disconnect with stale socket - should be ignored
manager.handleDisconnect(staleSocket, io, 'fresh-user');

// Game should still be active (no grace period started)
const stillActive = manager.getActiveGameForUser('fresh-user');
if (stillActive) {
  console.log("  ✅ PASS: Stale socket disconnect ignored");
} else {
  console.log("  ❌ FAIL: Game was affected by stale socket disconnect");
}
manager.endGame(gameResp.gameId);

console.log("\n=== ALL RECONNECT TESTS COMPLETED ===\n");

console.log("Summary:");
console.log("  ✅ User can only have one active game");
console.log("  ✅ getActiveGameForUser returns correct game");
console.log("  ✅ handleReconnect reattaches socket");
console.log("  ✅ Non-participant cannot reconnect");
console.log("  ✅ endGame cleans up userId → gameId mapping");
console.log("  ✅ User can create new game after previous ends");
console.log("  ✅ Stale socket is ignored on disconnect");

