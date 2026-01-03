// Environment configuration for Railway deployment
// All sensitive values come from environment variables

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS - Vercel frontend origin
  // In production, set FRONTEND_URL to your Vercel domain
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // Auth.js JWT verification
  // IMPORTANT: Must match Auth.js secret on frontend
  authSecret: process.env.AUTH_SECRET || '',
  
  // Database (Prisma reads DATABASE_URL directly)
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Game settings
  disconnectGraceSeconds: 60,
  inactivityTimeoutSeconds: 30,
} as const;

// Validate required environment variables in production
export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    // AUTH_SECRET and FRONTEND_URL are required
    // DATABASE_URL is optional (write-only Prisma mode)
    const required = ['AUTH_SECRET', 'FRONTEND_URL'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    if (!process.env.DATABASE_URL) {
      console.warn('[CONFIG] DATABASE_URL not set - game history will not be persisted');
    }
  }
}

