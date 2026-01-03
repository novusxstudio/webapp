// Prisma client singleton for database access
// Ensures single connection pool across the application
// Made optional so server can run without database

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Only initialize Prisma if DATABASE_URL is set
let prismaClient: PrismaClient | null = null;

if (process.env.DATABASE_URL) {
  prismaClient = global.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    global.prisma = prismaClient;
  }
} else {
  console.warn('[DB] DATABASE_URL not set - running without database persistence');
}

export const prisma = prismaClient;

// Graceful shutdown
process.on('beforeExit', async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});
