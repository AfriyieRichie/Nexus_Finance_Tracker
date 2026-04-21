import { z } from 'zod';

export const createAssetSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acquisitionCost: z.number().positive(),
  residualValue: z.number().nonnegative().default(0),
  usefulLifeMonths: z.number().int().positive(),
  depreciationMethod: z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE', 'REDUCING_BALANCE']).default('STRAIGHT_LINE'),
  assetAccountId: z.string().uuid().optional(),
  deprnAccountId: z.string().uuid().optional(),
  accDeprnAccountId: z.string().uuid().optional(),
});

export const updateAssetSchema = createAssetSchema.partial().omit({ acquisitionDate: true, acquisitionCost: true });

export const listAssetsSchema = z.object({
  category: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const runDepreciationSchema = z.object({
  periodId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const disposeAssetSchema = z.object({
  disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disposalProceeds: z.number().nonnegative(),
  periodId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsSchema>;
export type RunDepreciationInput = z.infer<typeof runDepreciationSchema>;
export type DisposeAssetInput = z.infer<typeof disposeAssetSchema>;
