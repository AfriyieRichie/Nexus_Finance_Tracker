import { Redis } from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connection established'));
redis.on('error', (err) => logger.error('Redis error', { err }));
redis.on('close', () => logger.warn('Redis connection closed'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}
