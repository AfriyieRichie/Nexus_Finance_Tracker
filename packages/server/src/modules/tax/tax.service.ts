import { Prisma, TaxTreatment, ExchangeRateType, VatReturnStatus, FxRevaluationStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTaxCodeInput {
  code: string;
  name: string;
  treatment?: TaxTreatment;
  rate: number;
  isInclusive?: boolean;
  glAccountId?: string;
  description?: string;
}

export interface UpdateTaxCodeInput {
  name?: string;
  treatment?: TaxTreatment;
  rate?: number;
  isInclusive?: boolean;
  glAccountId?: string | null;
  description?: string;
  isActive?: boolean;
}

export interface UpsertExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateType?: ExchangeRateType;
  effectiveDate: string;
}

export interface ListExchangeRatesParams {
  fromCurrency?: string;
  toCurrency?: string;
  rateType?: ExchangeRateType;
}

export interface GenerateVatReturnInput {
  periodStart: string;
  periodEnd: string;
  notes?: string;
}

export interface RunFxRevaluationInput {
  periodEndDate: string;
  notes?: string;
}

// ─── Tax Codes ────────────────────────────────────────────────────────────────

export async function listTaxCodes(organisationId: string, isActive?: boolean) {
  return prisma.taxCode.findMany({
    where: { organisationId, ...(isActive !== undefined && { isActive }) },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
    orderBy: [{ code: 'asc' }],
  });
}

