import { Redis } from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 0,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: () => null, // don't retry — fail fast in dev without Redis
});

redis.on('connect', () => logger.info('Redis connection established'));
redis.on('error', () => { /* suppressed — Redis is optional in dev */ });
redis.on('close', () => { /* suppressed */ });

export async function connectRedis(): Promise<void> {
  await redis.connect();
}
