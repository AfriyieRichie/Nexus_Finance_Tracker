import { z } from 'zod';

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  pageSize: z
    .string()
    .optional()
    .default('50')
    .transform((v) => Math.min(200, Math.max(1, parseInt(v, 10)))),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export function getPaginationOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
