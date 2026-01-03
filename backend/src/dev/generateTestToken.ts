/**
 * Generate a test JWT for frontend development
 * 
 * Usage: npx ts-node src/dev/generateTestToken.ts
 * 
 * Copy the output token and paste into the frontend dev mode token input
 */

import 'dotenv/config';
import { SignJWT } from 'jose';

const AUTH_SECRET = process.env.AUTH_SECRET;

if (!AUTH_SECRET) {
  console.error('❌ AUTH_SECRET not set in .env');
  process.exit(1);
}

async function generateToken() {
  const secret = new TextEncoder().encode(AUTH_SECRET);
  
  // Generate tokens for two test players
  const player1Token = await new SignJWT({ email: 'player1@test.com' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-player-1')
    .setExpirationTime('7d')
    .sign(secret);
    
  const player2Token = await new SignJWT({ email: 'player2@test.com' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-player-2')
    .setExpirationTime('7d')
    .sign(secret);
  
  console.log('\n🔑 Test JWT Tokens (valid for 7 days)\n');
  console.log('Player 1:');
  console.log(player1Token);
  console.log('\nPlayer 2:');
  console.log(player2Token);
  console.log('\n📋 Usage:');
  console.log('1. Start frontend with VITE_DEV_MODE=true');
  console.log('2. Paste token into the login screen');
  console.log('3. Or set VITE_AUTH_TOKEN in frontend/.env\n');
}

generateToken().catch(console.error);

