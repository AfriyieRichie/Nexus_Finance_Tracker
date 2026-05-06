import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import type {
  CreateAssetInput, UpdateAssetInput, ListAssetsQuery,
  RunDepreciationInput, ReverseDepreciationInput,
  DisposeAssetInput, RevalueAssetInput, ImpairAssetInput,
  CreateCategoryInput, UpdateCategoryInput, BulkCreateAssetsInput,
} from './assets.schemas';

// ─── Depreciation Formulas ───────────────────────────────────────────────────

function computeMonthlyDeprn(
  cost: Prisma.Decimal,
  residual: Prisma.Decimal,
  usefulLifeMonths: number,
  method: string,
  carryingValue: Prisma.Decimal,
  monthsElapsed: number,
  unitsThisPeriod?: number,
  unitsTotal?: number,
): Prisma.Decimal {
  const depreciableAmount = cost.minus(residual);

  switch (method) {
    case 'STRAIGHT_LINE':
      return depreciableAmount.dividedBy(usefulLifeMonths);

    case 'REDUCING_BALANCE': {
      // Double-declining balance rate
      const rate = new Prisma.Decimal(2).dividedBy(usefulLifeMonths);
      return carryingValue.times(rate);
    }

    case 'SUM_OF_YEARS_DIGITS': {
      // SYD = n*(n+1)/2; monthly fraction = remainingMonths / SYD
      const n = usefulLifeMonths;
      const syd = (n * (n + 1)) / 2;
      const remainingMonths = Math.max(0, n - monthsElapsed);
      if (remainingMonths <= 0) return new Prisma.Decimal(0);
      return depreciableAmount.times(remainingMonths).dividedBy(syd);
    }

    case 'UNITS_OF_PRODUCTION': {
      if (!unitsThisPeriod || !unitsTotal || unitsTotal <= 0) return new Prisma.Decimal(0);
      return depreciableAmount.times(unitsThisPeriod).dividedBy(unitsTotal);
    }

    default:
      return depreciableAmount.dividedBy(usefulLifeMonths);
  }
}

// ─── Bulk Import ─────────────────────────────────────────────────────────────

export async function bulkCreateAssets(organisationId: string, input: BulkCreateAssetsInput) {
  const codes = input.assets.map((a) => a.code);

  const existing = await prisma.fixedAsset.findMany({
    where: { organisationId, code: { in: codes }, isDeleted: false },
    select: { code: true },
  });
  if (existing.length > 0) {
    throw new ConflictError(`Duplicate asset codes already exist: ${existing.map((e) => e.code).join(', ')}`);
  }

  const created = await prisma.$transaction(
    input.assets.map((asset) => {
      const method = asset.depreciationMethod === 'DECLINING_BALANCE' ? 'REDUCING_BALANCE' : asset.depreciationMethod;
      const cost = new Prisma.Decimal(asset.acquisitionCost);
      return prisma.fixedAsset.create({
        data: {
          organisationId,
          code: asset.code,
          name: asset.name,
          description: asset.description,
          category: asset.category,
          categoryId: asset.categoryId,
          serialNumber: asset.serialNumber,
          location: asset.location,
          acquisitionDate: new Date(asset.acquisitionDate),
          acquisitionCost: cost,
          residualValue: new Prisma.Decimal(asset.residualValue),
          usefulLifeMonths: asset.usefulLifeMonths,
          depreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'SUM_OF_YEARS_DIGITS',
          unitsOfProductionTotal: asset.unitsOfProductionTotal,
          carryingValue: cost,
        },
      });
    }),
  );

  return { created: created.length, codes: created.map((c) => c.code) };
}

// ─── Asset Categories ────────────────────────────────────────────────────────

export async function listCategories(organisationId: string) {
  return prisma.assetCategory.findMany({
    where: { organisationId, isDeleted: false },
    orderBy: { code: 'asc' },
  });
}

