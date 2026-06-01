import { z } from 'zod';

const depreciationMethodEnum = z.enum([
  'STRAIGHT_LINE',
  'REDUCING_BALANCE',
  'DECLINING_BALANCE',
  'UNITS_OF_PRODUCTION',
  'SUM_OF_YEARS_DIGITS',
]);

export const createAssetSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  categoryId: z.string().uuid().optional(),
  serialNumber: z.string().optional(),
  location: z.string().optional(),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acquisitionCost: z.number().positive(),
  residualValue: z.number().nonnegative().default(0),
  usefulLifeMonths: z.number().int().positive(),
  depreciationMethod: depreciationMethodEnum.default('STRAIGHT_LINE'),
  reducingBalanceRate: z.number().positive().max(1).optional(),
  unitsOfProductionTotal: z.number().int().positive().optional(),
  assetAccountId: z.string().uuid().optional(),
  deprnAccountId: z.string().uuid().optional(),
  accDeprnAccountId: z.string().uuid().optional(),
  // If provided, auto-post acquisition journal: Dr assetCostAccount / Cr this account
  acquisitionCreditAccountId: z.string().uuid().optional(),
});

export const updateAssetSchema = createAssetSchema
  .partial()
  .omit({ acquisitionDate: true, acquisitionCost: true });

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
  preview: z.boolean().default(false),
  assetUnitsOverrides: z
    .array(z.object({ assetId: z.string().uuid(), units: z.number().int().positive() }))
    .optional(),
});

export const reverseDepreciationSchema = z.object({
  runId: z.string().uuid(),
  periodId: z.string().uuid(),
  reason: z.string().min(1),
});

export const disposeAssetSchema = z.object({
  disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disposalProceeds: z.number().nonnegative(),
  periodId: z.string().uuid(),
  proceedsAccountId: z.string().uuid().optional(),
});

export const revalueAssetSchema = z.object({
  revaluationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fairValue: z.number().positive(),
  periodId: z.string().uuid(),
  reserveAccountId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const impairAssetSchema = z.object({
  impairmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recoverableAmount: z.number().nonnegative(),
  periodId: z.string().uuid(),
  impairmentAccountId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const createCategorySchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  defaultDepreciationMethod: depreciationMethodEnum.default('STRAIGHT_LINE'),
  defaultUsefulLifeMonths: z.number().int().positive().optional(),
  capitalisationThreshold: z.number().nonnegative().optional(),
  // GL accounts — inherited by all assets in this category
  assetCostAccountId:               z.string().uuid().optional().nullable(),
  depreciationExpenseAccountId:     z.string().uuid().optional().nullable(),
  accumulatedDepreciationAccountId: z.string().uuid().optional().nullable(),
  gainLossOnDisposalAccountId:      z.string().uuid().optional().nullable(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const setAssetStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
  reason: z.string().optional(),
});

export const bulkCreateAssetsSchema = z.object({
  assets: z
    .array(
      createAssetSchema.omit({ assetAccountId: true, deprnAccountId: true, accDeprnAccountId: true }),
    )
    .min(1)
    .max(500),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsSchema>;
export type RunDepreciationInput = z.infer<typeof runDepreciationSchema>;
export type ReverseDepreciationInput = z.infer<typeof reverseDepreciationSchema>;
export type DisposeAssetInput = z.infer<typeof disposeAssetSchema>;
export type RevalueAssetInput = z.infer<typeof revalueAssetSchema>;
export type ImpairAssetInput = z.infer<typeof impairAssetSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type BulkCreateAssetsInput = z.infer<typeof bulkCreateAssetsSchema>;
export type SetAssetStatusInput = z.infer<typeof setAssetStatusSchema>;
