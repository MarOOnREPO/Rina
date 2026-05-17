import { PrismaClient } from '@prisma/client';

const NODE_ENV = process.env.NODE_ENV || 'development';
const dbUrl = process.env.DATABASE_URL || '';
const separator = dbUrl.includes('?') ? '&' : '?';
const urlWithPool = `${dbUrl}${separator}connection_limit=10&pool_timeout=20`;

export const prisma = new PrismaClient({
  log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: urlWithPool
    }
  }
});
