import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendPaginated, buildPagination } from '../../utils/response';
import * as auditService from './audit.service';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const {
    userId, action, module, entityType, entityId, entityRef, search,
    fromDate, toDate, page, pageSize,
  } = req.query as Record<string, string | undefined>;

  const { logs, total, page: p, pageSize: ps } = await auditService.listAuditLogs(
    organisationId,
    {
      userId, action, module, entityType, entityId, entityRef, search,
      fromDate, toDate,
      page:     page     ? parseInt(page,     10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    },
  );

  return sendPaginated(res, logs, buildPagination(p, ps, total));
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, logId } = req.params;
  return sendSuccess(res, await auditService.getAuditLog(organisationId, logId));
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const {
    userId, action, module, entityType, entityId, entityRef, search, fromDate, toDate,
  } = req.query as Record<string, string | undefined>;

  const csv = await auditService.exportCsv(organisationId, {
    userId, action, module, entityType, entityId, entityRef, search, fromDate, toDate,
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
