import { api } from './api';

export type PaymentVoucherStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface PaymentVoucher {
  id: string;
  pvNumber: string;
  supplierId: string;
  voucherDate: string;
  bankAccountId: string | null;
  currency: string;
  status: PaymentVoucherStatus;
  totalAmount: string;
  payeeMemo: string | null;
  notes: string | null;
  createdBy: string;
  supplier?: { name: string; code: string };
}

export interface PaymentVoucherDetail extends PaymentVoucher {
  lines: { id: string; supplierInvoiceId: string; amount: string; supplierInvoice: { invoiceNumber: string; totalAmount: string; amountPaid: string; status: string } }[];
}

export const listPaymentVouchers = (orgId: string, params?: { status?: string; supplierId?: string }) =>
  api.get(`/organisations/${orgId}/payment-vouchers`, { params }).then((r) => r.data.data as PaymentVoucher[]);

export const getPaymentVoucher = (orgId: string, id: string) =>
  api.get(`/organisations/${orgId}/payment-vouchers/${id}`).then((r) => r.data.data as PaymentVoucherDetail);

export const createPaymentVoucher = (orgId: string, data: {
  supplierId: string; voucherDate: string; bankAccountId?: string; payeeMemo?: string; notes?: string;
  lines: { supplierInvoiceId: string; amount: number }[];
}) => api.post(`/organisations/${orgId}/payment-vouchers`, data).then((r) => r.data.data as PaymentVoucher);

export const submitPvForApproval = (orgId: string, id: string) =>
  api.post(`/organisations/${orgId}/payment-vouchers/${id}/submit`).then((r) => r.data.data);

export const approvePv = (orgId: string, id: string) =>
  api.post(`/organisations/${orgId}/payment-vouchers/${id}/approve`).then((r) => r.data.data);

export const rejectPv = (orgId: string, id: string, reason: string) =>
  api.post(`/organisations/${orgId}/payment-vouchers/${id}/reject`, { reason }).then((r) => r.data.data);

export const cancelPv = (orgId: string, id: string) =>
  api.post(`/organisations/${orgId}/payment-vouchers/${id}/cancel`).then((r) => r.data.data);

export const payPv = (orgId: string, id: string, data: { bankAccountId?: string }) =>
  api.post(`/organisations/${orgId}/payment-vouchers/${id}/pay`, data).then((r) => r.data.data);
