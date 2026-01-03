import { verifyAuthToken } from "../auth/jwt"

;(async () => {
  try {
    await verifyAuthToken("fake.token.here")
    console.log("❌ SHOULD NOT PASS")
  } catch {
    console.log("✅ Invalid token rejected")
  }
})()

