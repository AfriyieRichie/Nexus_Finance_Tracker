import { api } from './api';

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: string;
  residualValue: string;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDeprn: string;
  carryingValue: string;
  status: string;
  lastDeprnDate: string | null;
}

export async function listAssets(organisationId: string, params?: { search?: string; status?: string; page?: number }) {
  const res = await api.get(`/organisations/${organisationId}/assets`, { params: { pageSize: 100, ...params } });
  return { assets: res.data.data as FixedAsset[], total: res.data.pagination?.total ?? 0 };
}

export async function createAsset(organisationId: string, data: {
  code: string; name: string; category: string; acquisitionDate: string;
  acquisitionCost: number; residualValue?: number; usefulLifeMonths: number;
  depreciationMethod?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets`, data);
  return res.data.data as FixedAsset;
}

export async function runDepreciation(organisationId: string, data: { periodId: string; asOfDate: string }) {
  const res = await api.post(`/organisations/${organisationId}/assets/depreciation/run`, data);
  return res.data.data;
}

export async function disposeAsset(organisationId: string, assetId: string, data: {
  disposalDate: string; disposalProceeds: number; periodId: string; bankAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/${assetId}/dispose`, data);
  return res.data.data;
}
