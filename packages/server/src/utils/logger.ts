import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${String(ts)} [${level}]: ${String(stack ?? message)}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  format: config.isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'nexus-server' },
  transports: [
    new winston.transports.Console(),
    ...(config.isProduction
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exceptionHandlers: [new winston.transports.Console()],
  rejectionHandlers: [new winston.transports.Console()],
});
