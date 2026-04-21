import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

export async function listAuditLogs(
  organisationId: string,
  params: {
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;

  const where = {
    organisationId,
    ...(params.userId && { userId: params.userId }),
    ...(params.action && { action: { contains: params.action, mode: 'insensitive' as const } }),
    ...(params.entityType && { entityType: params.entityType }),
    ...(params.entityId && { entityId: params.entityId }),
    ...((params.fromDate || params.toDate) && {
      timestamp: {
        ...(params.fromDate && { gte: new Date(params.fromDate + 'T00:00:00Z') }),
        ...(params.toDate && { lte: new Date(params.toDate + 'T23:59:59Z') }),
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
  return prisma.auditLog.create({ data });
}

export async function getAuditLog(organisationId: string, logId: string) {
  const log = await prisma.auditLog.findFirst({
    where: { id: logId, organisationId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!log) throw new NotFoundError('Audit log not found');
  return log;
}
