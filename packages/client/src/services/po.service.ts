import { api } from './api';

export type PurchaseOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PARTIALLY_BILLED' | 'BILLED' | 'CLOSED' | 'CANCELLED';

export interface PurchaseOrderLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string | null;
  taxCode: string | null;
  taxAmount: string;
  lineTotal: string;
  quantityBilled: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  orderDate: string;
  expectedDate: string | null;
  currency: string;
  status: PurchaseOrderStatus;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  createdBy: string;
  supplier?: { name: string; code: string };
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PurchaseOrderLine[];
  invoices: { id: string; invoiceNumber: string; status: string; totalAmount: string; invoiceDate: string }[];
}

export interface PoLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string;
  taxCode?: string;
  taxAmount?: number;
}

export const listPurchaseOrders = (orgId: string, params?: { status?: string; supplierId?: string }) =>
  api.get(`/organisations/${orgId}/purchase-orders`, { params }).then((r) => r.data.data as PurchaseOrder[]);

export const getPurchaseOrder = (orgId: string, id: string) =>
  api.get(`/organisations/${orgId}/purchase-orders/${id}`).then((r) => r.data.data as PurchaseOrderDetail);

export const createPurchaseOrder = (orgId: string, data: {
  supplierId: string; orderDate: string; expectedDate?: string; currency: string; notes?: string; lines: PoLineInput[];
}) => api.post(`/organisations/${orgId}/purchase-orders`, data).then((r) => r.data.data as PurchaseOrder);

export const updatePurchaseOrder = (orgId: string, id: string, data: Partial<{
  supplierId: string; orderDate: string; expectedDate: string; currency: string; notes: string; lines: PoLineInput[];
}>) => api.put(`/organisations/${orgId}/purchase-orders/${id}`, data).then((r) => r.data.data as PurchaseOrder);

export const deletePurchaseOrder = (orgId: string, id: string) =>
  api.delete(`/organisations/${orgId}/purchase-orders/${id}`);

export const submitPoForApproval = (orgId: string, id: string) =>
  api.post(`/organisations/${orgId}/purchase-orders/${id}/submit`).then((r) => r.data.data);

export const approvePo = (orgId: string, id: string) =>
  api.post(`/organisations/${orgId}/purchase-orders/${id}/approve`).then((r) => r.data.data);

export const rejectPo = (orgId: string, id: string, reason: string) =>
  api.post(`/organisations/${orgId}/purchase-orders/${id}/reject`, { reason }).then((r) => r.data.data);

export const cancelPo = (orgId: string, id: string) =>
  api.post(`/organisations/${orgId}/purchase-orders/${id}/cancel`).then((r) => r.data.data);

export const convertPoToBill = (orgId: string, id: string, data: { dueDate?: string; supplierRef?: string; apAccountId?: string }) =>
  api.post(`/organisations/${orgId}/purchase-orders/${id}/convert-to-bill`, data).then((r) => r.data.data as { invoiceId: string; invoiceNumber: string });
