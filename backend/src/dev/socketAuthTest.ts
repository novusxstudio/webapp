// Socket auth test: tests both positive and negative cases
import "dotenv/config";
import { io as ioClient, Socket } from "socket.io-client";
import { SignJWT } from "jose";

const PORT = process.env.PORT || 3001;
const SERVER_URL = `http://localhost:${PORT}`;

async function createValidJwt(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  return await new SignJWT({ email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("test-user-id")
    .setExpirationTime("1h")
    .sign(secret);
}

function connectWithToken(token?: string): Promise<{ socket: Socket; error?: string }> {
  return new Promise((resolve) => {
    const socket = ioClient(SERVER_URL, {
      auth: token ? { token } : undefined,
      autoConnect: true,
      reconnection: false,
      timeout: 3000,
    });

    socket.on("connect", () => {
      resolve({ socket });
    });

    socket.on("connect_error", (err) => {
      resolve({ socket, error: err.message });
    });

    // Timeout fallback
    setTimeout(() => {
      resolve({ socket, error: "Connection timeout" });
    }, 5000);
  });
}

async function runTests() {
  console.log("\n=== SOCKET AUTH TESTS ===\n");
  console.log(`Server URL: ${SERVER_URL}\n`);

  // TEST 1: No token - should be rejected
  console.log("TEST 1: Connection WITHOUT token");
  const noTokenResult = await connectWithToken();
  if (noTokenResult.error) {
    console.log("  ✅ PASS: Connection rejected");
    console.log(`     Error: ${noTokenResult.error}`);
  } else {
    console.log("  ❌ FAIL: Connection should have been rejected!");
  }
  noTokenResult.socket.disconnect();

  // TEST 2: Fake token - should be rejected
  console.log("\nTEST 2: Connection with FAKE token");
  const fakeResult = await connectWithToken("fake.token.here");
  if (fakeResult.error) {
    console.log("  ✅ PASS: Connection rejected");
    console.log(`     Error: ${fakeResult.error}`);
  } else {
    console.log("  ❌ FAIL: Connection should have been rejected!");
  }
  fakeResult.socket.disconnect();

  // TEST 3: Valid token - should succeed
  console.log("\nTEST 3: Connection with VALID token");
  const validToken = await createValidJwt();
  const validResult = await connectWithToken(validToken);
  if (!validResult.error) {
    console.log("  ✅ PASS: Connection accepted");
    
    // TEST 4: Trigger CREATE_GAME to verify user is attached
    console.log("\nTEST 4: Trigger CREATE_GAME handler");
    validResult.socket.emit("CREATE_GAME");
    
    // Wait for response
    await new Promise<void>((resolve) => {
      validResult.socket.once("GAME_CREATED", (resp) => {
        console.log("  ✅ PASS: Handler received user identity");
        console.log("     Game created:", resp.gameId);
        resolve();
      });
      validResult.socket.once("ERROR", (err) => {
        console.log("  ❌ FAIL: Handler error:", err.message);
        resolve();
      });
      setTimeout(() => {
        console.log("  ⚠️ TIMEOUT: No response from handler");
        resolve();
      }, 3000);
    });
  } else {
    console.log("  ❌ FAIL: Valid token was rejected!");
    console.log(`     Error: ${validResult.error}`);
  }
  validResult.socket.disconnect();

  console.log("\n=== TESTS COMPLETED ===\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

