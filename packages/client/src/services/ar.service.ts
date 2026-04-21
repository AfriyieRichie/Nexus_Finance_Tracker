import { api } from './api';

export interface Customer {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  creditLimit: string | null;
  paymentTerms: number;
  isActive: boolean;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  status: string;
  notes: string | null;
  customer?: { name: string; code: string };
}

export async function listCustomers(organisationId: string, params?: { search?: string; page?: number }) {
  const res = await api.get(`/organisations/${organisationId}/ar/customers`, { params: { pageSize: 100, ...params } });
  return { customers: res.data.data as Customer[], total: res.data.pagination?.total ?? 0 };
}

export async function createCustomer(organisationId: string, data: {
  code: string; name: string; email?: string; phone?: string; paymentTerms?: number;
}) {
  const res = await api.post(`/organisations/${organisationId}/ar/customers`, data);
  return res.data.data as Customer;
}

export async function listInvoices(organisationId: string, params?: { status?: string; page?: number; pageSize?: number }) {
  const res = await api.get(`/organisations/${organisationId}/ar/invoices`, { params: { pageSize: 50, ...params } });
  return { invoices: res.data.data as Invoice[], total: res.data.pagination?.total ?? 0, pagination: res.data.pagination };
}

export async function createInvoice(organisationId: string, data: object) {
  const res = await api.post(`/organisations/${organisationId}/ar/invoices`, data);
  return res.data.data as Invoice;
}

export async function postInvoice(organisationId: string, invoiceId: string, periodId: string) {
  const res = await api.post(`/organisations/${organisationId}/ar/invoices/${invoiceId}/post`, { periodId });
  return res.data.data;
}

export async function recordPayment(organisationId: string, data: {
  invoiceId: string; amount: number; paymentDate: string; bankAccountId: string; periodId: string; reference?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/ar/payments`, data);
  return res.data.data;
}

export async function getArAgeing(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/ar/ageing`);
  return res.data.data;
}
