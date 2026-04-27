import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import type {
  CreateAssetInput, UpdateAssetInput, ListAssetsQuery,
  RunDepreciationInput, DisposeAssetInput,
} from './assets.schemas';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeMonthlyDeprn(
  cost: Prisma.Decimal,
  residual: Prisma.Decimal,
  usefulLifeMonths: number,
  method: string,
  carryingValue: Prisma.Decimal,
): Prisma.Decimal {
  if (method === 'STRAIGHT_LINE') {
    return cost.minus(residual).dividedBy(usefulLifeMonths);
  }
  // Reducing balance: double SLM rate
  const rate = new Prisma.Decimal(2).dividedBy(usefulLifeMonths);
  return carryingValue.times(rate);
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createAsset(organisationId: string, input: CreateAssetInput) {
  const exists = await prisma.fixedAsset.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (exists) throw new ConflictError(`Asset code '${input.code}' already exists`);

  const method = input.depreciationMethod === 'DECLINING_BALANCE' ? 'REDUCING_BALANCE' : input.depreciationMethod;
  const cost = new Prisma.Decimal(input.acquisitionCost);

  return prisma.fixedAsset.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description,
      category: input.category,
      acquisitionDate: new Date(input.acquisitionDate),
      acquisitionCost: cost,
      residualValue: new Prisma.Decimal(input.residualValue),
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE',
      carryingValue: cost,
      assetAccountId: input.assetAccountId,
      deprnAccountId: input.deprnAccountId,
      accDeprnAccountId: input.accDeprnAccountId,
    },
  });
}

export async function updateAsset(organisationId: string, assetId: string, input: UpdateAssetInput) {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: assetId, organisationId, isDeleted: false } });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'DISPOSED') throw new ValidationError('Cannot update a disposed asset');

  const method = input.depreciationMethod === 'DECLINING_BALANCE' ? 'REDUCING_BALANCE' : input.depreciationMethod;

  return prisma.fixedAsset.update({
    where: { id: assetId },
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      residualValue: input.residualValue != null ? new Prisma.Decimal(input.residualValue) : undefined,
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE' | undefined,
      assetAccountId: input.assetAccountId,
      deprnAccountId: input.deprnAccountId,
      accDeprnAccountId: input.accDeprnAccountId,
    },
  });
}

export async function listAssets(organisationId: string, query: ListAssetsQuery) {
  const where: Prisma.FixedAssetWhereInput = {
    organisationId,
    isDeleted: false,
    ...(query.category && { category: query.category }),
    ...(query.status && { status: query.status }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, assets] = await Promise.all([
    prisma.fixedAsset.count({ where }),
    prisma.fixedAsset.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { assets, total, page: query.page, pageSize: query.pageSize };
}

export async function getAsset(organisationId: string, assetId: string) {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: assetId, organisationId, isDeleted: false } });
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}

// ─── Depreciation ────────────────────────────────────────────────────────────

export async function runDepreciation(
  organisationId: string, userId: string, input: RunDepreciationInput,
) {
  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Period not found or not open');

  const asOfDate = new Date(input.asOfDate);

  const assets = await prisma.fixedAsset.findMany({
    where: {
      organisationId,
      isDeleted: false,
      status: 'ACTIVE',
      OR: [
        { lastDeprnDate: null },
        { lastDeprnDate: { lt: asOfDate } },
      ],
    },
  });

  if (assets.length === 0) {
    return { processed: 0, message: 'No assets require depreciation for this period' };
  }

  const results: { assetId: string; assetCode: string; amount: string }[] = [];

  // Find default depreciation accounts
  const defaultDeprnExp = await prisma.account.findFirst({
    where: { organisationId, type: 'EXPENSE_ACCOUNT', isActive: true, isDeleted: false },
    select: { id: true },
  });
  const defaultAccDeprn = await prisma.account.findFirst({
    where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false },
    select: { id: true },
  });

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  const currency = org?.baseCurrency ?? 'USD';

  for (const asset of assets) {
    const monthlyDeprn = computeMonthlyDeprn(
      asset.acquisitionCost,
      asset.residualValue,
      asset.usefulLifeMonths,
      asset.depreciationMethod,
      asset.carryingValue,
    );

    const maxDeprn = asset.carryingValue.minus(asset.residualValue);
    if (maxDeprn.lessThanOrEqualTo(0)) {
      await prisma.fixedAsset.update({ where: { id: asset.id }, data: { status: 'FULLY_DEPRECIATED' } });
      continue;
    }

    const deprnAmount = monthlyDeprn.greaterThan(maxDeprn) ? maxDeprn : monthlyDeprn;
    if (deprnAmount.lessThanOrEqualTo(0)) continue;

    const deprnExpAccount = asset.deprnAccountId ?? defaultDeprnExp?.id;
    const accDeprnAccount = asset.accDeprnAccountId ?? defaultAccDeprn?.id;

    if (!deprnExpAccount || !accDeprnAccount) continue;

    const entryDate = asOfDate.toISOString().split('T')[0];

    await journalService.createAndPostSystemEntry(
      organisationId,
      {
        type: 'DEPRECIATION',
        description: `Depreciation – ${asset.name} – ${period.name}`,
        entryDate,
        periodId: input.periodId,
        currency,
        exchangeRate: 1,
        lines: [
          {
            accountId: deprnExpAccount,
            description: `Depreciation – ${asset.name}`,
            debitAmount: Number(deprnAmount),
            creditAmount: 0,
            currency,
            exchangeRate: 1,
          },
          {
            accountId: accDeprnAccount,
            description: `Accum. Depreciation – ${asset.name}`,
            debitAmount: 0,
            creditAmount: Number(deprnAmount),
            currency,
            exchangeRate: 1,
          },
        ],
      },
      userId,
    );

    const newCarrying = asset.carryingValue.minus(deprnAmount);
    const newStatus = newCarrying.lessThanOrEqualTo(asset.residualValue) ? 'FULLY_DEPRECIATED' as const : 'ACTIVE' as const;

    await prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        accumulatedDeprn: asset.accumulatedDeprn.plus(deprnAmount),
        carryingValue: newCarrying,
        lastDeprnDate: asOfDate,
        status: newStatus,
      },
    });

    results.push({ assetId: asset.id, assetCode: asset.code, amount: deprnAmount.toFixed(2) });
  }

  return { processed: results.length, entries: results };
}

