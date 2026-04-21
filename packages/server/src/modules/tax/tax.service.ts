import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';

// ─── Tax Code Types ───────────────────────────────────────────────────────────

export interface CreateTaxCodeInput {
  code: string;
  name: string;
  rate: number;
  description?: string;
}

export interface UpdateTaxCodeInput {
  name?: string;
  rate?: number;
  description?: string;
  isActive?: boolean;
}

// ─── Tax Codes ────────────────────────────────────────────────────────────────

export async function listTaxCodes(organisationId: string, isActive?: boolean) {
  return prisma.taxCode.findMany({
    where: {
      organisationId,
      ...(isActive !== undefined && { isActive }),
    },
    orderBy: [{ code: 'asc' }],
  });
}

export async function getTaxCode(organisationId: string, id: string) {
  const taxCode = await prisma.taxCode.findFirst({
    where: { id, organisationId },
  });
  if (!taxCode) throw new NotFoundError('Tax code');
  return taxCode;
}

export async function createTaxCode(
  organisationId: string,
  input: CreateTaxCodeInput,
) {
  if (input.rate < 0 || input.rate > 100) {
    throw new ValidationError('Tax rate must be between 0 and 100');
  }

  const existing = await prisma.taxCode.findFirst({
    where: { organisationId, code: input.code.toUpperCase().trim() },
  });
  if (existing) {
    throw new ConflictError(`Tax code '${input.code}' already exists for this organisation`);
  }

  return prisma.taxCode.create({
    data: {
      organisationId,
      code: input.code.toUpperCase().trim(),
      name: input.name.trim(),
      rate: new Prisma.Decimal(input.rate),
      description: input.description?.trim() ?? null,
      isActive: true,
    },
  });
}

export async function updateTaxCode(
  organisationId: string,
  id: string,
  input: UpdateTaxCodeInput,
) {
  await getTaxCode(organisationId, id);

  if (input.rate !== undefined && (input.rate < 0 || input.rate > 100)) {
    throw new ValidationError('Tax rate must be between 0 and 100');
  }

  return prisma.taxCode.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.rate !== undefined && { rate: new Prisma.Decimal(input.rate) }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteTaxCode(organisationId: string, id: string) {
  await getTaxCode(organisationId, id);
  await prisma.taxCode.delete({ where: { id } });
}

// ─── Tax Computation (pure, no DB write) ─────────────────────────────────────

export function computeTax(
  rate: number,
  amount: number,
): { taxAmount: number; grossAmount: number } {
  const taxAmount = (amount * rate) / 100;
  const grossAmount = amount + taxAmount;
  return {
    taxAmount: Math.round(taxAmount * 10000) / 10000,
    grossAmount: Math.round(grossAmount * 10000) / 10000,
  };
}

// ─── Exchange Rate Types ──────────────────────────────────────────────────────

export interface UpsertExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string; // ISO date YYYY-MM-DD
}

export interface ListExchangeRatesParams {
  fromCurrency?: string;
  toCurrency?: string;
}

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export async function listExchangeRates(
  organisationId: string,
  params: ListExchangeRatesParams,
) {
  return prisma.exchangeRate.findMany({
    where: {
      organisationId,
      ...(params.fromCurrency && {
        fromCurrency: params.fromCurrency.toUpperCase(),
      }),
      ...(params.toCurrency && {
        toCurrency: params.toCurrency.toUpperCase(),
      }),
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function upsertExchangeRate(
  organisationId: string,
  input: UpsertExchangeRateInput,
) {
  if (input.rate <= 0) {
    throw new ValidationError('Exchange rate must be greater than zero');
  }

  const from = input.fromCurrency.toUpperCase().trim();
  const to = input.toCurrency.toUpperCase().trim();

  if (from === to) {
    throw new ValidationError('fromCurrency and toCurrency must be different');
  }

  const effectiveDate = new Date(input.effectiveDate + 'T00:00:00Z');

  // Always create a new historical rate record (rates are auditable point-in-time)
  return prisma.exchangeRate.create({
    data: {
      organisationId,
      fromCurrency: from,
      toCurrency: to,
      rate: new Prisma.Decimal(input.rate),
      effectiveDate,
    },
  });
}

export async function getLatestRate(
  organisationId: string,
  fromCurrency: string,
  toCurrency: string,
) {
  if (!fromCurrency || !toCurrency) {
    throw new ValidationError('from and to currency codes are required');
  }

  const rate = await prisma.exchangeRate.findFirst({
    where: {
      organisationId,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });

  if (!rate) {
    throw new NotFoundError(
      `Exchange rate from ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()}`,
    );
  }

  return rate;
}
