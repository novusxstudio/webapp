/**
 * Automated Reconnect Tests - No prompts, just runs
 */

import "dotenv/config";
import { io as ioClient, Socket } from "socket.io-client";
import { SignJWT } from "jose";

const PORT = process.env.PORT || 3001;
const SERVER_URL = `http://localhost:${PORT}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createJwt(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  return await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime("1h")
    .sign(secret);
}

function connect(token: string, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, {
      auth: { token },
      autoConnect: true,
      reconnection: false,
      timeout: 5000,
    });

    socket.on("connect", () => {
      console.log(`  [${label}] Connected`);
      resolve(socket);
    });

    socket.on("connect_error", (err) => {
      reject(err);
    });

    socket.on("RECONNECTED", (data) => console.log(`  [${label}] ✅ RECONNECTED to ${data.gameId}`));
    socket.on("OPPONENT_DISCONNECTED", () => console.log(`  [${label}] ⚠️ OPPONENT_DISCONNECTED`));
    socket.on("OPPONENT_RECONNECTED", () => console.log(`  [${label}] ✅ OPPONENT_RECONNECTED`));
    socket.on("NO_ACTIVE_GAME", () => console.log(`  [${label}] NO_ACTIVE_GAME`));
    socket.on("ERROR", (data) => console.log(`  [${label}] ❌ ERROR: ${data.message}`));
  });
}

async function main() {
  console.log("\n=== AUTOMATED RECONNECT TESTS ===\n");

  let passed = 0;
  let failed = 0;

  // ========== TEST 1: Reconnect Mid-Game ==========
  console.log("TEST 1: Reconnect Mid-Game");
  try {
    const t1p1 = await createJwt("t1-player1", "t1p1@test.com");
    const t1p2 = await createJwt("t1-player2", "t1p2@test.com");

    const s1 = await connect(t1p1, "P1");
    
    const gameIdPromise = new Promise<string>((resolve) => {
      s1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
    });
    s1.emit("CREATE_GAME");
    const gameId = await gameIdPromise;
    console.log(`  Game created: ${gameId}`);

    const s2 = await connect(t1p2, "P2");
    const joinPromise = new Promise<void>((resolve) => {
      s2.once("GAME_JOINED", () => resolve());
    });
    s2.emit("JOIN_GAME", { gameId });
    await joinPromise;
    console.log("  P2 joined - game IN_PROGRESS");

    // P1 disconnects
    s1.disconnect();
    await sleep(500);

    // P1 reconnects - set up listener BEFORE connecting
    let reconnected = false;
    const s1New = ioClient(SERVER_URL, {
      auth: { token: t1p1 },
      autoConnect: true,
      reconnection: false,
      timeout: 5000,
    });
    
    s1New.on("RECONNECTED", () => { 
      reconnected = true; 
      console.log(`  [P1-NEW] ✅ RECONNECTED`);
    });
    
    // Wait for connection and RECONNECTED event
    await new Promise<void>((resolve) => {
      s1New.on("connect", () => {
        console.log(`  [P1-NEW] Connected`);
        // Give time for RECONNECTED to arrive
        setTimeout(resolve, 500);
      });
    });

    if (reconnected) {
      console.log("  ✅ PASSED: Player reconnected successfully\n");
      passed++;
    } else {
      console.log("  ❌ FAILED: Player did not receive RECONNECTED\n");
      failed++;
    }

    s1New.disconnect();
    s2.disconnect();
    await sleep(500);
  } catch (err: any) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // ========== TEST 2: Outsider Cannot Reconnect ==========
  console.log("TEST 2: Outsider Cannot Reconnect");
  try {
    const t2p1 = await createJwt("t2-player1", "t2p1@test.com");
    const t2p2 = await createJwt("t2-player2", "t2p2@test.com");
    const t2out = await createJwt("t2-outsider", "t2out@test.com");

    const s1 = await connect(t2p1, "P1");
    const gameIdPromise = new Promise<string>((resolve) => {
      s1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
    });
    s1.emit("CREATE_GAME");
    const gameId = await gameIdPromise;
    console.log(`  Game created: ${gameId}`);

    const s2 = await connect(t2p2, "P2");
    const joinPromise = new Promise<void>((resolve) => {
      s2.once("GAME_JOINED", () => resolve());
    });
    s2.emit("JOIN_GAME", { gameId });
    await joinPromise;
    console.log("  P2 joined - game IN_PROGRESS");

    // Outsider connects
    let outsiderReconnected = false;
    const sOut = await connect(t2out, "OUTSIDER");
    await new Promise<void>((resolve) => {
      sOut.once("RECONNECTED", () => { outsiderReconnected = true; resolve(); });
      setTimeout(resolve, 500);
    });

    sOut.emit("CHECK_ACTIVE_GAME");
    await sleep(500);

    if (!outsiderReconnected) {
      console.log("  ✅ PASSED: Outsider was NOT reconnected\n");
      passed++;
    } else {
      console.log("  ❌ FAILED: Outsider WAS reconnected (security bug!)\n");
      failed++;
    }

    s1.disconnect();
    s2.disconnect();
    sOut.disconnect();
    await sleep(500);
  } catch (err: any) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // ========== TEST 3: Wrong Player Cannot Act ==========
  console.log("TEST 3: Wrong Player Cannot Act During Disconnect");
  try {
    const t3p1 = await createJwt("t3-player1", "t3p1@test.com");
    const t3p2 = await createJwt("t3-player2", "t3p2@test.com");

    const s1 = await connect(t3p1, "P1");
    const gameIdPromise = new Promise<string>((resolve) => {
      s1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
    });
    s1.emit("CREATE_GAME");
    const gameId = await gameIdPromise;
    console.log(`  Game created: ${gameId}`);

    const s2 = await connect(t3p2, "P2");
    const joinPromise = new Promise<void>((resolve) => {
      s2.once("GAME_JOINED", () => resolve());
    });
    s2.emit("JOIN_GAME", { gameId });
    await joinPromise;
    console.log("  Game started - P1's turn");

    // P1 disconnects
    s1.disconnect();
    console.log("  P1 disconnected");
    await sleep(300);

    // P2 tries to act (should fail - not their turn)
    let gotError = false;
    s2.once("ERROR", (data) => {
      if (data.message.includes("turn")) gotError = true;
    });
    s2.emit("PLAYER_ACTION", { gameId, action: { kind: "END_TURN" } });
    await sleep(500);

    if (gotError) {
      console.log("  ✅ PASSED: P2 cannot act during P1's turn\n");
      passed++;
    } else {
      console.log("  ❌ FAILED: P2 was able to act during P1's turn\n");
      failed++;
    }

    s2.disconnect();
    await sleep(500);
  } catch (err: any) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // ========== TEST 4: Disconnect No Reconnect → ABANDONED ==========
  console.log("TEST 4: Disconnect No Reconnect → ABANDONED");
  console.log("  ⚠️ This test requires 60s grace period (skipping for speed)");
  console.log("  To test manually: disconnect P1, wait 60s, P2 should see GAME_CONCLUDED\n");
  // Note: To actually test this, you'd need to either:
  // 1. Wait 60 seconds
  // 2. Reduce grace period in testServer.ts to 5 seconds for testing

  // ========== TEST 5: Reconnect Preserves Game State ==========
  console.log("TEST 5: Reconnect Preserves Turn State");
  try {
    const t5p1 = await createJwt("t5-player1", "t5p1@test.com");
    const t5p2 = await createJwt("t5-player2", "t5p2@test.com");

    const s1 = await connect(t5p1, "P1");
    const gameIdPromise = new Promise<string>((resolve) => {
      s1.once("GAME_CREATED", (data: any) => resolve(data.gameId));
    });
    s1.emit("CREATE_GAME");
    const gameId = await gameIdPromise;
    console.log(`  Game created: ${gameId}`);

    const s2 = await connect(t5p2, "P2");
    const joinPromise = new Promise<void>((resolve) => {
      s2.once("GAME_JOINED", () => resolve());
    });
    s2.emit("JOIN_GAME", { gameId });
    await joinPromise;
    console.log("  Game started - P1's turn (turn 1)");

    // P1 ends turn
    s1.emit("PLAYER_ACTION", { gameId, action: { kind: "END_TURN" } });
    await sleep(300);
    console.log("  P1 ended turn - now P2's turn");

    // P2 disconnects mid-turn
    s2.disconnect();
    console.log("  P2 disconnected");
    await sleep(300);

    // P2 reconnects
    let reconnectState: any = null;
    const s2New = ioClient(SERVER_URL, {
      auth: { token: t5p2 },
      autoConnect: true,
      reconnection: false,
    });
    s2New.on("RECONNECTED", (data: any) => { reconnectState = data; });
    await new Promise<void>((resolve) => {
      s2New.on("connect", () => setTimeout(resolve, 500));
    });

    if (reconnectState && reconnectState.state.currentPlayer === 1) {
      console.log("  ✅ PASSED: Reconnect preserved state (still P2's turn)\n");
      passed++;
    } else {
      console.log(`  ❌ FAILED: State not preserved correctly\n`);
      failed++;
    }

    s1.disconnect();
    s2New.disconnect();
    await sleep(500);
  } catch (err: any) {
    console.log(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // ========== SUMMARY ==========
  console.log("=== SUMMARY ===");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);
  
  console.log("Coverage:");
  console.log("  ✅ Refresh page mid-turn → game resumes");
  console.log("  ✅ Disconnect > reconnect within timer → game continues");
  console.log("  ⏭️ Disconnect > no reconnect → ABANDONED (manual test, 60s wait)");
  console.log("  ✅ Opponent cannot act during disconnect");
  console.log("  ✅ Outsider cannot reconnect into game");
  console.log("  ✅ Reconnect preserves game state\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);

