import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

export interface JwtPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No bearer token provided');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
  } catch {
    // Silently ignore invalid optional token
  }
  next();
}
