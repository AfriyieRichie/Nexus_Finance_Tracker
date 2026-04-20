import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, redis } from './config/redis';
import { app } from './app';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  try {
    await connectRedis();
  } catch (err) {
    if (config.isProduction) throw err;
    logger.warn('Redis unavailable — continuing without it (dev mode)', { err });
  }

  const server = app.listen(config.PORT, () => {
    logger.info(`Nexus Accounting Server started`, {
      port: config.PORT,
      env: config.NODE_ENV,
      pid: process.pid,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      await redis.quit();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });
    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

void bootstrap();
