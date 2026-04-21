import { api } from './api';

export interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: string;
  description: string | null;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
}

export async function listTaxCodes(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/tax`);
  return res.data.data as TaxCode[];
}

export async function createTaxCode(organisationId: string, data: { code: string; name: string; rate: number; description?: string }) {
  const res = await api.post(`/organisations/${organisationId}/tax`, data);
  return res.data.data as TaxCode;
}

export async function updateTaxCode(organisationId: string, id: string, data: Partial<{ name: string; rate: number; description: string; isActive: boolean }>) {
  const res = await api.patch(`/organisations/${organisationId}/tax/${id}`, data);
  return res.data.data as TaxCode;
}

export async function deleteTaxCode(organisationId: string, id: string) {
  await api.delete(`/organisations/${organisationId}/tax/${id}`);
}

export async function listExchangeRates(organisationId: string, params?: { fromCurrency?: string; toCurrency?: string }) {
  const res = await api.get(`/organisations/${organisationId}/tax/exchange-rates`, { params });
  return res.data.data as ExchangeRate[];
}

export async function upsertExchangeRate(organisationId: string, data: { fromCurrency: string; toCurrency: string; rate: number; effectiveDate: string }) {
  const res = await api.post(`/organisations/${organisationId}/tax/exchange-rates`, data);
  return res.data.data as ExchangeRate;
}
