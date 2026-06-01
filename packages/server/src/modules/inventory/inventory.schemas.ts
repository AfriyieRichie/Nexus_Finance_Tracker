import { z } from 'zod';

const costMethodEnum = z.enum(['FIFO', 'WEIGHTED_AVERAGE', 'STANDARD']);
const movementTypeEnum = z.enum([
  'RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
  'TRANSFER_IN', 'TRANSFER_OUT', 'STOCKTAKE_IN', 'STOCKTAKE_OUT', 'OPENING',
]);
const movementStatusEnum = z.enum(['PENDING', 'APPROVED', 'POSTED', 'REJECTED']);

// ─── Categories ───────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ─── Locations ────────────────────────────────────────────────────────────────

export const createLocationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ─── Items ────────────────────────────────────────────────────────────────────

export const createItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  unit: z.string().min(1).max(20).optional(),
  costMethod: costMethodEnum.default('WEIGHTED_AVERAGE'),
  unitCost: z.number().nonnegative().optional(),
  standardCost: z.number().nonnegative().optional(),
  reorderLevel: z.number().nonnegative().optional(),
  reorderQuantity: z.number().positive().optional(),
  inventoryAccountId: z.string().uuid().optional(),
  cogsAccountId: z.string().uuid().optional(),
  purchasePriceVarianceAccountId: z.string().uuid().optional(),
});

export const updateItemSchema = createItemSchema.partial().omit({ costMethod: true }).extend({
  costMethod: costMethodEnum.optional(),
});

export const listItemsSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  isLowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

// ─── Movements ────────────────────────────────────────────────────────────────

export const createMovementSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  movementType: movementTypeEnum,
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().optional(),
  contraAccountId: z.string().uuid().optional(),
  periodId: z.string().uuid().optional(),
  reference: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  reasonCode: z.string().max(50).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listMovementsSchema = z.object({
  itemId: z.string().uuid().optional(),
  movementType: movementTypeEnum.optional(),
  status: movementStatusEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

export const repostGLSchema = z.object({
  contraAccountId: z.string().uuid(),
  periodId: z.string().uuid(),
});

// ─── Stocktake ────────────────────────────────────────────────────────────────

export const createStocktakeSchema = z.object({
  name: z.string().min(1).max(200),
  locationId: z.string().uuid().optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

export const updateStocktakeCountSchema = z.object({
  countedQuantity: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const postStocktakeSchema = z.object({
  periodId: z.string().uuid(),
  contraAccountId: z.string().uuid(),
});

// ─── NRV Write-down (IAS 2.9) ────────────────────────────────────────────────

export const nrvWriteDownSchema = z.object({
  nrvPerUnit: z.number().nonnegative(),
  periodId: z.string().uuid(),
  writeDownAccountId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsSchema>;
export type RepostGLInput = z.infer<typeof repostGLSchema>;
export type CreateStocktakeInput = z.infer<typeof createStocktakeSchema>;
export type UpdateStocktakeCountInput = z.infer<typeof updateStocktakeCountSchema>;
export type PostStocktakeInput = z.infer<typeof postStocktakeSchema>;
export type NrvWriteDownInput = z.infer<typeof nrvWriteDownSchema>;