export async function getTaxCode(organisationId: string, id: string) {
  const tc = await prisma.taxCode.findFirst({
    where: { id, organisationId },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
  if (!tc) throw new NotFoundError('Tax code');
  return tc;
}

export async function createTaxCode(organisationId: string, input: CreateTaxCodeInput) {
  if (input.rate < 0 || input.rate > 100) throw new ValidationError('Tax rate must be between 0 and 100');

  const existing = await prisma.taxCode.findFirst({
    where: { organisationId, code: input.code.toUpperCase().trim() },
  });
  if (existing) throw new ConflictError(`Tax code '${input.code}' already exists`);

  if (input.glAccountId) {
    const acct = await prisma.account.findFirst({ where: { id: input.glAccountId, organisationId } });
    if (!acct) throw new NotFoundError('GL account');
  }

  return prisma.taxCode.create({
    data: {
      organisationId,
      code: input.code.toUpperCase().trim(),
      name: input.name.trim(),
      treatment: input.treatment ?? TaxTreatment.STANDARD,
      rate: new Prisma.Decimal(input.rate),
      isInclusive: input.isInclusive ?? false,
      glAccountId: input.glAccountId ?? null,
      description: input.description?.trim() ?? null,
      isActive: true,
    },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

export async function updateTaxCode(organisationId: string, id: string, input: UpdateTaxCodeInput) {
  await getTaxCode(organisationId, id);

  if (input.rate !== undefined && (input.rate < 0 || input.rate > 100)) {
    throw new ValidationError('Tax rate must be between 0 and 100');
  }
  if (input.glAccountId) {
    const acct = await prisma.account.findFirst({ where: { id: input.glAccountId, organisationId } });
    if (!acct) throw new NotFoundError('GL account');
  }

  return prisma.taxCode.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.treatment !== undefined && { treatment: input.treatment }),
      ...(input.rate !== undefined && { rate: new Prisma.Decimal(input.rate) }),
      ...(input.isInclusive !== undefined && { isInclusive: input.isInclusive }),
      ...(input.glAccountId !== undefined && { glAccountId: input.glAccountId }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

export async function deleteTaxCode(organisationId: string, id: string) {
  await getTaxCode(organisationId, id);
  await prisma.taxCode.delete({ where: { id } });
}

// ─── Tax Computation ──────────────────────────────────────────────────────────

export function computeTax(
  rate: number,
  amount: number,
  isInclusive = false,
): { netAmount: number; taxAmount: number; grossAmount: number } {
  if (isInclusive) {
    // Amount already includes tax: net = gross / (1 + rate/100)
    const net = amount / (1 + rate / 100);
    const taxAmount = amount - net;
    return {
      netAmount: Math.round(net * 10000) / 10000,
      taxAmount: Math.round(taxAmount * 10000) / 10000,
      grossAmount: Math.round(amount * 10000) / 10000,
    };
  }
  const taxAmount = (amount * rate) / 100;
  return {
    netAmount: Math.round(amount * 10000) / 10000,
    taxAmount: Math.round(taxAmount * 10000) / 10000,
    grossAmount: Math.round((amount + taxAmount) * 10000) / 10000,
  };
}

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export async function listExchangeRates(organisationId: string, params: ListExchangeRatesParams) {
  return prisma.exchangeRate.findMany({
    where: {
      organisationId,
      ...(params.fromCurrency && { fromCurrency: params.fromCurrency.toUpperCase() }),
      ...(params.toCurrency && { toCurrency: params.toCurrency.toUpperCase() }),
      ...(params.rateType && { rateType: params.rateType }),
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function upsertExchangeRate(organisationId: string, input: UpsertExchangeRateInput) {
  if (input.rate <= 0) throw new ValidationError('Exchange rate must be greater than zero');

  const from = input.fromCurrency.toUpperCase().trim();
  const to = input.toCurrency.toUpperCase().trim();
  if (from === to) throw new ValidationError('fromCurrency and toCurrency must be different');

  return prisma.exchangeRate.create({
    data: {
      organisationId,
      fromCurrency: from,
      toCurrency: to,
      rate: new Prisma.Decimal(input.rate),
      rateType: input.rateType ?? ExchangeRateType.SPOT,
      effectiveDate: new Date(input.effectiveDate + 'T00:00:00Z'),
    },
  });
}

export async function getLatestRate(
  organisationId: string,
  fromCurrency: string,
  toCurrency: string,
  rateType?: ExchangeRateType,
) {
  if (!fromCurrency || !toCurrency) throw new ValidationError('from and to currency codes are required');

  const rate = await prisma.exchangeRate.findFirst({
    where: {
      organisationId,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      ...(rateType && { rateType }),
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });

  if (!rate) throw new NotFoundError(`Exchange rate ${fromCurrency.toUpperCase()}→${toCurrency.toUpperCase()}`);
  return rate;
}

// ─── VAT Return ───────────────────────────────────────────────────────────────

// Box mapping by tax treatment:
//   STANDARD, REVERSE_CHARGE, IMPORT_VAT → output VAT → box 1 (or box 2 for reverse/import)
//   REVERSE_CHARGE, IMPORT_VAT acquisition tax → box 2
//   Input tax on purchases → box 4
//   Supply net values → box 6 (revenues), box 7 (purchases)
function treatmentToBox(treatment: string, isOutput: boolean): number {
  if (isOutput) {
    if (treatment === 'REVERSE_CHARGE' || treatment === 'IMPORT_VAT') return 2;
    return 1; // STANDARD
  }
  return 4; // input tax
}

export async function generateVatReturn(
  organisationId: string,
  userId: string,
  input: GenerateVatReturnInput,
) {
  const periodStart = new Date(input.periodStart + 'T00:00:00Z');
  const periodEnd = new Date(input.periodEnd + 'T23:59:59Z');

  if (periodStart >= periodEnd) throw new ValidationError('periodEnd must be after periodStart');

  // Fetch all posted journal lines with a tax code in the period
  const taxLines = await prisma.journalLine.findMany({
    where: {
      journalEntry: {
        organisationId,
        status: 'POSTED',
        entryDate: { gte: periodStart, lte: periodEnd },
      },
      taxCode: { not: null },
      taxAmount: { not: null },
    },
    include: {
      journalEntry: { select: { id: true, reference: true, entryDate: true } },
      account: { select: { class: true } },
    },
  });

  // Fetch all tax codes for this org to look up treatment
  const taxCodes = await prisma.taxCode.findMany({ where: { organisationId } });
  const tcMap = new Map(taxCodes.map((tc) => [tc.code, tc]));

  let box1 = new Prisma.Decimal(0);
  let box2 = new Prisma.Decimal(0);
  let box4 = new Prisma.Decimal(0);
  let box6 = new Prisma.Decimal(0);
  let box7 = new Prisma.Decimal(0);

  const vatLines: Array<{
    boxNumber: number;
    journalLineId: string;
    netAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    taxCode: string;
    description: string | null;
    entryDate: Date;
    reference: string | null;
  }> = [];

  for (const line of taxLines) {
    const tc = line.taxCode ? tcMap.get(line.taxCode) : null;
    if (!tc) continue;
    if (tc.treatment === TaxTreatment.EXEMPT || tc.treatment === TaxTreatment.ZERO_RATED) continue;

    const taxAmt = line.taxAmount ?? new Prisma.Decimal(0);
    const netAmt = line.debitAmount.minus(line.creditAmount).abs();
    const isRevenue = line.account.class === 'REVENUE';
    const isExpense = line.account.class === 'EXPENSE';

    // Revenue lines → output tax (boxes 1/2/6); Expense/Asset lines → input tax (box 4/7)
    const isOutput = isRevenue || tc.treatment === TaxTreatment.REVERSE_CHARGE || tc.treatment === TaxTreatment.IMPORT_VAT;
    const box = treatmentToBox(tc.treatment, isOutput);

    if (box === 1) box1 = box1.plus(taxAmt);
    else if (box === 2) box2 = box2.plus(taxAmt);
    else if (box === 4) box4 = box4.plus(taxAmt);

    if (isRevenue) box6 = box6.plus(netAmt);
    else if (isExpense) box7 = box7.plus(netAmt);

    vatLines.push({
      boxNumber: box,
      journalLineId: line.id,
      netAmount: netAmt,
      taxAmount: taxAmt,
      taxCode: tc.code,
      description: line.description,
      entryDate: line.journalEntry.entryDate,
      reference: line.journalEntry.reference,
    });
  }

  const box3 = box1.plus(box2);
  const box5 = box3.minus(box4);

  return prisma.vatReturn.create({
    data: {
      organisationId,
      periodStart,
      periodEnd,
      status: VatReturnStatus.DRAFT,
      box1OutputTax: box1,
      box2AcquisitionTax: box2,
      box3TotalOutput: box3,
      box4InputTax: box4,
      box5NetVat: box5,
      box6TotalSupplies: box6,
      box7TotalPurchases: box7,
      generatedBy: userId,
      notes: input.notes ?? null,
      lines: {
        create: vatLines.map((l) => ({
          boxNumber: l.boxNumber,
          journalLineId: l.journalLineId,
          netAmount: l.netAmount,
          taxAmount: l.taxAmount,
          taxCode: l.taxCode,
          description: l.description,
          entryDate: l.entryDate,
          reference: l.reference,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function listVatReturns(organisationId: string) {
  return prisma.vatReturn.findMany({
    where: { organisationId },
    orderBy: { periodStart: 'desc' },
  });
}

export async function getVatReturn(organisationId: string, id: string) {
  const vr = await prisma.vatReturn.findFirst({
    where: { id, organisationId },
    include: {
      lines: {
        orderBy: [{ boxNumber: 'asc' }, { entryDate: 'asc' }],
        include: {
          journalLine: {
            select: {
              id: true,
              description: true,
              debitAmount: true,
              creditAmount: true,
              taxCode: true,
              taxAmount: true,
              journalEntry: { select: { id: true, reference: true, entryDate: true, type: true } },
              account: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!vr) throw new NotFoundError('VAT return');
  return vr;
}

export async function updateVatReturnStatus(
  organisationId: string,
  id: string,
  status: VatReturnStatus,
) {
  const vr = await prisma.vatReturn.findFirst({ where: { id, organisationId } });
  if (!vr) throw new NotFoundError('VAT return');
  if (vr.status === VatReturnStatus.FILED) throw new ForbiddenError('Filed VAT returns cannot be changed');

  return prisma.vatReturn.update({
    where: { id },
    data: {
      status,
      ...(status === VatReturnStatus.SUBMITTED && { submittedAt: new Date() }),
    },
  });
}

export async function deleteVatReturn(organisationId: string, id: string) {
  const vr = await prisma.vatReturn.findFirst({ where: { id, organisationId } });
  if (!vr) throw new NotFoundError('VAT return');
  if (vr.status !== VatReturnStatus.DRAFT) throw new ForbiddenError('Only draft VAT returns can be deleted');
  await prisma.vatReturn.delete({ where: { id } });
}

// ─── FX Revaluation (IAS 21) ──────────────────────────────────────────────────

export async function runFxRevaluation(
  organisationId: string,
  userId: string,
  input: RunFxRevaluationInput,
) {
  const periodEnd = new Date(input.periodEndDate + 'T23:59:59Z');
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  if (!org) throw new NotFoundError('Organisation');

  const baseCurrency = org.baseCurrency;

  // Find all foreign-currency accounts (AR, AP, BANK) with open balances
  const fxAccounts = await prisma.account.findMany({
    where: {
      organisationId,
      isActive: true,
      isDeleted: false,
      currency: { not: null },
      type: { in: ['BANK', 'CASH', 'RECEIVABLE', 'PAYABLE'] },
    },
    select: { id: true, code: true, name: true, currency: true, type: true },
  });

  if (!fxAccounts.length) {
    throw new ValidationError('No foreign currency accounts found for revaluation');
  }

  const revalLines: Array<{
    accountId: string;
    currency: string;
    openingBalance: Prisma.Decimal;
    originalRate: Prisma.Decimal;
    closingRate: Prisma.Decimal;
    baseBefore: Prisma.Decimal;
    baseAfter: Prisma.Decimal;
    gainLoss: Prisma.Decimal;
  }> = [];

  let totalGainLoss = new Prisma.Decimal(0);

  for (const acct of fxAccounts) {
    if (!acct.currency || acct.currency === baseCurrency) continue;

    // Get net balance in functional (base) currency from ledger entries up to periodEnd
    const ledgerAgg = await prisma.ledgerEntry.aggregate({
      where: {
        organisationId,
        accountId: acct.id,
        transactionDate: { lte: periodEnd },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });

    const totalDebit = ledgerAgg._sum?.debitAmount ?? new Prisma.Decimal(0);
    const totalCredit = ledgerAgg._sum?.creditAmount ?? new Prisma.Decimal(0);
    const baseBefore = totalDebit.minus(totalCredit);

    if (baseBefore.isZero()) continue;

    // Get journal lines in FC to compute the original FC balance
    const jlAgg = await prisma.journalLine.aggregate({
      where: {
        accountId: acct.id,
        journalEntry: {
          organisationId,
          status: 'POSTED',
          entryDate: { lte: periodEnd },
        },
        currency: acct.currency,
      },
      _sum: { debitAmount: true, creditAmount: true },
    });

    const fcDebit = jlAgg._sum?.debitAmount ?? new Prisma.Decimal(0);
    const fcCredit = jlAgg._sum?.creditAmount ?? new Prisma.Decimal(0);
    const fcBalance = fcDebit.minus(fcCredit);

    if (fcBalance.isZero()) continue;

    // Implied original rate = base balance / FC balance
    const originalRate = baseBefore.div(fcBalance).abs();

    // Get the period closing rate
    let closingRateRecord;
    try {
      closingRateRecord = await prisma.exchangeRate.findFirst({
        where: {
          organisationId,
          fromCurrency: acct.currency,
          toCurrency: baseCurrency,
          rateType: ExchangeRateType.PERIOD_CLOSING,
          effectiveDate: { lte: periodEnd },
        },
        orderBy: { effectiveDate: 'desc' },
      });
      // Fall back to any rate if no period closing rate
      if (!closingRateRecord) {
        closingRateRecord = await prisma.exchangeRate.findFirst({
          where: {
            organisationId,
            fromCurrency: acct.currency,
            toCurrency: baseCurrency,
            effectiveDate: { lte: periodEnd },
          },
          orderBy: { effectiveDate: 'desc' },
        });
      }
    } catch {
      continue;
    }

    if (!closingRateRecord) continue;

    const closingRate = closingRateRecord.rate;
    const baseAfter = fcBalance.times(closingRate);
    const gainLoss = baseAfter.minus(baseBefore);

    if (gainLoss.isZero()) continue;

    totalGainLoss = totalGainLoss.plus(gainLoss);
    revalLines.push({
      accountId: acct.id,
      currency: acct.currency,
      openingBalance: fcBalance,
      originalRate,
      closingRate,
      baseBefore,
      baseAfter,
      gainLoss,
    });
  }

  if (!revalLines.length) {
    throw new ValidationError('No revaluation differences found — all balances are zero or no closing rates exist');
  }

  // Create the FX revaluation record (journal entry can be posted separately)
  return prisma.fxRevaluation.create({
    data: {
      organisationId,
      periodEndDate: new Date(input.periodEndDate + 'T00:00:00Z'),
      status: FxRevaluationStatus.POSTED,
      generatedBy: userId,
      notes: input.notes ?? null,
      lines: { create: revalLines },
    },
    include: {
      lines: {
        include: { account: { select: { id: true, code: true, name: true, currency: true } } },
      },
    },
  });
}

export async function listFxRevaluations(organisationId: string) {
  return prisma.fxRevaluation.findMany({
    where: { organisationId },
    include: { _count: { select: { lines: true } } },
    orderBy: { periodEndDate: 'desc' },
  });
}

export async function getFxRevaluation(organisationId: string, id: string) {
  const rev = await prisma.fxRevaluation.findFirst({
    where: { id, organisationId },
    include: {
      lines: {
        include: { account: { select: { id: true, code: true, name: true, currency: true } } },
        orderBy: { gainLoss: 'asc' },
      },
    },
  });
  if (!rev) throw new NotFoundError('FX revaluation');
  return rev;
}

export async function reverseFxRevaluation(organisationId: string, id: string) {
  const rev = await prisma.fxRevaluation.findFirst({ where: { id, organisationId } });
  if (!rev) throw new NotFoundError('FX revaluation');
  if (rev.status === FxRevaluationStatus.REVERSED) throw new ForbiddenError('Already reversed');

  return prisma.fxRevaluation.update({
    where: { id },
    data: { status: FxRevaluationStatus.REVERSED },
  });
}
