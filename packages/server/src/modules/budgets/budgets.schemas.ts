import { z } from 'zod';

const budgetTypeEnum = z.enum(['ORIGINAL', 'REVISED', 'ROLLING_FORECAST']);
const costCentreLevelEnum = z.enum(['COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM']);
const commitmentTypeEnum = z.enum(['PURCHASE_ORDER', 'REQUISITION', 'CONTRACT']);
const commitmentStatusEnum = z.enum(['OPEN', 'PARTIALLY_INVOICED', 'FULLY_INVOICED', 'CANCELLED']);

// ─── Budget Lines ─────────────────────────────────────────────────────────────

export const budgetLineSchema = z.object({
  accountId: z.string().uuid(),
  costCentreId: z.string().uuid().nullable().optional(),
  periodNumber: z.number().int().min(1).max(12),
  amount: z.number().nonnegative(),
});

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  fiscalYear: z.number().int().min(2000).max(2100),
  budgetType: budgetTypeEnum.default('ORIGINAL'),
  parentBudgetId: z.string().uuid().optional(),
  lines: z.array(budgetLineSchema).optional(),
});

export const updateBudgetSchema = z.object({
  description: z.string().nullable().optional(),
  alertThresholdPct: z.number().min(0).max(100).nullable().optional(),
});

export const copyBudgetSchema = z.object({
  targetFiscalYear: z.number().int().min(2000).max(2100),
  targetName: z.string().min(1).max(200),
  upliftPct: z.number().min(-100).max(1000).default(0),
});

export const updateBudgetLinesSchema = z.object({
  lines: z.array(budgetLineSchema),
});

export const importBudgetLinesSchema = z.object({
  rows: z.array(z.object({
    accountCode: z.string().min(1),
    costCentreCode: z.string().optional(),
    amounts: z.record(z.coerce.number().int().min(1).max(12).pipe(z.number()), z.number().nonnegative()),
  })),
});

export const budgetVsActualQuerySchema = z.object({
  costCentreId: z.string().uuid().optional(),
  rollup: z.coerce.boolean().default(false),
  byPeriod: z.coerce.boolean().default(false),
});

// ─── Commitments ──────────────────────────────────────────────────────────────

export const createCommitmentSchema = z.object({
  accountId: z.string().uuid(),
  costCentreId: z.string().uuid().optional(),
  periodNumber: z.number().int().min(1).max(12),
  amount: z.number().positive(),
  referenceType: commitmentTypeEnum,
  reference: z.string().max(100).optional(),
  description: z.string().optional(),
  raisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const updateCommitmentSchema = z.object({
  invoicedAmount: z.number().nonnegative().optional(),
  status: commitmentStatusEnum.optional(),
  description: z.string().optional(),
});

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export const createCostCentreSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  level: costCentreLevelEnum.optional(),
  parentId: z.string().uuid().optional(),
});

export const updateCostCentreSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  level: costCentreLevelEnum.optional(),
  parentId: z.string().uuid().nullable().optional(),
  isReportableSegment: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ─── Departments ──────────────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ─── Segment Report ───────────────────────────────────────────────────────────

export const segmentReportQuerySchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type CopyBudgetInput = z.infer<typeof copyBudgetSchema>;
export type UpdateBudgetLinesInput = z.infer<typeof updateBudgetLinesSchema>;
export type ImportBudgetLinesInput = z.infer<typeof importBudgetLinesSchema>;
export type BudgetVsActualQuery = z.infer<typeof budgetVsActualQuerySchema>;
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>;
export type UpdateCommitmentInput = z.infer<typeof updateCommitmentSchema>;
export type CreateCostCentreInput = z.infer<typeof createCostCentreSchema>;
export type UpdateCostCentreInput = z.infer<typeof updateCostCentreSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type SegmentReportQuery = z.infer<typeof segmentReportQuerySchema>;