export async function createCategory(organisationId: string, input: CreateCategoryInput) {
  const exists = await prisma.assetCategory.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (exists) throw new ConflictError(`Category code '${input.code}' already exists`);

  const method = input.defaultDepreciationMethod === 'DECLINING_BALANCE'
    ? 'REDUCING_BALANCE'
    : input.defaultDepreciationMethod;

  return prisma.assetCategory.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description,
      defaultDepreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'SUM_OF_YEARS_DIGITS',
      defaultUsefulLifeMonths: input.defaultUsefulLifeMonths,
      capitalisationThreshold: input.capitalisationThreshold != null
        ? new Prisma.Decimal(input.capitalisationThreshold)
        : undefined,
    },
  });
}

export async function updateCategory(organisationId: string, categoryId: string, input: UpdateCategoryInput) {
  const cat = await prisma.assetCategory.findFirst({
    where: { id: categoryId, organisationId, isDeleted: false },
  });
  if (!cat) throw new NotFoundError('Category not found');

  const method = input.defaultDepreciationMethod === 'DECLINING_BALANCE'
    ? 'REDUCING_BALANCE'
    : input.defaultDepreciationMethod;

  return prisma.assetCategory.update({
    where: { id: categoryId },
    data: {
      name: input.name,
      description: input.description,
      defaultDepreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'SUM_OF_YEARS_DIGITS' | undefined,
      defaultUsefulLifeMonths: input.defaultUsefulLifeMonths,
      capitalisationThreshold: input.capitalisationThreshold != null
        ? new Prisma.Decimal(input.capitalisationThreshold)
        : undefined,
    },
  });
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createAsset(organisationId: string, input: CreateAssetInput) {
  const exists = await prisma.fixedAsset.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (exists) throw new ConflictError(`Asset code '${input.code}' already exists`);

  const method = input.depreciationMethod === 'DECLINING_BALANCE'
    ? 'REDUCING_BALANCE'
    : input.depreciationMethod;

  const cost = new Prisma.Decimal(input.acquisitionCost);

  return prisma.fixedAsset.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description,
      category: input.category,
      categoryId: input.categoryId,
      serialNumber: input.serialNumber,
      location: input.location,
      acquisitionDate: new Date(input.acquisitionDate),
      acquisitionCost: cost,
      residualValue: new Prisma.Decimal(input.residualValue),
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'SUM_OF_YEARS_DIGITS',
      unitsOfProductionTotal: input.unitsOfProductionTotal,
      carryingValue: cost,
      assetAccountId: input.assetAccountId,
      deprnAccountId: input.deprnAccountId,
      accDeprnAccountId: input.accDeprnAccountId,
    },
    include: { assetCategory: true },
  });
}

export async function updateAsset(organisationId: string, assetId: string, input: UpdateAssetInput) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, organisationId, isDeleted: false },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'DISPOSED') throw new ValidationError('Cannot update a disposed asset');

  const method = input.depreciationMethod === 'DECLINING_BALANCE'
    ? 'REDUCING_BALANCE'
    : input.depreciationMethod;

  return prisma.fixedAsset.update({
    where: { id: assetId },
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      categoryId: input.categoryId,
      serialNumber: input.serialNumber,
      location: input.location,
      residualValue: input.residualValue != null ? new Prisma.Decimal(input.residualValue) : undefined,
      usefulLifeMonths: input.usefulLifeMonths,
      depreciationMethod: method as 'STRAIGHT_LINE' | 'REDUCING_BALANCE' | 'UNITS_OF_PRODUCTION' | 'SUM_OF_YEARS_DIGITS' | undefined,
      unitsOfProductionTotal: input.unitsOfProductionTotal,
      assetAccountId: input.assetAccountId,
      deprnAccountId: input.deprnAccountId,
      accDeprnAccountId: input.accDeprnAccountId,
    },
    include: { assetCategory: true, revaluations: { orderBy: { revaluationDate: 'desc' } }, impairments: { orderBy: { impairmentDate: 'desc' } } },
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
      include: { assetCategory: true },
      orderBy: { code: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { assets, total, page: query.page, pageSize: query.pageSize };
}

export async function getAsset(organisationId: string, assetId: string) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, organisationId, isDeleted: false },
    include: {
      assetCategory: true,
      revaluations: { orderBy: { revaluationDate: 'desc' } },
      impairments: { orderBy: { impairmentDate: 'desc' } },
      deprnRunEntries: {
        include: { run: true },
        orderBy: { run: { asOfDate: 'desc' } },
        take: 24,
      },
    },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}

