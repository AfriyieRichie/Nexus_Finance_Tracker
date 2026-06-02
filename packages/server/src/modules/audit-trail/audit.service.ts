import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

// ─── Typed log helper (fire-and-forget safe) ──────────────────────────────────

export interface AuditInput {
  organisationId?: string;
  userId?: string;
  action: string;
  module?: string;
  entityType: string;
  entityId?: string;
  entityRef?: string;
  description?: string;
  before?: object | null;
  after?: object | null;
  ipAddress?: string;
  userAgent?: string;
}

export function auditLog(input: AuditInput): void {
  prisma.auditLog
    .create({
      data: {
        organisationId: input.organisationId ?? null,
        userId:         input.userId ?? null,
        action:         input.action,
        module:         input.module ?? null,
        entityType:     input.entityType,
        entityId:       input.entityId ?? null,
        entityRef:      input.entityRef ?? null,
        description:    input.description ?? null,
        previousValue:  (input.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        newValue:       (input.after  ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        ipAddress:      input.ipAddress ?? null,
        userAgent:      input.userAgent ?? null,
      },
    })
    .catch(() => { /* best-effort — never fail the caller */ });
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function listAuditLogs(
  organisationId: string,
  params: {
    userId?: string;
    action?: string;
    module?: string;
    entityType?: string;
    entityId?: string;
    entityRef?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page     = params.page     ?? 1;
  const pageSize = params.pageSize ?? 50;

  const where: Prisma.AuditLogWhereInput = {
    organisationId,
    ...(params.userId     && { userId: params.userId }),
    ...(params.action     && { action:     { contains: params.action,     mode: 'insensitive' } }),
    ...(params.module     && { module:     { equals:   params.module,     mode: 'insensitive' } }),
    ...(params.entityType && { entityType: { equals:   params.entityType, mode: 'insensitive' } }),
    ...(params.entityId   && { entityId:   params.entityId }),
    ...(params.entityRef  && { entityRef:  { contains: params.entityRef,  mode: 'insensitive' } }),
    ...(params.search && {
      OR: [
        { description: { contains: params.search, mode: 'insensitive' } },
        { entityRef:   { contains: params.search, mode: 'insensitive' } },
        { action:      { contains: params.search, mode: 'insensitive' } },
      ],
    }),
    ...((params.fromDate || params.toDate) && {
      timestamp: {
        ...(params.fromDate && { gte: new Date(params.fromDate + 'T00:00:00Z') }),
        ...(params.toDate   && { lte: new Date(params.toDate   + 'T23:59:59Z') }),
      },
    }),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  return { logs, total, page, pageSize };
}

export async function getAuditLog(organisationId: string, logId: string) {
  const log = await prisma.auditLog.findFirst({
    where: { id: logId, organisationId },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!log) throw new NotFoundError('Audit log not found');
  return log;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export async function exportCsv(
  organisationId: string,
  params: Parameters<typeof listAuditLogs>[1],
): Promise<string> {
  const { logs } = await listAuditLogs(organisationId, { ...params, pageSize: 10_000, page: 1 });

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const header = ['Timestamp', 'User', 'Email', 'Module', 'Action', 'Entity Type', 'Entity Ref', 'Entity ID', 'Description', 'IP Address', 'Previous Value', 'New Value'];
  const rows = logs.map((l) => [
    new Date(l.timestamp).toISOString(),
    l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
    l.user?.email ?? '',
    l.module ?? '',
    l.action,
    l.entityType,
    l.entityRef ?? '',
    l.entityId  ?? '',
    l.description ?? '',
    l.ipAddress ?? '',
    l.previousValue != null ? JSON.stringify(l.previousValue) : '',
    l.newValue      != null ? JSON.stringify(l.newValue)      : '',
  ].map(esc).join(','));

  return [header.map(esc).join(','), ...rows].join('\r\n');
}

// ─── Legacy alias (backward compatibility) ────────────────────────────────────

export async function createAuditLog(data: {
  organisationId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  previousValue?: object;
  newValue?: object;
  ipAddress?: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({
    data: {
      ...data,
      organisationId: data.organisationId ?? null,
      userId:         data.userId ?? null,
      entityId:       data.entityId ?? null,
      previousValue:  (data.previousValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      newValue:       (data.newValue      ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}
