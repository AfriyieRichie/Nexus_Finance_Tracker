import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  userId:     z.string().uuid().optional(),
  action:     z.string().max(100).optional(),
  module:     z.string().max(50).optional(),
  entityType: z.string().max(100).optional(),
  entityId:   z.string().uuid().optional(),
  entityRef:  z.string().max(200).optional(),
  search:     z.string().max(200).optional(),
  fromDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().int().positive().default(1),
  pageSize:   z.coerce.number().int().positive().max(200).default(50),
});

export const exportCsvQuerySchema = listAuditLogsQuerySchema.omit({ page: true, pageSize: true });
