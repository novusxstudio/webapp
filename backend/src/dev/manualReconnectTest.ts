/**
 * Manual Reconnect Test Client
 * 
 * Usage:
 *   1. Start the server:  npm run dev:test-server
 *   2. Run this script:   npx ts-node src/dev/manualReconnectTest.ts
 *   3. Follow the prompts
 */

import "dotenv/config";
import { io as ioClient, Socket } from "socket.io-client";
import { SignJWT } from "jose";
import * as readline from "readline";

const PORT = process.env.PORT || 3001;
const SERVER_URL = `http://localhost:${PORT}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Create valid JWTs for different users
async function createJwt(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  return await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime("1h")
    .sign(secret);
}

// Create a socket connection
function connect(token: string, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, {
      auth: { token },
      autoConnect: true,
      reconnection: false,
    });

    socket.on("connect", () => {
      console.log(`[${label}] Connected (socket.id: ${socket.id})`);
      resolve(socket);
    });

    socket.on("connect_error", (err) => {
      console.log(`[${label}] Connection failed: ${err.message}`);
      reject(err);
    });

    // Log key events only
    socket.on("RECONNECTED", (data) => console.log(`[${label}] ✅ RECONNECTED:`, data.gameId));
    socket.on("OPPONENT_DISCONNECTED", () => console.log(`[${label}] ⚠️ OPPONENT_DISCONNECTED`));
    socket.on("OPPONENT_RECONNECTED", () => console.log(`[${label}] ✅ OPPONENT_RECONNECTED`));
    socket.on("NO_ACTIVE_GAME", () => console.log(`[${label}] NO_ACTIVE_GAME`));
    socket.on("ERROR", (data) => console.log(`[${label}] ❌ ERROR:`, data.message));
  });
}

// Simple readline prompt
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\n=== MANUAL RECONNECT TEST CLIENT ===\n");
  console.log("This script helps you test reconnect scenarios.\n");

  // Create tokens for two users
  const player1Token = await createJwt("player-1-id", "player1@test.com");
  const player2Token = await createJwt("player-2-id", "player2@test.com");
  const outsiderToken = await createJwt("outsider-id", "outsider@test.com");

  console.log("Tokens created for:");
  console.log("  - player-1-id (player1@test.com)");
  console.log("  - player-2-id (player2@test.com)");
  console.log("  - outsider-id (outsider@test.com)\n");

  const choice = await prompt(
    "Which test?\n" +
    "  1. Reconnect mid-game (refresh simulation)\n" +
    "  2. Disconnect grace period test\n" +
    "  3. Outsider cannot reconnect\n" +
    "  4. Interactive two-player game\n" +
    "  5. All automated tests\n" +
    "Choice (1-5): "
  );

  switch (choice) {
    case "1":
      await testReconnectMidGame(player1Token, player2Token);
      break;
    case "2":
      await testDisconnectGrace(player1Token, player2Token);
      break;
    case "3":
      await testOutsiderCannotReconnect(player1Token, player2Token, outsiderToken);
      break;
    case "4":
      await interactiveGame(player1Token, player2Token);
      break;
    case "5":
      await runAllTests(player1Token, player2Token, outsiderToken);
      break;
    default:
      console.log("Invalid choice");
  }

  process.exit(0);
}

// TEST 1: Reconnect mid-game
async function testReconnectMidGame(token1: string, token2: string) {
  console.log("\n--- TEST: Reconnect Mid-Game ---\n");

  // Step 1: Player 1 creates game
  console.log("Step 1: Player 1 connects and creates game");
  const socket1 = await connect(token1, "P1");
  
  const gameIdPromise = new Promise<string>((resolve) => {
    socket1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
  });
  socket1.emit("CREATE_GAME");
  const gameId = await gameIdPromise;
  console.log(`  Game created: ${gameId}`);

  // Step 2: Player 2 joins - REQUIRED for game to be IN_PROGRESS
  console.log("\nStep 2: Player 2 joins the game");
  const socket2 = await connect(token2, "P2");
  
  const joinPromise = new Promise<void>((resolve) => {
    socket2.once("GAME_JOINED", () => resolve());
  });
  socket2.emit("JOIN_GAME", { gameId });
  await joinPromise;
  console.log("  Game is now IN_PROGRESS (both players joined)");

  // Step 3: Player 1 disconnects (simulating page refresh)
  console.log("\nStep 3: Player 1 disconnects (simulating page refresh)");
  socket1.disconnect();
  await sleep(1000);
  console.log("  P2 should have received OPPONENT_DISCONNECTED");

  // Step 4: Player 1 reconnects with same identity
  console.log("\nStep 4: Player 1 reconnects with same token");
  const socket1New = await connect(token1, "P1-NEW");
  await sleep(500);

  // Check result
  console.log("\n--- RESULT ---");
  console.log("✅ If P1-NEW received RECONNECTED → SUCCESS");
  console.log("✅ If P2 received OPPONENT_RECONNECTED → SUCCESS");

  socket1New.disconnect();
  socket2.disconnect();
}

// TEST 2: Disconnect grace period
async function testDisconnectGrace(token1: string, token2: string) {
  console.log("\n--- TEST: Disconnect Grace Period ---\n");
  console.log("NOTE: Grace period is 60 seconds. This test just shows it starts.\n");

  const socket1 = await connect(token1, "P1");
  const gameIdPromise = new Promise<string>((resolve) => {
    socket1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
  });
  socket1.emit("CREATE_GAME");
  const gameId = await gameIdPromise;
  console.log(`Game created: ${gameId}`);

  const socket2 = await connect(token2, "P2");
  const joinPromise = new Promise<void>((resolve) => {
    socket2.once("GAME_JOINED", () => resolve());
  });
  socket2.emit("JOIN_GAME", { gameId });
  await joinPromise;
  console.log("P2 joined. Game is IN_PROGRESS.\n");

  console.log("Disconnecting P1...");
  socket1.disconnect();

  await sleep(2000);
  console.log("\n--- RESULT ---");
  console.log("✅ If P2 received OPPONENT_DISCONNECTED → Grace period started");
  console.log("   (Game will be ABANDONED after 60 seconds if P1 doesn't return)");

  socket2.disconnect();
}

// TEST 3: Outsider cannot reconnect
async function testOutsiderCannotReconnect(token1: string, token2: string, outsiderToken: string) {
  console.log("\n--- TEST: Outsider Cannot Reconnect ---\n");

  const socket1 = await connect(token1, "P1");
  const gameIdPromise = new Promise<string>((resolve) => {
    socket1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
  });
  socket1.emit("CREATE_GAME");
  const gameId = await gameIdPromise;
  console.log(`Game created: ${gameId}`);

  const socket2 = await connect(token2, "P2");
  const joinPromise = new Promise<void>((resolve) => {
    socket2.once("GAME_JOINED", () => resolve());
  });
  socket2.emit("JOIN_GAME", { gameId });
  await joinPromise;
  console.log("P2 joined. Game is IN_PROGRESS.\n");

  console.log("Outsider connecting...");
  const outsiderSocket = await connect(outsiderToken, "OUTSIDER");
  await sleep(500);

  outsiderSocket.emit("CHECK_ACTIVE_GAME");
  await sleep(500);

  console.log("\n--- RESULT ---");
  console.log("✅ If OUTSIDER received NO_ACTIVE_GAME → SUCCESS");
  console.log("❌ If OUTSIDER received RECONNECTED → FAIL (security bug!)");

  socket1.disconnect();
  socket2.disconnect();
  outsiderSocket.disconnect();
}

// Interactive two-player game
async function interactiveGame(token1: string, token2: string) {
  console.log("\n--- INTERACTIVE TWO-PLAYER GAME ---\n");

  const socket1 = await connect(token1, "P1");
  const gameIdPromise = new Promise<string>((resolve) => {
    socket1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
  });
  socket1.emit("CREATE_GAME");
  const gameId = await gameIdPromise;
  console.log(`Game ID: ${gameId}`);

  const socket2 = await connect(token2, "P2");
  const joinPromise = new Promise<void>((resolve) => {
    socket2.once("GAME_JOINED", () => resolve());
  });
  socket2.emit("JOIN_GAME", { gameId });
  await joinPromise;
  console.log("Both players connected. Game is IN_PROGRESS.\n");

  console.log("Commands:");
  console.log("  d1 - Disconnect Player 1");
  console.log("  d2 - Disconnect Player 2");
  console.log("  r1 - Reconnect Player 1");
  console.log("  r2 - Reconnect Player 2");
  console.log("  e1 - Player 1 end turn");
  console.log("  e2 - Player 2 end turn");
  console.log("  q  - Quit\n");

  let s1: Socket | null = socket1;
  let s2: Socket | null = socket2;

  while (true) {
    const cmd = await prompt("> ");
    
    switch (cmd.trim()) {
      case "d1":
        if (s1) { s1.disconnect(); s1 = null; console.log("P1 disconnected"); }
        break;
      case "d2":
        if (s2) { s2.disconnect(); s2 = null; console.log("P2 disconnected"); }
        break;
      case "r1":
        s1 = await connect(token1, "P1");
        break;
      case "r2":
        s2 = await connect(token2, "P2");
        break;
      case "e1":
        if (s1) s1.emit("PLAYER_ACTION", { gameId, action: { kind: "END_TURN" } });
        break;
      case "e2":
        if (s2) s2.emit("PLAYER_ACTION", { gameId, action: { kind: "END_TURN" } });
        break;
      case "q":
        s1?.disconnect();
        s2?.disconnect();
        return;
      default:
        console.log("Unknown command");
    }
    await sleep(300);
  }
}

// Run all tests - each test uses FRESH user IDs to avoid conflicts
async function runAllTests(token1: string, token2: string, outsiderToken: string) {
  // Test 1: Use unique user IDs
  const test1Token1 = await createJwt("test1-player1", "test1-p1@test.com");
  const test1Token2 = await createJwt("test1-player2", "test1-p2@test.com");
  await testReconnectMidGame(test1Token1, test1Token2);
  
  await sleep(1000);
  
  // Test 2: Use different unique user IDs
  const test2Token1 = await createJwt("test2-player1", "test2-p1@test.com");
  const test2Token2 = await createJwt("test2-player2", "test2-p2@test.com");
  const test2OutsiderToken = await createJwt("test2-outsider", "test2-out@test.com");
  await testOutsiderCannotReconnect(test2Token1, test2Token2, test2OutsiderToken);
}

main().catch(console.error);
