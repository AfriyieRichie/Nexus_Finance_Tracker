import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendPaginated, buildPagination } from '../../utils/response';
import * as auditService from './audit.service';
import { listAuditLogsQuerySchema, exportCsvQuerySchema } from './audit.schemas';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const query = listAuditLogsQuerySchema.parse(req.query);
  const { logs, total, page: p, pageSize: ps } = await auditService.listAuditLogs(
    req.params.organisationId, query,
  );
  return sendPaginated(res, logs, buildPagination(p, ps, total));
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, logId } = req.params;
  return sendSuccess(res, await auditService.getAuditLog(organisationId, logId));
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const query = exportCsvQuerySchema.parse(req.query);
  const csv = await auditService.exportCsv(req.params.organisationId, query);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