// ─── Depreciation Run ────────────────────────────────────────────────────────

export async function runDepreciation(
  organisationId: string,
  userId: string,
  input: RunDepreciationInput,
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
      OR: [{ lastDeprnDate: null }, { lastDeprnDate: { lt: asOfDate } }],
    },
  });

  if (assets.length === 0) {
    return { preview: input.preview, processed: 0, totalAmount: '0.00', entries: [], message: 'No assets require depreciation for this period' };
  }

  const defaultDeprnExp = await prisma.account.findFirst({
    where: { organisationId, type: 'EXPENSE_ACCOUNT', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  });
  const defaultAccDeprn = await prisma.account.findFirst({
    where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  });

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  const currency = org?.baseCurrency ?? 'USD';
  const entryDate = asOfDate.toISOString().split('T')[0];

  const unitsMap = new Map((input.assetUnitsOverrides ?? []).map((o) => [o.assetId, o.units]));

  type PreviewEntry = { assetId: string; assetCode: string; assetName: string; amount: string };
  const entries: PreviewEntry[] = [];
  let runTotal = new Prisma.Decimal(0);

  for (const asset of assets) {
    const maxDeprn = asset.carryingValue.minus(asset.residualValue);
    if (maxDeprn.lessThanOrEqualTo(0)) {
      if (!input.preview) {
        await prisma.fixedAsset.update({ where: { id: asset.id }, data: { status: 'FULLY_DEPRECIATED' } });
      }
      continue;
    }

    const deprnAmount = (() => {
      const raw = computeMonthlyDeprn(
        asset.acquisitionCost,
        asset.residualValue,
        asset.usefulLifeMonths,
        asset.depreciationMethod,
        asset.carryingValue,
        asset.depreciationMonthsElapsed,
        unitsMap.get(asset.id),
        asset.unitsOfProductionTotal ?? undefined,
      );
      // Skip UNITS_OF_PRODUCTION assets with no units provided
      if (asset.depreciationMethod === 'UNITS_OF_PRODUCTION' && !unitsMap.has(asset.id)) return null;
      return raw.greaterThan(maxDeprn) ? maxDeprn : raw;
    })();

    if (deprnAmount === null || deprnAmount.lessThanOrEqualTo(0)) continue;

    const deprnExpAccount = asset.deprnAccountId ?? defaultDeprnExp?.id;
    const accDeprnAccount = asset.accDeprnAccountId ?? defaultAccDeprn?.id;
    if (!deprnExpAccount || !accDeprnAccount) continue;

    entries.push({ assetId: asset.id, assetCode: asset.code, assetName: asset.name, amount: deprnAmount.toFixed(2) });
    runTotal = runTotal.plus(deprnAmount);

    if (!input.preview) {
      const je = await journalService.createAndPostSystemEntry(
        organisationId,
        {
          type: 'DEPRECIATION',
          description: `Depreciation – ${asset.name} – ${period.name}`,
          entryDate,
          periodId: input.periodId,
          currency,
          exchangeRate: 1,
          lines: [
            { accountId: deprnExpAccount, description: `Depreciation – ${asset.name}`, debitAmount: Number(deprnAmount), creditAmount: 0, currency, exchangeRate: 1 },
            { accountId: accDeprnAccount, description: `Accum. Depreciation – ${asset.name}`, debitAmount: 0, creditAmount: Number(deprnAmount), currency, exchangeRate: 1 },
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
          depreciationMonthsElapsed: { increment: 1 },
          status: newStatus,
        },
      });

      // Track run entry for reversal support
      (entries[entries.length - 1] as PreviewEntry & { journalEntryId?: string }).journalEntryId = je.id;
    }
  }

  if (!input.preview && entries.length > 0) {
    const run = await prisma.depreciationRun.create({
      data: {
        organisationId,
        periodId: input.periodId,
        asOfDate,
        processedCount: entries.length,
        totalAmount: runTotal,
        createdBy: userId,
        entries: {
          create: entries.map((e) => ({
            assetId: e.assetId,
            amount: new Prisma.Decimal(e.amount),
            journalEntryId: (e as PreviewEntry & { journalEntryId?: string }).journalEntryId ?? '',
          })),
        },
      },
    });
    return { preview: false, processed: entries.length, totalAmount: runTotal.toFixed(2), runId: run.id, entries };
  }

  return { preview: input.preview, processed: entries.length, totalAmount: runTotal.toFixed(2), entries };
}

