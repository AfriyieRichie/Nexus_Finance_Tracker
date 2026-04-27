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
  address: { street?: string; city?: string; country?: string } | null;
}

export interface InvoiceLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  lineTotal: string;
  accountId: string | null;
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
  journalEntryId: string | null;
  customer?: { name: string; code: string };
  lines?: InvoiceLine[];
}

export async function listCustomers(organisationId: string, params?: { search?: string; page?: number }) {
  const res = await api.get(`/organisations/${organisationId}/ar/customers`, { params: { pageSize: 100, ...params } });
  return { customers: res.data.data as Customer[], total: res.data.pagination?.total ?? 0 };
}

export async function createCustomer(organisationId: string, data: {
  code: string; name: string; email?: string; phone?: string; paymentTerms?: number;
  creditLimit?: number; taxId?: string; address?: { street?: string; city?: string; country?: string };
}) {
  const res = await api.post(`/organisations/${organisationId}/ar/customers`, data);
  return res.data.data as Customer;
}

export async function updateCustomer(organisationId: string, customerId: string, data: {
  name?: string; email?: string; phone?: string; paymentTerms?: number;
  creditLimit?: number; taxId?: string; address?: { street?: string; city?: string; country?: string };
}) {
  const res = await api.put(`/organisations/${organisationId}/ar/customers/${customerId}`, data);
  return res.data.data as Customer;
}

export async function listInvoices(organisationId: string, params?: {
  status?: string; customerId?: string; from?: string; to?: string;
  page?: number; pageSize?: number;
}) {
  const res = await api.get(`/organisations/${organisationId}/ar/invoices`, { params: { pageSize: 50, ...params } });
  return { invoices: res.data.data as Invoice[], total: res.data.pagination?.total ?? 0, pagination: res.data.pagination };
}

export async function getInvoice(organisationId: string, invoiceId: string) {
  const res = await api.get(`/organisations/${organisationId}/ar/invoices/${invoiceId}`);
  return res.data.data as Invoice;
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

export async function createCreditNote(organisationId: string, data: {
  invoiceId: string; creditDate: string; periodId: string; amount: number; reason?: string; revenueAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/ar/credit-notes`, data);
  return res.data.data as { creditNoteNumber: string; journalEntryId: string; newStatus: string };
}

export async function writeBadDebt(organisationId: string, data: {
  invoiceId: string; writeOffDate: string; periodId: string; amount: number; expenseAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/ar/write-offs`, data);
  return res.data.data as { journalEntryId: string; amountWrittenOff: string };
}

export async function getArAgeing(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/ar/ageing`);
  return res.data.data;
}
