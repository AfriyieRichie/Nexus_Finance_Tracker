import { api } from './api';

export type CostMethod = 'FIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD';
export type MovementType = 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'STOCKTAKE_IN' | 'STOCKTAKE_OUT' | 'OPENING';
export type MovementStatus = 'PENDING' | 'APPROVED' | 'POSTED' | 'REJECTED';
export type StocktakeStatus = 'OPEN' | 'COUNTING' | 'REVIEWING' | 'POSTED' | 'CANCELLED';

export interface InventoryCategory {
  id: string; name: string; description: string | null; isActive: boolean;
}

export interface InventoryLocation {
  id: string; name: string; description: string | null; isActive: boolean;
}

export interface StockBalance {
  id: string; locationId: string | null; quantityOnHand: string; averageCost: string; totalValue: string;
  location?: { id: string; name: string } | null;
}

export interface InventoryItem {
  id: string; code: string; name: string; description: string | null;
  category: string | null; categoryId: string | null;
  unit: string; costMethod: CostMethod;
  unitCost: string; standardCost: string | null;
  quantityOnHand: string; reorderLevel: string | null; reorderQuantity: string | null;
  inventoryAccountId: string | null; cogsAccountId: string | null;
  isActive: boolean; isDeleted: boolean;
  inventoryCategory?: { id: string; name: string } | null;
  stockBalances?: StockBalance[];
}

export interface InventoryMovement {
  id: string; itemId: string; locationId: string | null;
  movementType: MovementType; quantity: string; unitCost: string; totalCost: string;
  contraAccountId: string | null; reference: string | null; description: string | null;
  reasonCode: string | null; status: MovementStatus; journalEntryId: string | null;
  transactionDate: string; requestedBy: string | null; approvedBy: string | null; approvedAt: string | null;
  createdAt: string;
  item?: { code: string; name: string; unit: string };
}

export interface StocktakeCount {
  id: string; sessionId: string; itemId: string; locationId: string | null;
  systemQuantity: string; countedQuantity: string | null;
  varianceQuantity: string | null; unitCost: string; varianceValue: string | null; notes: string | null;
  item?: { code: string; name: string; unit: string };
}

export interface StocktakeSession {
  id: string; name: string; locationId: string | null; sessionDate: string;
  status: StocktakeStatus; notes: string | null; createdBy: string;
  postedBy: string | null; postedAt: string | null; createdAt: string;
  location?: { name: string } | null;
  counts?: StocktakeCount[];
  _count?: { counts: number };
}

export interface ValuationLine {
  itemId: string; code: string; name: string; category: string | null;
  unit: string; costMethod: CostMethod;
  quantityOnHand: string; unitCost: string; totalValue: string;
}

// ── Categories ────────────────────────────────────────────────────────────────
export const listCategories = (orgId: string) =>
  api.get(`/organisations/${orgId}/inventory/categories`).then((r) => r.data.data as InventoryCategory[]);

export const createCategory = (orgId: string, data: { name: string; description?: string }) =>
  api.post(`/organisations/${orgId}/inventory/categories`, data).then((r) => r.data.data as InventoryCategory);

export const updateCategory = (orgId: string, categoryId: string, data: Partial<{ name: string; description: string; isActive: boolean }>) =>
  api.patch(`/organisations/${orgId}/inventory/categories/${categoryId}`, data).then((r) => r.data.data as InventoryCategory);

// ── Locations ─────────────────────────────────────────────────────────────────
export const listLocations = (orgId: string) =>
  api.get(`/organisations/${orgId}/inventory/locations`).then((r) => r.data.data as InventoryLocation[]);

export const createLocation = (orgId: string, data: { name: string; description?: string }) =>
  api.post(`/organisations/${orgId}/inventory/locations`, data).then((r) => r.data.data as InventoryLocation);

// ── Items ─────────────────────────────────────────────────────────────────────
export const listItems = (orgId: string, params?: { search?: string; categoryId?: string; isLowStock?: boolean; page?: number; pageSize?: number }) =>
  api.get(`/organisations/${orgId}/inventory`, { params: { pageSize: 100, ...params } })
    .then((r) => ({ items: r.data.data as InventoryItem[], total: r.data.pagination?.total ?? 0 }));