export async function reverseDepreciation(
  organisationId: string,
  userId: string,
  input: ReverseDepreciationInput,
) {
  const run = await prisma.depreciationRun.findFirst({
    where: { id: input.runId, organisationId },
    include: {
      entries: {
        include: { asset: true },
      },
    },
  });
  if (!run) throw new NotFoundError('Depreciation run not found');
  if (run.status === 'REVERSED') throw new ValidationError('This depreciation run has already been reversed');

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Reversal period not found or not open');

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'USD';
  const entryDate = new Date().toISOString().split('T')[0];

  for (const entry of run.entries) {
    const asset = entry.asset;

    // Create reversal journal (swap debit/credit)
    const defaultDeprnExp = await prisma.account.findFirst({
      where: { organisationId, type: 'EXPENSE_ACCOUNT', isActive: true, isDeleted: false, isControlAccount: false },
      orderBy: { code: 'asc' },
      select: { id: true },
    });
    const defaultAccDeprn = await prisma.account.findFirst({
      where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false, isControlAccount: false },
      orderBy: { code: 'asc' },
      select: { id: true },
    });
    const deprnExpAccount = asset.deprnAccountId ?? defaultDeprnExp?.id;
    const accDeprnAccount = asset.accDeprnAccountId ?? defaultAccDeprn?.id;
    if (!deprnExpAccount || !accDeprnAccount) continue;

    await journalService.createAndPostSystemEntry(
      organisationId,
      {
        type: 'REVERSAL',
        description: `Depreciation reversal – ${asset.name} – ${input.reason}`,
        entryDate,
        periodId: input.periodId,
        currency,
        exchangeRate: 1,
        lines: [
          { accountId: accDeprnAccount, description: `Reverse accum. depreciation – ${asset.name}`, debitAmount: Number(entry.amount), creditAmount: 0, currency, exchangeRate: 1 },
          { accountId: deprnExpAccount, description: `Reverse depreciation expense – ${asset.name}`, debitAmount: 0, creditAmount: Number(entry.amount), currency, exchangeRate: 1 },
        ],
      },
      userId,
    );

    // Restore asset balances
    const restoredCarrying = asset.carryingValue.plus(entry.amount);
    await prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        accumulatedDeprn: { decrement: entry.amount },
        carryingValue: restoredCarrying,
        status: 'ACTIVE',
        depreciationMonthsElapsed: { decrement: 1 },
        lastDeprnDate: null,
      },
    });
  }

  await prisma.depreciationRun.update({
    where: { id: run.id },
    data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: userId },
  });

  return { runId: run.id, reversedEntries: run.entries.length };
}

export async function listDepreciationRuns(organisationId: string) {
  return prisma.depreciationRun.findMany({
    where: { organisationId },
    orderBy: { asOfDate: 'desc' },
    take: 24,
  });
}

// ─── Disposal ────────────────────────────────────────────────────────────────

