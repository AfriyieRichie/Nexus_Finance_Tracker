import { api } from './api';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  paymentTerms: number;
  isActive: boolean;
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

export async function createSupplier(organisationId: string, data: {
  code: string; name: string; email?: string; phone?: string; paymentTerms?: number;
}) {
  const res = await api.post(`/organisations/${organisationId}/ap/suppliers`, data);
  return res.data.data as Supplier;
}

export async function listSupplierInvoices(organisationId: string, params?: { status?: string; page?: number; pageSize?: number }) {
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
