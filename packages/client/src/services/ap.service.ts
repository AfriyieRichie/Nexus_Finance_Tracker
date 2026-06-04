import { api } from './api';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  taxId: string | null;
  paymentTerms: number;
  bankDetails: Record<string, unknown> | null;
  whtRate: string | null;
  whtClassification: string | null;
  isActive: boolean;
}

export interface SupplierInput {
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: Record<string, unknown>;
  taxId?: string;
  paymentTerms?: number;
  bankDetails?: Record<string, unknown>;
  whtRate?: number;
  whtClassification?: string;
}

export interface SupplierStatementLine {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface SupplierStatement {
  supplier: { id: string; name: string; code: string; email: string | null; phone: string | null; address: Record<string, unknown> | null };
  organisation: { name: string; currency: string; address: Record<string, unknown> | null; email: string | null };
  period: { from: string; to: string };
  currency: string;
  openingBalance: number;
  transactions: SupplierStatementLine[];
  closingBalance: number;
  totalInvoiced: number;
  totalPayments: number;
  totalCredits: number;
  generatedAt: string;
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierRef: string | null;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  status: string;
  supplier?: { name: string; code: string };
}

export async function listSuppliers(organisationId: string, params?: { search?: string }) {
  const res = await api.get(`/organisations/${organisationId}/ap/suppliers`, { params: { pageSize: 100, ...params } });
  return { suppliers: res.data.data as Supplier[], total: res.data.pagination?.total ?? 0 };
}

export async function createSupplier(organisationId: string, data: SupplierInput) {
  const res = await api.post(`/organisations/${organisationId}/ap/suppliers`, data);
  return res.data.data as Supplier;
}

export async function updateSupplier(organisationId: string, supplierId: string, data: Partial<SupplierInput>) {
  const res = await api.put(`/organisations/${organisationId}/ap/suppliers/${supplierId}`, data);
  return res.data.data as Supplier;
}

export async function getSupplierStatement(organisationId: string, supplierId: string, from: string, to: string) {
  const res = await api.get(`/organisations/${organisationId}/ap/suppliers/${supplierId}/statement`, { params: { from, to } });
  return res.data.data as SupplierStatement;
}

export async function emailSupplierStatement(organisationId: string, supplierId: string, body: { from: string; to: string; toEmail?: string }) {
  const res = await api.post(`/organisations/${organisationId}/ap/suppliers/${supplierId}/statement/email`, body);
  return res.data.data as { sentTo: string; period: { from: string; to: string } };
}

export async function listSupplierInvoices(organisationId: string, params?: { status?: string; supplierId?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  const res = await api.get(`/organisations/${organisationId}/ap/invoices`, { params: { pageSize: 50, ...params } });
  return { invoices: res.data.data as SupplierInvoice[], total: res.data.pagination?.total ?? 0, pagination: res.data.pagination };
}

export async function createSupplierInvoice(organisationId: string, data: object) {
  const res = await api.post(`/organisations/${organisationId}/ap/invoices`, data);
  return res.data.data as SupplierInvoice;
}

export async function postSupplierInvoice(organisationId: string, invoiceId: string, periodId: string) {
  const res = await api.post(`/organisations/${organisationId}/ap/invoices/${invoiceId}/post`, { periodId });
  return res.data.data;
}

export async function recordSupplierPayment(organisationId: string, data: {
  supplierInvoiceId: string; amount: number; paymentDate: string; bankAccountId: string; periodId: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/ap/payments`, data);
  return res.data.data;
}

export async function getApAgeing(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/ap/ageing`);
  return res.data.data;
}
