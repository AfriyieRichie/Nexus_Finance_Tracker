import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

prisma.$on('error', (e) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning', { message: e.message, target: e.target });
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connection established');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}
