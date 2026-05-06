import { api } from './api';

export type TaxTreatment = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'REVERSE_CHARGE' | 'IMPORT_VAT' | 'WITHHOLDING';
export type ExchangeRateType = 'SPOT' | 'MONTHLY_AVERAGE' | 'PERIOD_CLOSING';
export type VatReturnStatus = 'DRAFT' | 'SUBMITTED' | 'FILED';
export type FxRevaluationStatus = 'POSTED' | 'REVERSED';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface TaxCode {
  id: string;
  code: string;
  name: string;
  treatment: TaxTreatment;
  rate: string;
  isInclusive: boolean;
  glAccountId: string | null;
  glAccount: { id: string; code: string; name: string } | null;
  description: string | null;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  rateType: ExchangeRateType;
  effectiveDate: string;
}

export interface VatReturn {
  id: string;
  organisationId: string;
  periodStart: string;
  periodEnd: string;
  status: VatReturnStatus;
  box1OutputTax: string;
  box2AcquisitionTax: string;
  box3TotalOutput: string;
  box4InputTax: string;
  box5NetVat: string;
  box6TotalSupplies: string;
  box7TotalPurchases: string;
  generatedBy: string | null;
  submittedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface VatReturnLine {
  id: string;
  vatReturnId: string;
  boxNumber: number;
  journalLineId: string | null;
  netAmount: string;
  taxAmount: string;
  taxCode: string | null;
  description: string | null;
  entryDate: string;
  reference: string | null;
  journalLine?: {
    id: string;
    description: string | null;
    debitAmount: string;
    creditAmount: string;
    taxCode: string | null;
    taxAmount: string | null;
    journalEntry: { id: string; reference: string | null; entryDate: string; type: string };
    account: { id: string; code: string; name: string };
  } | null;
}

export interface VatReturnDetail extends VatReturn {
  lines: VatReturnLine[];
}

export interface FxRevaluation {
  id: string;
  organisationId: string;
  periodEndDate: string;
  status: FxRevaluationStatus;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  generatedBy: string | null;
  notes: string | null;
  createdAt: string;
  _count?: { lines: number };
}

export interface FxRevaluationLine {
  id: string;
  revaluationId: string;
  accountId: string;
  currency: string;
  openingBalance: string;
  originalRate: string;
  closingRate: string;
  baseBefore: string;
  baseAfter: string;
  gainLoss: string;
  account?: { id: string; code: string; name: string; currency: string | null };
}

export interface FxRevaluationDetail extends FxRevaluation {
  lines: FxRevaluationLine[];
}

// ── Tax Codes ─────────────────────────────────────────────────────────────────

export const listTaxCodes = (organisationId: string, isActive?: boolean) =>
  api.get(`/organisations/${organisationId}/tax`, { params: isActive !== undefined ? { isActive } : undefined })
    .then((r) => r.data.data as TaxCode[]);

export const createTaxCode = (
  organisationId: string,
  data: { code: string; name: string; treatment?: TaxTreatment; rate: number; isInclusive?: boolean; glAccountId?: string; description?: string },
) =>
  api.post(`/organisations/${organisationId}/tax`, data).then((r) => r.data.data as TaxCode);

export const updateTaxCode = (
  organisationId: string,
  id: string,
  data: Partial<{ name: string; treatment: TaxTreatment; rate: number; isInclusive: boolean; glAccountId: string | null; description: string; isActive: boolean }>,
) =>
  api.patch(`/organisations/${organisationId}/tax/${id}`, data).then((r) => r.data.data as TaxCode);

export const deleteTaxCode = (organisationId: string, id: string) =>
  api.delete(`/organisations/${organisationId}/tax/${id}`);

// ── Exchange Rates ────────────────────────────────────────────────────────────

export const listExchangeRates = (
  organisationId: string,
  params?: { fromCurrency?: string; toCurrency?: string; rateType?: ExchangeRateType },
) =>
  api.get(`/organisations/${organisationId}/tax/exchange-rates`, { params })
    .then((r) => r.data.data as ExchangeRate[]);

export const upsertExchangeRate = (
  organisationId: string,
  data: { fromCurrency: string; toCurrency: string; rate: number; rateType?: ExchangeRateType; effectiveDate: string },
) =>
  api.post(`/organisations/${organisationId}/tax/exchange-rates`, data).then((r) => r.data.data as ExchangeRate);

// ── VAT Returns ───────────────────────────────────────────────────────────────

export const listVatReturns = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/tax/vat-returns`).then((r) => r.data.data as VatReturn[]);

export const generateVatReturn = (
  organisationId: string,
  data: { periodStart: string; periodEnd: string; notes?: string },
) =>
  api.post(`/organisations/${organisationId}/tax/vat-returns`, data).then((r) => r.data.data as VatReturnDetail);

export const getVatReturn = (organisationId: string, id: string) =>
  api.get(`/organisations/${organisationId}/tax/vat-returns/${id}`).then((r) => r.data.data as VatReturnDetail);

export const updateVatReturnStatus = (organisationId: string, id: string, status: VatReturnStatus) =>
  api.patch(`/organisations/${organisationId}/tax/vat-returns/${id}/status`, { status }).then((r) => r.data.data as VatReturn);

export const deleteVatReturn = (organisationId: string, id: string) =>
  api.delete(`/organisations/${organisationId}/tax/vat-returns/${id}`);

// ── FX Revaluation ────────────────────────────────────────────────────────────

export const listFxRevaluations = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/tax/fx-revaluations`).then((r) => r.data.data as FxRevaluation[]);

export const runFxRevaluation = (
  organisationId: string,
  data: { periodEndDate: string; notes?: string },
) =>
  api.post(`/organisations/${organisationId}/tax/fx-revaluations`, data).then((r) => r.data.data as FxRevaluationDetail);

export const getFxRevaluation = (organisationId: string, id: string) =>
  api.get(`/organisations/${organisationId}/tax/fx-revaluations/${id}`).then((r) => r.data.data as FxRevaluationDetail);

export const reverseFxRevaluation = (organisationId: string, id: string) =>
  api.post(`/organisations/${organisationId}/tax/fx-revaluations/${id}/reverse`).then((r) => r.data.data as FxRevaluation);
