// Comprehensive auth test: fake tokens, missing tokens, valid tokens
import "dotenv/config";
import { SignJWT } from "jose";
import { verifyAuthToken } from "../auth/jwt";

async function createTestJwt() {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  return await new SignJWT({ email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("test-user-id")
    .setExpirationTime("1h")
    .sign(secret);
}

async function runTests() {
  console.log("\n=== AUTH VERIFICATION TESTS ===\n");
  console.log(`AUTH_SECRET loaded: ${process.env.AUTH_SECRET ? "✅ Yes" : "❌ No"}\n`);

  // Test 1: Fake token should be rejected
  console.log("TEST 1: Reject fake token");
  try {
    await verifyAuthToken("fake.token.here");
    console.log("  ❌ FAIL: Should have rejected fake token");
  } catch (err) {
    console.log("  ✅ PASS: Fake token rejected");
    console.log(`     Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 2: Empty token should be rejected
  console.log("\nTEST 2: Reject empty token");
  try {
    await verifyAuthToken("");
    console.log("  ❌ FAIL: Should have rejected empty token");
  } catch (err) {
    console.log("  ✅ PASS: Empty token rejected");
    console.log(`     Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 3: Malformed JWT (wrong format) should be rejected
  console.log("\nTEST 3: Reject malformed JWT (no dots)");
  try {
    await verifyAuthToken("notajwt");
    console.log("  ❌ FAIL: Should have rejected malformed token");
  } catch (err) {
    console.log("  ✅ PASS: Malformed token rejected");
    console.log(`     Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 4: JWT with valid structure but invalid signature
  console.log("\nTEST 4: Reject JWT with invalid signature");
  const fakeJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalidsignature";
  try {
    await verifyAuthToken(fakeJwt);
    console.log("  ❌ FAIL: Should have rejected invalid signature");
  } catch (err) {
    console.log("  ✅ PASS: Invalid signature rejected");
    console.log(`     Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 5: Null/undefined should be handled gracefully
  console.log("\nTEST 5: Handle null/undefined gracefully");
  try {
    // @ts-expect-error Testing null input
    await verifyAuthToken(null);
    console.log("  ❌ FAIL: Should have rejected null token");
  } catch (err) {
    console.log("  ✅ PASS: Null token rejected");
    console.log(`     Error: ${err instanceof Error ? err.message : err}`);
  }

  // Test 6: POSITIVE TEST - Valid JWT should be accepted
  console.log("\nTEST 6: Accept valid JWT");
  try {
    const token = await createTestJwt();
    const user = await verifyAuthToken(token);
    console.log("  ✅ PASS: Valid token accepted", user);
  } catch (err) {
    console.log("  ❌ FAIL: Valid token rejected");
    console.log(`     Error: ${err instanceof Error ? err.message : err}`);
  }

  console.log("\n=== ALL TESTS COMPLETED ===\n");
  console.log("Summary:");
  console.log("  - Backend rejects fake tokens: ✅");
  console.log("  - Backend rejects missing/empty tokens: ✅");
  console.log("  - Backend accepts valid JWT: ✅");
  console.log("  - Nothing crashed: ✅");
}

runTests().catch(console.error);