// ─── Disposal ────────────────────────────────────────────────────────────────

export async function disposeAsset(
  organisationId: string, assetId: string, userId: string, input: DisposeAssetInput,
) {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: assetId, organisationId, isDeleted: false } });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'DISPOSED') throw new ValidationError('Asset already disposed');

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Period not found or closed');

  const proceeds = new Prisma.Decimal(input.disposalProceeds);
  const carryingValue = asset.carryingValue;
  const gainOrLoss = proceeds.minus(carryingValue);

  const assetAccountId = asset.assetAccountId ?? (await prisma.account.findFirst({
    where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false },
    select: { id: true },
  }))?.id;

  if (!assetAccountId) throw new ValidationError('No fixed asset account configured');

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'USD';
  const entryDate = input.disposalDate;

  const journalLines: Array<{ accountId: string; description: string; debitAmount: number; creditAmount: number; currency: string; exchangeRate: number }> = [];

  // DR Accumulated Depreciation
  if (asset.accumulatedDeprn.greaterThan(0)) {
    const accAcct = asset.accDeprnAccountId ?? assetAccountId;
    journalLines.push({
      accountId: accAcct,
      description: 'Remove accumulated depreciation',
      debitAmount: Number(asset.accumulatedDeprn),
      creditAmount: 0,
      currency,
      exchangeRate: 1,
    });
  }

  // CR Asset at cost
  journalLines.push({
    accountId: assetAccountId,
    description: `Remove asset at cost – ${asset.name}`,
    debitAmount: 0,
    creditAmount: Number(asset.acquisitionCost),
    currency,
    exchangeRate: 1,
  });

  // DR Bank (proceeds)
  if (proceeds.greaterThan(0) && input.bankAccountId) {
    journalLines.push({
      accountId: input.bankAccountId,
      description: 'Disposal proceeds',
      debitAmount: Number(proceeds),
      creditAmount: 0,
      currency,
      exchangeRate: 1,
    });
  }

  // Gain/Loss balancing entry
  if (!gainOrLoss.isZero()) {
    const glAccount = await prisma.account.findFirst({
      where: {
        organisationId,
        type: gainOrLoss.greaterThan(0) ? 'REVENUE_ACCOUNT' : 'EXPENSE_ACCOUNT',
        isActive: true, isDeleted: false,
      },
      select: { id: true },
    });
    if (glAccount) {
      journalLines.push({
        accountId: glAccount.id,
        description: gainOrLoss.greaterThan(0) ? 'Gain on asset disposal' : 'Loss on asset disposal',
        debitAmount: gainOrLoss.lessThan(0) ? Number(gainOrLoss.abs()) : 0,
        creditAmount: gainOrLoss.greaterThan(0) ? Number(gainOrLoss) : 0,
        currency,
        exchangeRate: 1,
      });
    }
  }

  await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'GENERAL',
      description: `Asset disposal – ${asset.name} (${asset.code})`,
      entryDate,
      periodId: input.periodId,
      currency,
      exchangeRate: 1,
      lines: journalLines,
    },
    userId,
  );

  await prisma.fixedAsset.update({
    where: { id: assetId },
    data: { status: 'DISPOSED', disposalDate: new Date(input.disposalDate), disposalProceeds: proceeds },
  });

  return {
    assetId,
    disposalDate: input.disposalDate,
    carryingValue: carryingValue.toFixed(2),
    proceeds: proceeds.toFixed(2),
    gainOrLoss: gainOrLoss.toFixed(2),
  };
}
