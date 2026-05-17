import { PrismaClient } from '@prisma/client';
const NODE_ENV = process.env.NODE_ENV || 'development';
export const prisma = new PrismaClient({
    log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});
//# sourceMappingURL=prisma.js.map