export async function disposeAsset(
  organisationId: string,
  assetId: string,
  userId: string,
  input: DisposeAssetInput,
) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, organisationId, isDeleted: false },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'DISPOSED') throw new ValidationError('Asset already disposed');

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Period not found or closed');

  const proceeds = new Prisma.Decimal(input.disposalProceeds);
  const gainOrLoss = proceeds.minus(asset.carryingValue);

  const assetAccountId = asset.assetAccountId ?? (await prisma.account.findFirst({
    where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  }))?.id;
  if (!assetAccountId) throw new ValidationError('No fixed asset account configured');

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'USD';

  type JL = { accountId: string; description: string; debitAmount: number; creditAmount: number; currency: string; exchangeRate: number };
  const journalLines: JL[] = [];

  if (asset.accumulatedDeprn.greaterThan(0)) {
    const accAcct = asset.accDeprnAccountId ?? assetAccountId;
    journalLines.push({ accountId: accAcct, description: 'Remove accumulated depreciation', debitAmount: Number(asset.accumulatedDeprn), creditAmount: 0, currency, exchangeRate: 1 });
  }

  journalLines.push({ accountId: assetAccountId, description: `Remove asset at cost – ${asset.name}`, debitAmount: 0, creditAmount: Number(asset.acquisitionCost), currency, exchangeRate: 1 });

  if (proceeds.greaterThan(0) && input.bankAccountId) {
    journalLines.push({ accountId: input.bankAccountId, description: 'Disposal proceeds', debitAmount: Number(proceeds), creditAmount: 0, currency, exchangeRate: 1 });
  }

  if (!gainOrLoss.isZero()) {
    const glAccount = await prisma.account.findFirst({
      where: { organisationId, type: gainOrLoss.greaterThan(0) ? 'REVENUE_ACCOUNT' : 'EXPENSE_ACCOUNT', isActive: true, isDeleted: false, isControlAccount: false },
      orderBy: { code: 'asc' },
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
    { type: 'GENERAL', description: `Asset disposal – ${asset.name} (${asset.code})`, entryDate: input.disposalDate, periodId: input.periodId, currency, exchangeRate: 1, lines: journalLines },
    userId,
  );

  await prisma.fixedAsset.update({
    where: { id: assetId },
    data: { status: 'DISPOSED', disposalDate: new Date(input.disposalDate), disposalProceeds: proceeds },
  });

  return {
    assetId,
    disposalDate: input.disposalDate,
    carryingValue: asset.carryingValue.toFixed(2),
    proceeds: proceeds.toFixed(2),
    gainOrLoss: gainOrLoss.toFixed(2),
  };
}

// ─── Revaluation (IAS 16) ────────────────────────────────────────────────────

export async function revalueAsset(
  organisationId: string,
  assetId: string,
  userId: string,
  input: RevalueAssetInput,
) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, organisationId, isDeleted: false },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'DISPOSED') throw new ValidationError('Cannot revalue a disposed asset');

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Period not found or closed');

  const fairValue = new Prisma.Decimal(input.fairValue);
  const surplusDeficit = fairValue.minus(asset.carryingValue);
  if (surplusDeficit.isZero()) throw new ValidationError('Fair value equals current carrying value — no revaluation required');

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'USD';
  const entryDate = input.revaluationDate;

  const assetAccountId = asset.assetAccountId ?? (await prisma.account.findFirst({
    where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  }))?.id;
  if (!assetAccountId) throw new ValidationError('No fixed asset account configured');

  // Find revaluation reserve (equity) or P&L account for deficit
  const reserveAccountId = input.reserveAccountId ?? (await prisma.account.findFirst({
    where: { organisationId, class: 'EQUITY', isActive: true, isDeleted: false, isControlAccount: false, name: { contains: 'revaluation', mode: 'insensitive' } },
    select: { id: true },
  }))?.id ?? (await prisma.account.findFirst({
    where: { organisationId, class: 'EQUITY', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  }))?.id;

  if (!reserveAccountId) throw new ValidationError('No equity/revaluation reserve account found');

  const isSurplus = surplusDeficit.greaterThan(0);
  const absAmount = surplusDeficit.abs();

  const je = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'ADJUSTMENT',
      description: `Asset revaluation – ${asset.name} (${isSurplus ? 'surplus' : 'deficit'})`,
      entryDate,
      periodId: input.periodId,
      currency,
      exchangeRate: 1,
      lines: isSurplus
        ? [
            { accountId: assetAccountId, description: `Revaluation surplus – ${asset.name}`, debitAmount: Number(absAmount), creditAmount: 0, currency, exchangeRate: 1 },
            { accountId: reserveAccountId, description: `Revaluation reserve – ${asset.name}`, debitAmount: 0, creditAmount: Number(absAmount), currency, exchangeRate: 1 },
          ]
        : [
            { accountId: reserveAccountId, description: `Revaluation deficit – ${asset.name}`, debitAmount: Number(absAmount), creditAmount: 0, currency, exchangeRate: 1 },
            { accountId: assetAccountId, description: `Revaluation write-down – ${asset.name}`, debitAmount: 0, creditAmount: Number(absAmount), currency, exchangeRate: 1 },
          ],
    },
    userId,
  );

  // On revaluation, reset accumulated depreciation (gross-up method — set cost = fair value, accum deprn = 0)
  await prisma.fixedAsset.update({
    where: { id: assetId },
    data: {
      acquisitionCost: fairValue,
      accumulatedDeprn: new Prisma.Decimal(0),
      impairmentLoss: new Prisma.Decimal(0),
      carryingValue: fairValue,
      depreciationMonthsElapsed: 0,
    },
  });

  const revaluation = await prisma.assetRevaluation.create({
    data: {
      organisationId,
      assetId,
      revaluationDate: new Date(input.revaluationDate),
      fairValue,
      previousCarryingValue: asset.carryingValue,
      surplusDeficit,
      journalEntryId: je.id,
      notes: input.notes,
      createdBy: userId,
    },
  });

  return { revaluation, surplusDeficit: surplusDeficit.toFixed(2), journalEntryId: je.id };
}

