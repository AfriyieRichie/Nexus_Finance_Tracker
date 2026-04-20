import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, isAppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[])?.join(', ') ?? 'field';
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: `A record with this ${fields} already exists` },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
      return;
    }
  }

  // Our operational errors
  if (isAppError(err)) {
    if (!err.isOperational) {
      logger.error('Non-operational AppError', { error: err });
    }
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...('details' in err && err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unknown errors — never expose internals to the client
  logger.error('Unhandled error', { error: err });
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.isProduction
        ? 'An unexpected error occurred. Please try again later.'
        : String(err instanceof Error ? err.message : err),
    },
  });
}

export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource does not exist' },
  });
}