export const getItem = (orgId: string, itemId: string) =>
  api.get(`/organisations/${orgId}/inventory/${itemId}`).then((r) => r.data.data as InventoryItem);

export const createItem = (orgId: string, data: Partial<InventoryItem> & { code: string; name: string }) =>
  api.post(`/organisations/${orgId}/inventory`, data).then((r) => r.data.data as InventoryItem);

export const updateItem = (orgId: string, itemId: string, data: Partial<InventoryItem>) =>
  api.patch(`/organisations/${orgId}/inventory/${itemId}`, data).then((r) => r.data.data as InventoryItem);

export const deleteItem = (orgId: string, itemId: string) =>
  api.delete(`/organisations/${orgId}/inventory/${itemId}`);

// ── Movements ─────────────────────────────────────────────────────────────────
export const listMovements = (orgId: string, params?: { itemId?: string; movementType?: MovementType; status?: MovementStatus; page?: number; pageSize?: number }) =>
  api.get(`/organisations/${orgId}/inventory/movements`, { params: { pageSize: 50, ...params } })
    .then((r) => ({ movements: r.data.data as InventoryMovement[], total: r.data.pagination?.total ?? 0 }));

export const createMovement = (orgId: string, data: {
  itemId: string; locationId?: string; movementType: MovementType; quantity: number;
  unitCost?: number; contraAccountId?: string; periodId?: string;
  reference?: string; description?: string; reasonCode?: string; transactionDate: string;
}) => api.post(`/organisations/${orgId}/inventory/movements`, data).then((r) => r.data.data as InventoryMovement);

export const approveMovement = (orgId: string, movementId: string) =>
  api.post(`/organisations/${orgId}/inventory/movements/${movementId}/approve`).then((r) => r.data.data as InventoryMovement);

export const rejectMovement = (orgId: string, movementId: string) =>
  api.post(`/organisations/${orgId}/inventory/movements/${movementId}/reject`).then((r) => r.data.data as InventoryMovement);

export const repostMovementGL = (orgId: string, movementId: string, data: { contraAccountId: string; periodId: string }) =>
  api.post(`/organisations/${orgId}/inventory/movements/${movementId}/repost-gl`, data).then((r) => r.data.data as { journalEntryId: string; journalNumber: string; amount: string });

// ── Stocktake ─────────────────────────────────────────────────────────────────
export const listStocktakeSessions = (orgId: string) =>
  api.get(`/organisations/${orgId}/inventory/stocktake`).then((r) => r.data.data as StocktakeSession[]);

export const createStocktakeSession = (orgId: string, data: { name: string; locationId?: string; sessionDate: string; notes?: string }) =>
  api.post(`/organisations/${orgId}/inventory/stocktake`, data).then((r) => r.data.data as StocktakeSession);

export const getStocktakeSession = (orgId: string, sessionId: string) =>
  api.get(`/organisations/${orgId}/inventory/stocktake/${sessionId}`).then((r) => r.data.data as StocktakeSession);

export const updateStocktakeCount = (orgId: string, sessionId: string, itemId: string, data: { countedQuantity: number; notes?: string }) =>
  api.patch(`/organisations/${orgId}/inventory/stocktake/${sessionId}/counts/${itemId}`, data).then((r) => r.data.data as StocktakeCount);

export const postStocktakeVariances = (orgId: string, sessionId: string, periodId: string) =>
  api.post(`/organisations/${orgId}/inventory/stocktake/${sessionId}/post`, { periodId }).then((r) => r.data.data as StocktakeSession);

export const cancelStocktakeSession = (orgId: string, sessionId: string) =>
  api.post(`/organisations/${orgId}/inventory/stocktake/${sessionId}/cancel`).then((r) => r.data.data as StocktakeSession);

// ── Valuation ─────────────────────────────────────────────────────────────────
export const getValuationReport = (orgId: string, asAt?: string) =>
  api.get(`/organisations/${orgId}/inventory/valuation`, { params: asAt ? { asAt } : undefined })
    .then((r) => r.data.data as { items: ValuationLine[]; grandTotal: string });
