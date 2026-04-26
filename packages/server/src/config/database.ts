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

prisma.$on('error' as never, (e: { message: string; target: string }) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});

prisma.$on('warn' as never, (e: { message: string; target: string }) => {
  logger.warn('Prisma warning', { message: e.message, target: e.target });
});

export async function connectDatabase(): Promise<void> {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      logger.info('Database connection established');
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = attempt * 2000;
      logger.warn(`Database connection attempt ${attempt} failed — retrying in ${delay}ms`, { err });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}
