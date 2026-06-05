import { api } from './api';

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  defaultDepreciationMethod: string;
  defaultUsefulLifeMonths?: number;
  capitalisationThreshold?: string;
  assetCostAccountId?: string | null;
  depreciationExpenseAccountId?: string | null;
  accumulatedDepreciationAccountId?: string | null;
}

export interface AssetRevaluation {
  id: string;
  revaluationDate: string;
  fairValue: string;
  previousCarryingValue: string;
  surplusDeficit: string;
  notes?: string;
  createdAt: string;
}

export interface AssetImpairment {
  id: string;
  impairmentDate: string;
  impairmentAmount: string;
  previousCarryingValue: string;
  newCarryingValue: string;
  notes?: string;
  createdAt: string;
}

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  categoryId?: string;
  serialNumber?: string;
  location?: string;
  acquisitionDate: string;
  acquisitionCost: string;
  residualValue: string;
  usefulLifeMonths: number;
  depreciationMethod: string;
  unitsOfProductionTotal?: number;
  depreciationMonthsElapsed: number;
  accumulatedDeprn: string;
  impairmentLoss: string;
  carryingValue: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED';
  lastDeprnDate: string | null;
  assetCategory?: AssetCategory;
  revaluations?: AssetRevaluation[];
  impairments?: AssetImpairment[];
}

export async function listCategories(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/assets/categories`);
  return res.data.data as AssetCategory[];
}

export async function createCategory(organisationId: string, data: {
  code: string; name: string; description?: string;
  defaultDepreciationMethod?: string; defaultUsefulLifeMonths?: number;
  capitalisationThreshold?: number;
  assetCostAccountId?: string | null;
  depreciationExpenseAccountId?: string | null;
  accumulatedDepreciationAccountId?: string | null;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/categories`, data);
  return res.data.data as AssetCategory;
}

export async function updateCategory(organisationId: string, categoryId: string, data: Partial<{
  name: string; description: string; defaultDepreciationMethod: string;
  defaultUsefulLifeMonths: number; capitalisationThreshold: number;
  assetCostAccountId: string | null;
  depreciationExpenseAccountId: string | null;
  accumulatedDepreciationAccountId: string | null;
}>) {
  const res = await api.put(`/organisations/${organisationId}/assets/categories/${categoryId}`, data);
  return res.data.data as AssetCategory;
}

export async function listAssets(organisationId: string, params?: { search?: string; status?: string; page?: number }) {
  const res = await api.get(`/organisations/${organisationId}/assets`, { params: { pageSize: 100, ...params } });
  return { assets: res.data.data as FixedAsset[], total: res.data.pagination?.total ?? 0 };
}

export async function createAsset(organisationId: string, data: {
  code: string; name: string; category: string; categoryId?: string;
  serialNumber?: string; location?: string;
  acquisitionDate: string; acquisitionCost: number;
  residualValue?: number; usefulLifeMonths: number;
  depreciationMethod?: string; unitsOfProductionTotal?: number;
  assetAccountId?: string; deprnAccountId?: string; accDeprnAccountId?: string;
  acquisitionCreditAccountId?: string; supplierId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets`, data);
  return res.data.data as FixedAsset;
}

export interface PendingCapitalisation {
  lineId: string;
  supplierInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  supplierName: string;
  supplierCode: string;
  description: string;
  amount: number;
  quantity: number;
  unitCost: number;
}

export async function getPendingCapitalisations(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/assets/pending-capitalisation`);
  return res.data.data as { clearingAccountId: string | null; items: PendingCapitalisation[] };
}

export interface CapitalisationResult {
  count: number;
  codes: string[];
  assets: FixedAsset[];
}