// ─── Impairment (IAS 36) ─────────────────────────────────────────────────────

export async function impairAsset(
  organisationId: string,
  assetId: string,
  userId: string,
  input: ImpairAssetInput,
) {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, organisationId, isDeleted: false },
  });
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'DISPOSED') throw new ValidationError('Cannot impair a disposed asset');

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Period not found or closed');

  const impairmentAmount = new Prisma.Decimal(input.impairmentAmount);
  if (impairmentAmount.greaterThan(asset.carryingValue)) {
    throw new ValidationError(`Impairment amount (${impairmentAmount.toFixed(2)}) cannot exceed carrying value (${asset.carryingValue.toFixed(2)})`);
  }

  const newCarryingValue = asset.carryingValue.minus(impairmentAmount);

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'USD';

  const impairmentAccountId = input.impairmentAccountId ?? (await prisma.account.findFirst({
    where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, isControlAccount: false, name: { contains: 'impairment', mode: 'insensitive' } },
    select: { id: true },
  }))?.id ?? (await prisma.account.findFirst({
    where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  }))?.id;

  const assetAccountId = asset.assetAccountId ?? (await prisma.account.findFirst({
    where: { organisationId, type: 'FIXED_ASSET', isActive: true, isDeleted: false, isControlAccount: false },
    orderBy: { code: 'asc' },
    select: { id: true },
  }))?.id;

  if (!impairmentAccountId || !assetAccountId) throw new ValidationError('No impairment loss or fixed asset account found');

  const je = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'ADJUSTMENT',
      description: `Asset impairment – ${asset.name} (IAS 36)`,
      entryDate: input.impairmentDate,
      periodId: input.periodId,
      currency,
      exchangeRate: 1,
      lines: [
        { accountId: impairmentAccountId, description: `Impairment loss – ${asset.name}`, debitAmount: Number(impairmentAmount), creditAmount: 0, currency, exchangeRate: 1 },
        { accountId: assetAccountId, description: `Impairment write-down – ${asset.name}`, debitAmount: 0, creditAmount: Number(impairmentAmount), currency, exchangeRate: 1 },
      ],
    },
    userId,
  );

  await prisma.fixedAsset.update({
    where: { id: assetId },
    data: {
      carryingValue: newCarryingValue,
      impairmentLoss: asset.impairmentLoss.plus(impairmentAmount),
      status: newCarryingValue.lessThanOrEqualTo(0) ? 'FULLY_DEPRECIATED' : 'ACTIVE',
    },
  });

  const impairment = await prisma.assetImpairment.create({
    data: {
      organisationId,
      assetId,
      impairmentDate: new Date(input.impairmentDate),
      impairmentAmount,
      previousCarryingValue: asset.carryingValue,
      newCarryingValue,
      journalEntryId: je.id,
      notes: input.notes,
      createdBy: userId,
    },
  });

  return { impairment, newCarryingValue: newCarryingValue.toFixed(2), journalEntryId: je.id };
}
