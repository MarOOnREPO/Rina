import { PrismaClient } from '@prisma/client';

const NODE_ENV = process.env.NODE_ENV || 'development';
const dbUrl = process.env.DATABASE_URL || '';

// Parse existing query params and merge with pool settings to avoid duplicates
const url = new URL(dbUrl);
url.searchParams.set('connection_limit', '10');
url.searchParams.set('pool_timeout', '20');
const urlWithPool = url.toString();

export const prisma = new PrismaClient({
  log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: urlWithPool
    }
  }
});
