// JWT verification for Auth.js tokens using jose library
// Verifies signature and expiration, extracts user payload

import { jwtVerify, type JWTPayload } from 'jose';

// Verified user payload returned from token verification
export interface VerifiedUser {
  userId: string;
  email: string | null;
}

// Auth.js JWT payload structure
interface AuthJsPayload extends JWTPayload {
  sub?: string;        // User ID
  email?: string;      // User email
  name?: string;       // User name (optional, not extracted)
}

/**
 * Verify an Auth.js JWT token and extract user information
 * 
 * @param token - The JWT token string to verify
 * @returns VerifiedUser containing userId and email
 * @throws Error if token is invalid, expired, or missing required claims
 */
export async function verifyAuthToken(token: string): Promise<VerifiedUser> {
  const authSecret = process.env.AUTH_SECRET;
  
  if (!authSecret) {
    throw new Error('AUTH_SECRET environment variable is not configured');
  }

  if (!token) {
    throw new Error('Token is required');
  }

  // Encode secret for HS256 verification
  const secret = new TextEncoder().encode(authSecret);

  try {
    // Verify signature and expiration
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    const authPayload = payload as AuthJsPayload;

    // Validate required claims
    if (!authPayload.sub) {
      throw new Error('Token missing required claim: sub (userId)');
    }

    return {
      userId: authPayload.sub,
      email: authPayload.email ?? null,
    };
  } catch (err) {
    if (err instanceof Error) {
      // Re-throw with more context for common jose errors
      if (err.message.includes('expired')) {
        throw new Error('Token has expired');
      }
      if (err.message.includes('signature')) {
        throw new Error('Token signature verification failed');
      }
      if (err.message.includes('malformed')) {
        throw new Error('Token is malformed');
      }
      throw err;
    }
    throw new Error('Token verification failed');
  }
}

/**
 * Extract JWT from Authorization header or query parameter
 * Supports: "Bearer <token>" header or "?token=<token>" query
 * 
 * @param authHeader - Authorization header value
 * @param queryToken - Token from query parameter
 * @returns The extracted token string or null if not found
 */
export function extractToken(authHeader?: string, queryToken?: string): string | null {
  // Try Authorization header first (Bearer token)
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  
  // Fall back to query parameter (for WebSocket connections)
  if (queryToken) {
    return queryToken;
  }
  
  return null;
}
