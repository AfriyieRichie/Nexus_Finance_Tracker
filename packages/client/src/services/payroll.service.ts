import { api } from './api';

export interface PayrollEntry {
  id: string;
  journalNumber: string;
  description: string;
  entryDate: string;
  status: string;
  totalAmount: string;
}

export async function processPayroll(organisationId: string, data: {
  periodId: string;
  payrollDate: string;
  description: string;
  grossSalaries: number;
  payeTax: number;
  pensionEmployee: number;
  pensionEmployer: number;
  otherDeductions: number;
  netPay: number;
  wagesAccountId: string;
  taxPayableAccountId: string;
  pensionPayableAccountId: string;
  bankAccountId: string;
  otherPayablesAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/payroll`, data);
  return res.data.data;
}

export async function listPayrollEntries(organisationId: string, params?: { page?: number; pageSize?: number }) {
  const res = await api.get(`/organisations/${organisationId}/payroll`, { params: { pageSize: 50, ...params } });
  return { entries: res.data.data as PayrollEntry[], total: res.data.pagination?.total ?? 0 };
}
