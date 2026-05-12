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

      const mod        = extractModule(req.path);
      const entityType = extractEntityType(req.path);
      const action     = `${req.method}:${[mod, entityType].filter(Boolean).join('/')}`.toUpperCase();

      prisma.auditLog
        .create({
          data: {
            userId:         user?.sub ?? null,
            organisationId: organisationId ?? null,
            action,
            module:         mod?.toUpperCase() ?? null,
            entityType:     entityType.toUpperCase(),
            entityId:       extractEntityId(req, body),
            newValue:       sanitiseForAudit(body) as Prisma.InputJsonValue,
            ipAddress:      req.ip ?? null,
            userAgent:      req.headers['user-agent'] ?? null,
          },
        })
        .catch((err: unknown) => logger.error('Audit log write failed', { err }));
    }
    return originalJson(body);
  };

  next();
}

// URL shape: /v1/organisations/:orgId/:module/:entity[/:id[/...]]
// segments:    0    1              2       3        4       5
function extractModule(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  const mod = segments[3]; // e.g. 'payroll', 'ar', 'journals'
  return mod ?? null;
}

function extractEntityType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[4] ?? segments[3] ?? segments[1] ?? 'unknown';
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
