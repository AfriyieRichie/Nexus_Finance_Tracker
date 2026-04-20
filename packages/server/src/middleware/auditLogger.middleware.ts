import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

type MutatingMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const AUDITED_METHODS: Set<string> = new Set<MutatingMethod>([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  if (!AUDITED_METHODS.has(req.method)) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const user = req.user;
      const organisationId =
        req.params.organisationId ?? (req.body as Record<string, unknown>)?.organisationId as string | undefined;

      prisma.auditLog
        .create({
          data: {
            userId: user?.sub ?? null,
            organisationId: organisationId ?? null,
            action: `${req.method}:${req.path}`,
            entityType: extractEntityType(req.path),
            entityId: extractEntityId(req, body),
            newValue: sanitiseForAudit(body) as Prisma.InputJsonValue,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
          },
        })
        .catch((err: unknown) => logger.error('Audit log write failed', { err }));
    }
    return originalJson(body);
  };

  next();
}

function extractEntityType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[1] ?? segments[0] ?? 'unknown';
}

function extractEntityId(req: Request, body: unknown): string | null {
  if (req.params.id) return req.params.id;
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data?: Record<string, unknown> }).data;
    if (typeof data?.id === 'string') return data.id;
  }
  return null;
}

function sanitiseForAudit(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const sanitised = { ...(body as Record<string, unknown>) };
  // Remove sensitive fields before storing in audit log
  delete sanitised.password;
  delete sanitised.passwordHash;
  delete sanitised.refreshToken;
  delete sanitised.accessToken;
  return sanitised;
}
