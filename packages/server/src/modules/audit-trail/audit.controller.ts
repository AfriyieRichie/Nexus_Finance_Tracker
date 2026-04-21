import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendPaginated, buildPagination } from '../../utils/response';
import * as auditService from './audit.service';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const {
    userId,
    action,
    entityType,
    entityId,
    fromDate,
    toDate,
    page,
    pageSize,
  } = req.query as Record<string, string | undefined>;

  const { logs, total, page: p, pageSize: ps } = await auditService.listAuditLogs(
    organisationId,
    {
      userId,
      action,
      entityType,
      entityId,
      fromDate,
      toDate,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    },
  );

  return sendPaginated(res, logs, buildPagination(p, ps, total));
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, logId } = req.params;
  const log = await auditService.getAuditLog(organisationId, logId);
  return sendSuccess(res, log);
});
