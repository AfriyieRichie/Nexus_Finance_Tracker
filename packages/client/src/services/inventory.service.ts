import { api } from './api';

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  costMethod: 'FIFO' | 'WEIGHTED_AVERAGE';
  unitCost: string;
  quantityOnHand: string;
  reorderLevel: string | null;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  isActive: boolean;
}

export interface ValuationLine {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  costMethod: string;
  unitCost: string;
  quantityOnHand: string;
  totalValue: string;
}

export async function listItems(organisationId: string, params?: { search?: string; category?: string; page?: number; pageSize?: number }) {
  const res = await api.get(`/organisations/${organisationId}/inventory`, { params: { pageSize: 100, ...params } });
  return { items: res.data.data as InventoryItem[], total: res.data.pagination?.total ?? 0 };
}

export async function createItem(organisationId: string, data: {
  code: string; name: string; description?: string; category?: string; unit?: string;
  costMethod?: string; unitCost?: number; reorderLevel?: number;
  inventoryAccountId?: string; cogsAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/inventory`, data);
  return res.data.data as InventoryItem;
}

export async function receiveStock(organisationId: string, itemId: string, data: { quantity: number; unitCost: number; notes?: string }) {
  const res = await api.post(`/organisations/${organisationId}/inventory/${itemId}/receive`, data);
  return res.data.data as InventoryItem;
}

export async function issueStock(organisationId: string, itemId: string, data: { quantity: number; notes?: string }) {
  const res = await api.post(`/organisations/${organisationId}/inventory/${itemId}/issue`, data);
  return res.data.data as InventoryItem;
}

export async function getValuationReport(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/inventory/valuation`);
  return res.data.data as ValuationLine[];
}