export async function capitaliseFromClearing(organisationId: string, data: {
  sourceLineId: string;
  categoryId: string;
  quantity: number;
  serialNumbers?: string[];
  name: string;
  serialNumber?: string; location?: string;
  acquisitionDate: string;
  residualValue?: number; usefulLifeMonths: number;
  depreciationMethod?: string; reducingBalanceRate?: number; unitsOfProductionTotal?: number;
  assetAccountId?: string; deprnAccountId?: string; accDeprnAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/capitalise`, data);
  return res.data.data as CapitalisationResult;
}

export async function updateAsset(organisationId: string, assetId: string, data: Partial<{
  name: string; description: string; category: string; categoryId: string;
  serialNumber: string; location: string; residualValue: number;
  usefulLifeMonths: number; depreciationMethod: string;
}>) {
  const res = await api.put(`/organisations/${organisationId}/assets/${assetId}`, data);
  return res.data.data as FixedAsset;
}

export async function getAsset(organisationId: string, assetId: string) {
  const res = await api.get(`/organisations/${organisationId}/assets/${assetId}`);
  return res.data.data as FixedAsset;
}

export async function previewDepreciation(organisationId: string, data: { periodId: string; asOfDate: string }) {
  const res = await api.post(`/organisations/${organisationId}/assets/depreciation/run`, { ...data, preview: true });
  return res.data.data;
}

export async function runDepreciation(organisationId: string, data: { periodId: string; asOfDate: string; assetUnitsOverrides?: Array<{ assetId: string; units: number }> }) {
  const res = await api.post(`/organisations/${organisationId}/assets/depreciation/run`, { ...data, preview: false });
  return res.data.data;
}

export async function reverseDepreciation(organisationId: string, data: { runId: string; periodId: string; reason: string }) {
  const res = await api.post(`/organisations/${organisationId}/assets/depreciation/reverse`, data);
  return res.data.data;
}

export async function listDepreciationRuns(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/assets/depreciation/runs`);
  return res.data.data;
}

export async function disposeAsset(organisationId: string, assetId: string, data: {
  disposalDate: string; disposalProceeds: number; periodId: string; proceedsAccountId?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/${assetId}/dispose`, data);
  return res.data.data;
}

export async function revalueAsset(organisationId: string, assetId: string, data: {
  revaluationDate: string; fairValue: number; periodId: string; reserveAccountId?: string; notes?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/${assetId}/revalue`, data);
  return res.data.data;
}

export async function impairAsset(organisationId: string, assetId: string, data: {
  impairmentDate: string; recoverableAmount: number; periodId: string; impairmentAccountId?: string; notes?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/${assetId}/impair`, data);
  return res.data.data;
}

export async function reverseImpairment(organisationId: string, assetId: string, data: {
  reversalDate: string; reversalAmount: number; periodId: string; impairmentAccountId?: string; notes?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/assets/${assetId}/impairment-reversal`, data);
  return res.data.data;
}

export interface DepreciationScheduleRow {
  period: number;
  depreciation: string;
  accumulatedDepreciation: string;
  carryingValue: string;
}

export async function getDepreciationSchedule(organisationId: string, assetId: string, months = 60) {
  const res = await api.get(`/organisations/${organisationId}/assets/${assetId}/depreciation-schedule`, { params: { months } });
  return res.data.data as DepreciationScheduleRow[];
}

export async function setAssetStatus(organisationId: string, assetId: string, data: { status: 'ACTIVE' | 'INACTIVE'; reason?: string }) {
  const res = await api.patch(`/organisations/${organisationId}/assets/${assetId}/status`, data);
  return res.data.data as FixedAsset;
}

export async function bulkCreateAssets(organisationId: string, assets: Array<{
  code: string; name: string; category: string; categoryId?: string;
  serialNumber?: string; location?: string;
  acquisitionDate: string; acquisitionCost: number;
  residualValue?: number; usefulLifeMonths: number;
  depreciationMethod?: string; unitsOfProductionTotal?: number;
}>) {
  const res = await api.post(`/organisations/${organisationId}/assets/bulk`, { assets });
  return res.data.data as { created: number; codes: string[] };
}
