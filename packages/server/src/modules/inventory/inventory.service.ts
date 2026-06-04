import { Prisma, MovementType, MovementStatus, StocktakeStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import { auditLog } from '../audit-trail/audit.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const INBOUND_TYPES: MovementType[] = [
  MovementType.RECEIPT,
  MovementType.ADJUSTMENT_IN,
  MovementType.OPENING,
  MovementType.TRANSFER_IN,
  MovementType.STOCKTAKE_IN,
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListItemsParams {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  isLowStock?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateItemInput {
  code: string;
  name: string;
  description?: string;
  category?: string;
  categoryId?: string;
  unit?: string;
  costMethod?: 'FIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD';
  unitCost?: number;
  standardCost?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  inventoryAccountId?: string;
  cogsAccountId?: string;
  purchasePriceVarianceAccountId?: string;
}

export type UpdateItemInput = Partial<CreateItemInput>;

export interface CreateMovementInput {
  itemId: string;
  locationId?: string;
  movementType: MovementType;
  quantity: number;
  unitCost?: number;
  contraAccountId?: string;
  periodId?: string;
  reference?: string;
  description?: string;
  reasonCode?: string;
  transactionDate: string; // YYYY-MM-DD
}

export interface ListMovementsParams {
  itemId?: string;
  movementType?: MovementType;
  status?: MovementStatus;
  page?: number;
  pageSize?: number;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(organisationId: string) {
  return prisma.inventoryCategory.findMany({
    where: { organisationId, isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createCategory(
  organisationId: string,
  input: { name: string; description?: string },
) {
  const existing = await prisma.inventoryCategory.findFirst({
    where: { organisationId, name: input.name },
  });
  if (existing) throw new ConflictError(`Category '${input.name}' already exists`);

  return prisma.inventoryCategory.create({
    data: {
      organisationId,
      name: input.name,
      description: input.description ?? null,
    },
  });
}

export async function updateCategory(
  organisationId: string,
  categoryId: string,
  input: { name?: string; description?: string; isActive?: boolean },
) {
  const cat = await prisma.inventoryCategory.findFirst({
    where: { id: categoryId, organisationId },
  });
  if (!cat) throw new NotFoundError('Inventory category');

  return prisma.inventoryCategory.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

// ─── Locations ────────────────────────────────────────────────────────────────

export async function listLocations(organisationId: string) {
  return prisma.inventoryLocation.findMany({
    where: { organisationId, isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createLocation(
  organisationId: string,
  input: { name: string; description?: string },
) {
  const existing = await prisma.inventoryLocation.findFirst({
    where: { organisationId, name: input.name },
  });
  if (existing) throw new ConflictError(`Location '${input.name}' already exists`);

  return prisma.inventoryLocation.create({
    data: {
      organisationId,
      name: input.name,
      description: input.description ?? null,
    },
  });
}

export async function updateLocation(
  organisationId: string,
  locationId: string,
  input: { name?: string; description?: string; isActive?: boolean },
) {
  const loc = await prisma.inventoryLocation.findFirst({
    where: { id: locationId, organisationId },
  });
  if (!loc) throw new NotFoundError('Inventory location');

  return prisma.inventoryLocation.update({
    where: { id: locationId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function listItems(organisationId: string, params: ListItemsParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where: Prisma.InventoryItemWhereInput = {
    organisationId,
    isDeleted: false,
    ...(params.categoryId && { categoryId: params.categoryId }),
    ...(params.isActive !== undefined && { isActive: params.isActive }),
    ...(params.isLowStock && {
      reorderLevel: { not: null },
      // quantityOnHand <= reorderLevel — Prisma doesn't support column comparison directly,
      // so we do a raw filter below; here we just fetch all and filter in-memory if needed.
      // For now, rely on quantityOnHand < reorderLevel via a workaround.
    }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, rawItems] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        inventoryCategory: { select: { id: true, name: true } },
        stockBalances: {
          select: {
            id: true,
            locationId: true,
            quantityOnHand: true,
            averageCost: true,
            totalValue: true,
          },
        },
      },
    }),
  ]);

  // Apply in-memory low-stock filter when reorderLevel is set
  let items = rawItems;
  if (params.isLowStock) {
    items = rawItems.filter((item) => {
      if (item.reorderLevel === null) return false;
      return new Prisma.Decimal(item.quantityOnHand).lte(new Prisma.Decimal(item.reorderLevel));
    });
  }

  return { items, total, page, pageSize };
}

export async function getItem(organisationId: string, itemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
    include: {
      inventoryCategory: { select: { id: true, name: true } },
      stockBalances: {
        include: {
          location: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!item) throw new NotFoundError('Inventory item');
  return item;
}

export async function createItem(organisationId: string, input: CreateItemInput) {
  const existing = await prisma.inventoryItem.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (existing) throw new ConflictError(`Inventory item code '${input.code}' already exists`);

  if (input.categoryId) {
    const cat = await prisma.inventoryCategory.findFirst({
      where: { id: input.categoryId, organisationId },
    });
    if (!cat) throw new NotFoundError('Inventory category');
  }

  return prisma.inventoryItem.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      categoryId: input.categoryId ?? null,
      unit: input.unit ?? 'unit',
      costMethod: input.costMethod ?? 'WEIGHTED_AVERAGE',
      unitCost: input.unitCost != null ? new Prisma.Decimal(input.unitCost) : new Prisma.Decimal(0),
      standardCost:
        input.standardCost != null ? new Prisma.Decimal(input.standardCost) : null,
      reorderLevel:
        input.reorderLevel != null ? new Prisma.Decimal(input.reorderLevel) : null,
      reorderQuantity:
        input.reorderQuantity != null ? new Prisma.Decimal(input.reorderQuantity) : null,
      inventoryAccountId: input.inventoryAccountId ?? null,
      cogsAccountId: input.cogsAccountId ?? null,
      purchasePriceVarianceAccountId: input.purchasePriceVarianceAccountId ?? null,
    },
    include: {
      inventoryCategory: { select: { id: true, name: true } },
    },
  });
}

export async function updateItem(
  organisationId: string,
  itemId: string,
  input: UpdateItemInput,
) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  // Block costMethod change if movements exist
  if (input.costMethod !== undefined && input.costMethod !== item.costMethod) {
    const movementCount = await prisma.inventoryMovement.count({
      where: { itemId, organisationId },
    });
    if (movementCount > 0) {
      throw new ValidationError(
        'Cannot change cost method after movements have been recorded. Perform a stocktake adjustment instead.',
      );
    }
  }

  if (input.categoryId) {
    const cat = await prisma.inventoryCategory.findFirst({
      where: { id: input.categoryId, organisationId },
    });
    if (!cat) throw new NotFoundError('Inventory category');
  }

  return prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.costMethod !== undefined && { costMethod: input.costMethod }),
      ...(input.unitCost !== undefined && {
        unitCost: new Prisma.Decimal(input.unitCost),
      }),
      ...(input.standardCost !== undefined && {
        standardCost:
          input.standardCost !== null ? new Prisma.Decimal(input.standardCost) : null,
      }),
      ...(input.reorderLevel !== undefined && {
        reorderLevel:
          input.reorderLevel !== null ? new Prisma.Decimal(input.reorderLevel) : null,
      }),
      ...(input.reorderQuantity !== undefined && {
        reorderQuantity:
          input.reorderQuantity !== null
            ? new Prisma.Decimal(input.reorderQuantity)
            : null,
      }),
      ...(input.inventoryAccountId !== undefined && {
        inventoryAccountId: input.inventoryAccountId,
      }),
      ...(input.cogsAccountId !== undefined && { cogsAccountId: input.cogsAccountId }),
      ...(input.purchasePriceVarianceAccountId !== undefined && {
        purchasePriceVarianceAccountId: input.purchasePriceVarianceAccountId,
      }),
    },
    include: {
      inventoryCategory: { select: { id: true, name: true } },
    },
  });
}

export async function deleteItem(organisationId: string, itemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  if (new Prisma.Decimal(item.quantityOnHand).greaterThan(0)) {
    throw new ValidationError(
      `Cannot delete item '${item.code}' — stock on hand is ${item.quantityOnHand}. Write off stock before deleting.`,
    );
  }

  return prisma.inventoryItem.update({
    where: { id: itemId },
    data: { isDeleted: true, isActive: false },
  });
}

// ─── StockBalance helper ──────────────────────────────────────────────────────
// Prisma unique constraints on nullable columns behave unexpectedly:
// upsert with { itemId_locationId: { itemId, locationId: null } } causes issues
// because NULL != NULL in SQL. Use findFirst + create/update pattern instead.

async function upsertStockBalance(
  tx: Prisma.TransactionClient,
  organisationId: string,
  itemId: string,
  locationId: string | null,
  updater: (current: { quantityOnHand: Prisma.Decimal; averageCost: Prisma.Decimal; totalValue: Prisma.Decimal } | null) => {
    quantityOnHand: Prisma.Decimal;
    averageCost: Prisma.Decimal;
    totalValue: Prisma.Decimal;
  },
) {
  const existing = await tx.stockBalance.findFirst({
    where: {
      itemId,
      organisationId,
      locationId: locationId ?? null,
    },
  });

  const updated = updater(
    existing
      ? {
          quantityOnHand: new Prisma.Decimal(existing.quantityOnHand),
          averageCost: new Prisma.Decimal(existing.averageCost),
          totalValue: new Prisma.Decimal(existing.totalValue),
        }
      : null,
  );

  if (existing) {
    return tx.stockBalance.update({
      where: { id: existing.id },
      data: {
        quantityOnHand: updated.quantityOnHand,
        averageCost: updated.averageCost,
        totalValue: updated.totalValue,
      },
    });
  } else {
    return tx.stockBalance.create({
      data: {
        organisationId,
        itemId,
        locationId: locationId ?? null,
        quantityOnHand: updated.quantityOnHand,
        averageCost: updated.averageCost,
        totalValue: updated.totalValue,
      },
    });
  }
}

// ─── Item cache update ────────────────────────────────────────────────────────
// Aggregates all StockBalances for an item and writes back to InventoryItem.

async function updateItemCache(
  tx: Prisma.TransactionClient,
  itemId: string,
) {
  const balances = await tx.stockBalance.findMany({ where: { itemId } });

  let totalQty = new Prisma.Decimal(0);
  let totalValue = new Prisma.Decimal(0);

  for (const b of balances) {
    totalQty = totalQty.add(new Prisma.Decimal(b.quantityOnHand));
    totalValue = totalValue.add(new Prisma.Decimal(b.totalValue));
  }

  const newUnitCost =
    totalQty.greaterThan(0) ? totalValue.div(totalQty) : new Prisma.Decimal(0);

  await tx.inventoryItem.update({
    where: { id: itemId },
    data: {
      quantityOnHand: totalQty,
      unitCost: newUnitCost,
    },
  });
}

// ─── FIFO lot consumption ─────────────────────────────────────────────────────

async function consumeFIFOLots(
  tx: Prisma.TransactionClient,
  itemId: string,
  organisationId: string,
  locationId: string | null,
  qtyNeeded: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const lots = await tx.inventoryLot.findMany({
    where: {
      itemId,
      organisationId,
      locationId: locationId ?? null,
      isClosed: false,
      remainingQuantity: { gt: 0 },
    },
    orderBy: { receivedDate: 'asc' },
  });

  let remaining = qtyNeeded;
  let totalCost = new Prisma.Decimal(0);

  for (const lot of lots) {
    if (remaining.lte(0)) break;

    const lotQty = new Prisma.Decimal(lot.remainingQuantity);
    const lotCost = new Prisma.Decimal(lot.unitCost);
    const consumed = remaining.lte(lotQty) ? remaining : lotQty;

    totalCost = totalCost.add(consumed.mul(lotCost));
    remaining = remaining.sub(consumed);

    const newRemaining = lotQty.sub(consumed);
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        remainingQuantity: newRemaining,
        isClosed: newRemaining.lte(0),
      },
    });
  }

  if (remaining.greaterThan(0)) {
    throw new ValidationError(
      `Insufficient FIFO lots to fulfil issue of ${qtyNeeded.toFixed(4)}. Remaining shortfall: ${remaining.toFixed(4)}.`,
    );
  }

  return totalCost.div(qtyNeeded);
}

// ─── Core movement processor ──────────────────────────────────────────────────
// Two-phase approach:
//   Phase 1 — single Prisma interactive transaction: cost computation, lot
//             management, StockBalance update, item cache, movement status=POSTED.
//   Phase 2 — outside the transaction: GL journal via createAndPostSystemEntry
//             (which opens its own transaction). If GL posting fails we patch
//             the movement's journalEntryId in a lightweight follow-up write.
//
// This avoids nested-transaction issues in Prisma 5 interactive transactions.

async function processMovement(movementId: string, userId: string): Promise<void> {
  // Fetch movement with related data
  const movement = await prisma.inventoryMovement.findFirst({
    where: { id: movementId },
    include: { item: true },
  });
  if (!movement) throw new NotFoundError('Inventory movement');

  const item = movement.item;
  const locationId = movement.locationId ?? null;
  const qty = new Prisma.Decimal(movement.quantity);
  const isInbound = INBOUND_TYPES.includes(movement.movementType);

  if (qty.lte(0)) {
    throw new ValidationError('Movement quantity must be greater than zero');
  }

  // ── Phase 1: balance + lot updates (atomic) ────────────────────────────────

  // We capture effectiveUnitCost + totalCost from inside the tx so we can use
  // them for GL posting afterwards.
  let capturedEffectiveUnitCost = new Prisma.Decimal(0);
  let capturedTotalCost = new Prisma.Decimal(0);

  await prisma.$transaction(async (tx) => {
    let effectiveUnitCost: Prisma.Decimal;
    let newAverageCost: Prisma.Decimal | null = null;

    if (item.costMethod === 'WEIGHTED_AVERAGE') {
      if (isInbound) {
        const currentBalance = await tx.stockBalance.findFirst({
          where: { itemId: item.id, organisationId: item.organisationId, locationId },
        });

        const currentQty = currentBalance
          ? new Prisma.Decimal(currentBalance.quantityOnHand)
          : new Prisma.Decimal(0);
        const currentAvg = currentBalance
          ? new Prisma.Decimal(currentBalance.averageCost)
          : new Prisma.Decimal(0);
        const incomingCost = movement.unitCost != null
          ? new Prisma.Decimal(movement.unitCost)
          : new Prisma.Decimal(0);

        const totalQtyAfter = currentQty.add(qty);
        newAverageCost = totalQtyAfter.greaterThan(0)
          ? currentQty.mul(currentAvg).add(qty.mul(incomingCost)).div(totalQtyAfter)
          : incomingCost;
        effectiveUnitCost = incomingCost;
      } else {
        // Issue: use current AVCO
        const currentBalance = await tx.stockBalance.findFirst({
          where: { itemId: item.id, organisationId: item.organisationId, locationId },
        });
        effectiveUnitCost = currentBalance
          ? new Prisma.Decimal(currentBalance.averageCost)
          : new Prisma.Decimal(0);
      }
    } else if (item.costMethod === 'FIFO') {
      if (isInbound) {
        const incomingCost = movement.unitCost != null
          ? new Prisma.Decimal(movement.unitCost)
          : new Prisma.Decimal(0);
        effectiveUnitCost = incomingCost;

        await tx.inventoryLot.create({
          data: {
            organisationId: item.organisationId,
            itemId: item.id,
            locationId,
            receivedDate: movement.transactionDate,
            originalQuantity: qty,
            remainingQuantity: qty,
            unitCost: incomingCost,
            reference: movement.reference ?? null,
            movementId: movement.id,
            isClosed: false,
          },
        });
      } else {
        effectiveUnitCost = await consumeFIFOLots(
          tx,
          item.id,
          item.organisationId,
          locationId,
          qty,
        );
      }
    } else {
      // STANDARD cost
      effectiveUnitCost = item.standardCost != null
        ? new Prisma.Decimal(item.standardCost)
        : new Prisma.Decimal(0);
      // PPV noted but not posted as separate journal per spec
    }

    const totalCost = qty.mul(effectiveUnitCost);
    capturedEffectiveUnitCost = effectiveUnitCost;
    capturedTotalCost = totalCost;

    // ── Update StockBalance ──────────────────────────────────────────────

    if (isInbound) {
      await upsertStockBalance(
        tx,
        item.organisationId,
        item.id,
        locationId,
        (current) => {
          const currentQty = current?.quantityOnHand ?? new Prisma.Decimal(0);
          const newQty = currentQty.add(qty);
          const avgForBalance = newAverageCost !== null ? newAverageCost : effectiveUnitCost;
          // FIFO: totalValue accumulates at actual lot cost
          const newTotalValue =
            item.costMethod === 'FIFO'
              ? (current?.totalValue ?? new Prisma.Decimal(0)).add(totalCost)
              : newQty.mul(avgForBalance); // AVCO + STANDARD: qty × avg
          return { quantityOnHand: newQty, averageCost: avgForBalance, totalValue: newTotalValue };
        },
      );
    } else {
      const currentBalance = await tx.stockBalance.findFirst({
        where: { itemId: item.id, organisationId: item.organisationId, locationId },
      });
      const available = currentBalance
        ? new Prisma.Decimal(currentBalance.quantityOnHand)
        : new Prisma.Decimal(0);

      if (available.lt(qty)) {
        throw new ValidationError(
          `Insufficient stock for item '${item.code}'. Available: ${available.toFixed(4)}, requested: ${qty.toFixed(4)}.`,
        );
      }

      await upsertStockBalance(
        tx,
        item.organisationId,
        item.id,
        locationId,
        (current) => {
          const currentQty = current?.quantityOnHand ?? new Prisma.Decimal(0);
          const currentAvg = current?.averageCost ?? new Prisma.Decimal(0);
          const newQty = currentQty.sub(qty);
          const newTotalValue = newQty.greaterThan(0)
            ? newQty.mul(currentAvg)
            : new Prisma.Decimal(0);
          return { quantityOnHand: newQty, averageCost: currentAvg, totalValue: newTotalValue };
        },
      );
    }

    // ── Update item cache ────────────────────────────────────────────────
    await updateItemCache(tx, item.id);

    // ── Mark movement as POSTED (journalEntryId patched in Phase 2) ─────
    await tx.inventoryMovement.update({
      where: { id: movementId },
      data: { status: MovementStatus.POSTED },
    });
  });

  // ── Phase 2: GL journal (outside the Prisma interactive transaction) ───────

  const canPostGL =
    item.inventoryAccountId != null &&
    movement.periodId != null &&
    movement.contraAccountId != null;

  if (!canPostGL) return;

  const org = await prisma.organisation.findUnique({
    where: { id: item.organisationId },
    select: { baseCurrency: true },
  });
  const currency = org?.baseCurrency ?? 'USD';
  const transactionDateStr = movement.transactionDate.toISOString().slice(0, 10);

  type JL = { accountId: string; description: string; debitAmount: number; creditAmount: number; exchangeRate: number };
  let journalLines: JL[];
  let lineDescription: string;

  if (isInbound) {
    lineDescription = movement.description ?? `Inventory receipt: ${item.code} x${qty.toFixed(4)} @ ${capturedEffectiveUnitCost.toFixed(4)}`;

    // Standard Cost: post inventory at standard, contra at actual, PPV bridges the gap
    if (item.costMethod === 'STANDARD' && item.purchasePriceVarianceAccountId) {
      const actualUnitCost = movement.unitCost != null ? new Prisma.Decimal(movement.unitCost) : capturedEffectiveUnitCost;
      const stdTotal = capturedTotalCost; // standard × qty
      const actualTotal = qty.mul(actualUnitCost);
      const ppv = actualTotal.minus(stdTotal); // positive = paid more than standard

      journalLines = [
        { accountId: item.inventoryAccountId!, description: lineDescription, debitAmount: stdTotal.toNumber(), creditAmount: 0, exchangeRate: 1 },
        ...(ppv.isZero() ? [] : [{
          accountId: item.purchasePriceVarianceAccountId,
          description: `Purchase price variance: ${item.code} (${ppv.greaterThan(0) ? 'unfavourable' : 'favourable'})`,
          debitAmount: ppv.greaterThan(0) ? ppv.toNumber() : 0,
          creditAmount: ppv.lessThan(0) ? ppv.abs().toNumber() : 0,
          exchangeRate: 1,
        }]),
        { accountId: movement.contraAccountId!, description: lineDescription, debitAmount: 0, creditAmount: actualTotal.toNumber(), exchangeRate: 1 },
      ];
    } else {
      // AVCO, FIFO, or STANDARD without PPV account: post at effective cost
      const totalCostNum = capturedTotalCost.toNumber();
      journalLines = [
        { accountId: item.inventoryAccountId!, description: lineDescription, debitAmount: totalCostNum, creditAmount: 0, exchangeRate: 1 },
        { accountId: movement.contraAccountId!, description: lineDescription, debitAmount: 0, creditAmount: totalCostNum, exchangeRate: 1 },
      ];
    }
  } else if (movement.movementType === MovementType.ISSUE) {
    lineDescription = movement.description ?? `Inventory issue: ${item.code} x${qty.toFixed(4)} @ ${capturedEffectiveUnitCost.toFixed(4)}`;
    const totalCostNum = capturedTotalCost.toNumber();
    journalLines = [
      { accountId: item.cogsAccountId ?? movement.contraAccountId!, description: lineDescription, debitAmount: totalCostNum, creditAmount: 0, exchangeRate: 1 },
      { accountId: item.inventoryAccountId!, description: lineDescription, debitAmount: 0, creditAmount: totalCostNum, exchangeRate: 1 },
    ];
  } else {
    lineDescription = movement.description ?? `Inventory ${movement.movementType.toLowerCase().replace(/_/g, ' ')}: ${item.code} x${qty.toFixed(4)}`;
    const totalCostNum = capturedTotalCost.toNumber();
    journalLines = [
      { accountId: movement.contraAccountId!, description: lineDescription, debitAmount: totalCostNum, creditAmount: 0, exchangeRate: 1 },
      { accountId: item.inventoryAccountId!, description: lineDescription, debitAmount: 0, creditAmount: totalCostNum, exchangeRate: 1 },
    ];
  }

  const journalInput = {
    type: 'ADJUSTMENT' as const,
    reference: movement.reference ?? undefined,
    description: movement.description ?? `INV: ${movement.movementType} – ${item.code}`,
    entryDate: transactionDateStr,
    periodId: movement.periodId!,
    currency,
    exchangeRate: 1,
    lines: journalLines,
  };

  const postedEntry = await journalService.createAndPostSystemEntry(
    item.organisationId,
    journalInput,
    userId,
  );

  // Patch journalEntryId back onto the movement
  await prisma.inventoryMovement.update({
    where: { id: movementId },
    data: { journalEntryId: postedEntry.id },
  });
}

// ─── Movements ────────────────────────────────────────────────────────────────

export async function createMovement(
  organisationId: string,
  userId: string,
  input: CreateMovementInput,
) {
  // Validate
  if (input.quantity <= 0) {
    throw new ValidationError('Movement quantity must be greater than zero');
  }

  const isInbound = INBOUND_TYPES.includes(input.movementType);

  if (isInbound && input.unitCost !== undefined && input.unitCost < 0) {
    throw new ValidationError('Unit cost cannot be negative');
  }

  // Resolve item
  const item = await prisma.inventoryItem.findFirst({
    where: { id: input.itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  // Validate location if provided
  if (input.locationId) {
    const loc = await prisma.inventoryLocation.findFirst({
      where: { id: input.locationId, organisationId },
    });
    if (!loc) throw new NotFoundError('Inventory location');
  }

  // RECEIPT, OPENING, ISSUE, STOCKTAKE_IN/OUT → auto-post immediately after creation.
  // ADJUSTMENT_IN/OUT, TRANSFER_IN/OUT → start as PENDING, require explicit approval.
  const autoPost =
    input.movementType === MovementType.RECEIPT ||
    input.movementType === MovementType.OPENING ||
    input.movementType === MovementType.ISSUE ||
    input.movementType === MovementType.STOCKTAKE_IN ||
    input.movementType === MovementType.STOCKTAKE_OUT;

  const transactionDate = new Date(input.transactionDate + 'T00:00:00Z');

  const movement = await prisma.inventoryMovement.create({
    data: {
      organisationId,
      itemId: input.itemId,
      locationId: input.locationId ?? null,
      movementType: input.movementType,
      quantity: new Prisma.Decimal(input.quantity),
      unitCost:
        input.unitCost != null ? new Prisma.Decimal(input.unitCost) : new Prisma.Decimal(0),
      totalCost:
        input.unitCost != null
          ? new Prisma.Decimal(input.quantity).mul(new Prisma.Decimal(input.unitCost))
          : new Prisma.Decimal(0),
      contraAccountId: input.contraAccountId ?? null,
      reference: input.reference ?? null,
      description: input.description ?? null,
      reasonCode: input.reasonCode ?? null,
      status: MovementStatus.PENDING,
      periodId: input.periodId ?? null,
      transactionDate,
      requestedBy: userId,
    },
    include: {
      item: { select: { code: true, name: true } },
    },
  });

  // Auto-post for RECEIPT, OPENING, ISSUE, STOCKTAKE_IN, STOCKTAKE_OUT
  if (autoPost) {
    await processMovement(movement.id, userId);
    // Re-fetch to return the updated status
    const updated = await prisma.inventoryMovement.findFirst({
      where: { id: movement.id },
      include: { item: { select: { code: true, name: true } } },
    });
    return updated!;
  }

  return movement;
}

export async function listMovements(organisationId: string, params: ListMovementsParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where: Prisma.InventoryMovementWhereInput = {
    organisationId,
    ...(params.itemId && { itemId: params.itemId }),
    ...(params.movementType && { movementType: params.movementType }),
    ...(params.status && { status: params.status }),
  };

  const [total, movements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        item: { select: { code: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { movements, total, page, pageSize };
}

export async function approveMovement(
  organisationId: string,
  movementId: string,
  userId: string,
) {
  const movement = await prisma.inventoryMovement.findFirst({
    where: { id: movementId, organisationId },
  });
  if (!movement) throw new NotFoundError('Inventory movement');

  if (movement.status !== MovementStatus.PENDING) {
    throw new ValidationError(
      `Movement is ${movement.status} — only PENDING movements can be approved`,
    );
  }

  // Transition to APPROVED
  await prisma.inventoryMovement.update({
    where: { id: movementId },
    data: {
      status: MovementStatus.APPROVED,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });

  // Process (will transition to POSTED)
  await processMovement(movementId, userId);

  const posted = await prisma.inventoryMovement.findFirst({
    where: { id: movementId },
    include: { item: { select: { code: true, name: true } } },
  });
  auditLog({ organisationId, userId, action: 'MOVEMENT_APPROVED', module: 'INVENTORY', entityType: 'INVENTORY_MOVEMENT', entityId: movementId, entityRef: movement.reference ?? movementId, description: `Inventory movement approved and posted — ${movement.movementType} qty ${movement.quantity}` });
  return posted;
}

export async function rejectMovement(
  organisationId: string,
  movementId: string,
  userId: string,
) {
  const movement = await prisma.inventoryMovement.findFirst({
    where: { id: movementId, organisationId },
  });
  if (!movement) throw new NotFoundError('Inventory movement');

  if (movement.status !== MovementStatus.PENDING) {
    throw new ValidationError(
      `Movement is ${movement.status} — only PENDING movements can be rejected`,
    );
  }

  return prisma.inventoryMovement.update({
    where: { id: movementId },
    data: {
      status: MovementStatus.REJECTED,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });
}

// ─── Stocktake ────────────────────────────────────────────────────────────────

export async function createStocktakeSession(
  organisationId: string,
  userId: string,
  input: {
    name: string;
    locationId?: string;
    sessionDate: string;
    notes?: string;
  },
) {
  if (input.locationId) {
    const loc = await prisma.inventoryLocation.findFirst({
      where: { id: input.locationId, organisationId },
    });
    if (!loc) throw new NotFoundError('Inventory location');
  }

  const sessionDate = new Date(input.sessionDate + 'T00:00:00Z');

  // Snapshot EVERY active inventory item so the count sheet lists everything to
  // count — not only items that already have a stock-balance row. System qty
  // comes from the chosen location's balance when a location is selected,
  // otherwise the item's overall quantity on hand (0 if never stocked).
  const items = await prisma.inventoryItem.findMany({
    where: { organisationId, isDeleted: false, isActive: true },
    select: { id: true, unitCost: true, quantityOnHand: true },
    orderBy: { code: 'asc' },
  });

  const balanceByItem = new Map<string, { qty: Prisma.Decimal; cost: Prisma.Decimal }>();
  if (input.locationId) {
    const balances = await prisma.stockBalance.findMany({
      where: { organisationId, locationId: input.locationId },
    });
    for (const b of balances) {
      balanceByItem.set(b.itemId, { qty: new Prisma.Decimal(b.quantityOnHand), cost: new Prisma.Decimal(b.averageCost) });
    }
  }

  const session = await prisma.stocktakeSession.create({
    data: {
      organisationId,
      locationId: input.locationId ?? null,
      name: input.name,
      sessionDate,
      status: StocktakeStatus.OPEN,
      notes: input.notes ?? null,
      createdBy: userId,
      counts: {
        create: items.map((item) => {
          const bal = balanceByItem.get(item.id);
          const systemQty = input.locationId
            ? (bal?.qty ?? new Prisma.Decimal(0))
            : new Prisma.Decimal(item.quantityOnHand);
          const unitCost = bal?.cost ?? new Prisma.Decimal(item.unitCost);
          return {
            itemId: item.id,
            locationId: input.locationId ?? null,
            systemQuantity: systemQty,
            countedQuantity: null,
            varianceQuantity: null,
            unitCost,
            varianceValue: null,
          };
        }),
      },
    },
    include: {
      _count: { select: { counts: true } },
    },
  });

  return session;
}

export async function listStocktakeSessions(organisationId: string) {
  return prisma.stocktakeSession.findMany({
    where: { organisationId },
    orderBy: { sessionDate: 'desc' },
    include: {
      _count: { select: { counts: true } },
    },
  });
}

export async function getStocktakeSession(organisationId: string, sessionId: string) {
  const session = await prisma.stocktakeSession.findFirst({
    where: { id: sessionId, organisationId },
    include: {
      counts: {
        include: {
          item: { select: { id: true, code: true, name: true, unit: true } },
        },
        orderBy: { item: { code: 'asc' } },
      },
      _count: { select: { counts: true } },
    },
  });
  if (!session) throw new NotFoundError('Stocktake session');
  return session;
}

export async function updateStocktakeCount(
  organisationId: string,
  sessionId: string,
  itemId: string,
  countedQuantity: number,
  notes?: string,
) {
  const session = await prisma.stocktakeSession.findFirst({
    where: { id: sessionId, organisationId },
  });
  if (!session) throw new NotFoundError('Stocktake session');

  if (
    session.status === StocktakeStatus.POSTED ||
    session.status === StocktakeStatus.CANCELLED
  ) {
    throw new ValidationError(
      `Cannot update counts on a ${session.status} stocktake session`,
    );
  }

  const count = await prisma.stocktakeCount.findFirst({
    where: { sessionId, itemId },
  });
  if (!count) throw new NotFoundError('Stocktake count line');

  const counted = new Prisma.Decimal(countedQuantity);
  const system = new Prisma.Decimal(count.systemQuantity);
  const unitCost = new Prisma.Decimal(count.unitCost);
  const variance = counted.sub(system);
  const varianceValue = variance.mul(unitCost);

  const updated = await prisma.stocktakeCount.update({
    where: { id: count.id },
    data: {
      countedQuantity: counted,
      varianceQuantity: variance,
      varianceValue,
      ...(notes !== undefined && { notes }),
    },
  });

  // Advance session to COUNTING if still OPEN
  if (session.status === StocktakeStatus.OPEN) {
    await prisma.stocktakeSession.update({
      where: { id: sessionId },
      data: { status: StocktakeStatus.COUNTING },
    });
  }

  return updated;
}

export async function postStocktakeVariances(
  organisationId: string,
  sessionId: string,
  userId: string,
  periodId: string,
  contraAccountId: string,
) {
  const session = await prisma.stocktakeSession.findFirst({
    where: { id: sessionId, organisationId },
    include: { counts: true },
  });
  if (!session) throw new NotFoundError('Stocktake session');

  if (session.status === StocktakeStatus.POSTED) {
    throw new ConflictError('Stocktake session has already been posted');
  }
  if (session.status === StocktakeStatus.CANCELLED) {
    throw new ValidationError('Cannot post a cancelled stocktake session');
  }

  // Ensure all counts have been entered
  const uncounted = session.counts.filter((c) => c.countedQuantity === null);
  if (uncounted.length > 0) {
    throw new ValidationError(
      `${uncounted.length} item(s) have not been counted yet. Enter all counts before posting.`,
    );
  }

  // Post a movement for each non-zero variance
  const variantCounts = session.counts.filter(
    (c) => c.varianceQuantity !== null && !new Prisma.Decimal(c.varianceQuantity!).isZero(),
  );

  for (const count of variantCounts) {
    const variance = new Prisma.Decimal(count.varianceQuantity!);
    const movementType = variance.greaterThan(0)
      ? MovementType.STOCKTAKE_IN
      : MovementType.STOCKTAKE_OUT;
    const absQty = variance.abs();

    const transactionDateStr = session.sessionDate.toISOString().slice(0, 10);

    await createMovement(organisationId, userId, {
      itemId: count.itemId,
      locationId: count.locationId ?? undefined,
      movementType,
      quantity: absQty.toNumber(),
      unitCost: new Prisma.Decimal(count.unitCost).toNumber(),
      contraAccountId,
      periodId,
      reference: `STOCKTAKE-${session.name}`,
      description: `Stocktake variance: session '${session.name}'`,
      transactionDate: transactionDateStr,
    });
  }

  const postedSession = await prisma.stocktakeSession.update({
    where: { id: sessionId },
    data: {
      status: StocktakeStatus.POSTED,
      postedBy: userId,
      postedAt: new Date(),
    },
  });
  auditLog({ organisationId, userId, action: 'STOCKTAKE_POSTED', module: 'INVENTORY', entityType: 'STOCKTAKE_SESSION', entityId: sessionId, entityRef: postedSession.name, description: `Stocktake session '${postedSession.name}' variances posted to GL` });
  return postedSession;
}

export async function cancelStocktakeSession(
  organisationId: string,
  sessionId: string,
) {
  const session = await prisma.stocktakeSession.findFirst({
    where: { id: sessionId, organisationId },
  });
  if (!session) throw new NotFoundError('Stocktake session');

  if (session.status !== StocktakeStatus.OPEN && session.status !== StocktakeStatus.COUNTING) {
    throw new ValidationError(
      `Only OPEN or COUNTING sessions can be cancelled (current status: ${session.status})`,
    );
  }

  return prisma.stocktakeSession.update({
    where: { id: sessionId },
    data: { status: StocktakeStatus.CANCELLED },
  });
}

// ─── Retroactive GL posting ───────────────────────────────────────────────────

export async function repostMovementGL(
  organisationId: string,
  movementId: string,
  userId: string,
  input: { contraAccountId: string; periodId: string },
) {
  const movement = await prisma.inventoryMovement.findFirst({
    where: { id: movementId, organisationId },
    include: { item: true },
  });
  if (!movement) throw new NotFoundError('Inventory movement');
  if (movement.status !== MovementStatus.POSTED) {
    throw new ValidationError('Only POSTED movements can have their GL retroactively posted');
  }
  if (movement.journalEntryId) {
    throw new ValidationError('GL journal has already been posted for this movement');
  }

  const item = movement.item;
  if (!item.inventoryAccountId) {
    throw new ValidationError(
      'This item has no Inventory GL account configured. Edit the item in Setup to link one first.',
    );
  }

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  const currency = org?.baseCurrency ?? 'USD';

  const qty = new Prisma.Decimal(movement.quantity);
  const isInbound = INBOUND_TYPES.includes(movement.movementType);
  const unitCost = new Prisma.Decimal(movement.unitCost ?? 0);
  const totalCost = qty.mul(unitCost);

  let debitAccountId: string;
  let creditAccountId: string;
  const lineDescription =
    movement.description ??
    `Retroactive GL: ${movement.movementType} ${item.code} x${qty.toFixed(4)} @ ${unitCost.toFixed(4)}`;

  if (isInbound) {
    debitAccountId = item.inventoryAccountId;
    creditAccountId = input.contraAccountId;
  } else if (movement.movementType === MovementType.ISSUE) {
    debitAccountId = item.cogsAccountId ?? input.contraAccountId;
    creditAccountId = item.inventoryAccountId;
  } else {
    debitAccountId = input.contraAccountId;
    creditAccountId = item.inventoryAccountId;
  }

  const transactionDateStr = movement.transactionDate.toISOString().slice(0, 10);

  const je = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'ADJUSTMENT',
      reference: movement.reference ?? undefined,
      description: lineDescription,
      entryDate: transactionDateStr,
      periodId: input.periodId,
      currency,
      exchangeRate: 1,
      lines: [
        { accountId: debitAccountId, description: lineDescription, debitAmount: totalCost.toNumber(), creditAmount: 0, exchangeRate: 1 },
        { accountId: creditAccountId, description: lineDescription, debitAmount: 0, creditAmount: totalCost.toNumber(), exchangeRate: 1 },
      ],
    },
    userId,
  );

  await prisma.inventoryMovement.update({
    where: { id: movementId },
    data: { journalEntryId: je.id },
  });

  return { journalEntryId: je.id, journalNumber: je.journalNumber, amount: totalCost.toFixed(2) };
}

// ─── Valuation ────────────────────────────────────────────────────────────────

export async function getValuationReport(organisationId: string, asAt?: string) {
  // asAt is accepted for future extension (historical point-in-time valuation).
  // Current implementation reads live StockBalance data.
  void asAt; // reserved

  const balances = await prisma.stockBalance.findMany({
    where: { organisationId },
    include: {
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          categoryId: true,
          unit: true,
          costMethod: true,
          isDeleted: true,
        },
      },
    },
    orderBy: { item: { code: 'asc' } },
  });

  // Aggregate per item (sum across locations)
  const itemMap = new Map<
    string,
    {
      itemId: string;
      code: string;
      name: string;
      category: string | null;
      unit: string;
      costMethod: string;
      quantityOnHand: Prisma.Decimal;
      totalValue: Prisma.Decimal;
    }
  >();

  for (const b of balances) {
    if (b.item.isDeleted) continue;

    const existing = itemMap.get(b.itemId);
    if (existing) {
      existing.quantityOnHand = existing.quantityOnHand.add(
        new Prisma.Decimal(b.quantityOnHand),
      );
      existing.totalValue = existing.totalValue.add(new Prisma.Decimal(b.totalValue));
    } else {
      itemMap.set(b.itemId, {
        itemId: b.itemId,
        code: b.item.code,
        name: b.item.name,
        category: b.item.category,
        unit: b.item.unit,
        costMethod: b.item.costMethod,
        quantityOnHand: new Prisma.Decimal(b.quantityOnHand),
        totalValue: new Prisma.Decimal(b.totalValue),
      });
    }
  }

  const items = Array.from(itemMap.values()).map((row) => ({
    itemId: row.itemId,
    code: row.code,
    name: row.name,
    category: row.category,
    unit: row.unit,
    costMethod: row.costMethod,
    quantityOnHand: row.quantityOnHand,
    unitCost: row.quantityOnHand.greaterThan(0)
      ? row.totalValue.div(row.quantityOnHand)
      : new Prisma.Decimal(0),
    totalValue: row.totalValue,
  }));

  const grandTotal = items.reduce(
    (acc, item) => acc.add(item.totalValue),
    new Prisma.Decimal(0),
  );

  return { items, grandTotal };
}

// ─── NRV Write-down (IAS 2.9) ────────────────────────────────────────────────
// Reduces carrying value of inventory to net realisable value when NRV < cost.
// Journal: DR Write-down Expense / CR Inventory Control Account.

export async function writeDownToNRV(
  organisationId: string,
  itemId: string,
  userId: string,
  input: { nrvPerUnit: number; periodId: string; writeDownAccountId: string; locationId?: string; notes?: string },
) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');
  if (!item.inventoryAccountId) throw new ValidationError('Item has no Inventory GL account configured');

  const nrv = new Prisma.Decimal(input.nrvPerUnit);
  const currentCost = new Prisma.Decimal(item.unitCost);

  if (nrv.greaterThanOrEqualTo(currentCost)) {
    throw new ValidationError(
      `NRV per unit (${nrv.toFixed(4)}) must be less than current unit cost (${currentCost.toFixed(4)}) for a write-down to be required`,
    );
  }

  // Scope to a specific location or aggregate all
  const balanceWhere = {
    itemId,
    organisationId,
    ...(input.locationId ? { locationId: input.locationId } : {}),
  };
  const balances = await prisma.stockBalance.findMany({ where: balanceWhere });

  if (balances.length === 0 || balances.every((b) => new Prisma.Decimal(b.quantityOnHand).lte(0))) {
    throw new ValidationError('No stock on hand to write down');
  }

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId, status: 'OPEN' },
  });
  if (!period) throw new ValidationError('Period not found or closed');

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'USD';

  // Compute total write-down across all in-scope balances
  let totalWriteDown = new Prisma.Decimal(0);
  for (const bal of balances) {
    const qty = new Prisma.Decimal(bal.quantityOnHand);
    if (qty.lte(0)) continue;
    const balCost = new Prisma.Decimal(bal.averageCost);
    const writeDownPerUnit = balCost.minus(nrv);
    if (writeDownPerUnit.greaterThan(0)) {
      totalWriteDown = totalWriteDown.plus(qty.mul(writeDownPerUnit));
    }
  }

  if (totalWriteDown.lte(0)) throw new ValidationError('No write-down required — NRV exceeds or equals current cost in all locations');

  // Post GL: DR Write-down expense / CR Inventory
  const entryDate = new Date().toISOString().slice(0, 10);
  const je = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'ADJUSTMENT',
      description: input.notes ?? `NRV write-down – ${item.code} (IAS 2.9)`,
      entryDate,
      periodId: input.periodId,
      currency,
      exchangeRate: 1,
      lines: [
        { accountId: input.writeDownAccountId, description: `NRV write-down – ${item.name}`, debitAmount: totalWriteDown.toNumber(), creditAmount: 0, exchangeRate: 1 },
        { accountId: item.inventoryAccountId, description: `NRV write-down – ${item.name}`, debitAmount: 0, creditAmount: totalWriteDown.toNumber(), exchangeRate: 1 },
      ],
    },
    userId,
  );

  // Update StockBalance records to NRV unit cost
  await prisma.$transaction(
    balances
      .filter((b) => new Prisma.Decimal(b.quantityOnHand).gt(0))
      .map((bal) => {
        const qty = new Prisma.Decimal(bal.quantityOnHand);
        const newTotalValue = qty.mul(nrv);
        return prisma.stockBalance.update({
          where: { id: bal.id },
          data: { averageCost: nrv, totalValue: newTotalValue },
        });
      }),
  );

  // Refresh item cache
  await prisma.$transaction(async (tx) => {
    const allBalances = await tx.stockBalance.findMany({ where: { itemId, organisationId } });
    let totalQty = new Prisma.Decimal(0);
    let totalValue = new Prisma.Decimal(0);
    for (const b of allBalances) {
      totalQty = totalQty.add(new Prisma.Decimal(b.quantityOnHand));
      totalValue = totalValue.add(new Prisma.Decimal(b.totalValue));
    }
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        unitCost: totalQty.gt(0) ? totalValue.div(totalQty) : nrv,
      },
    });
  });

  const result = { itemId, itemCode: item.code, previousUnitCost: currentCost.toFixed(4), nrvPerUnit: nrv.toFixed(4), totalWriteDown: totalWriteDown.toFixed(2), journalEntryId: je.id };
  auditLog({ organisationId, userId, action: 'NRV_WRITEDOWN', module: 'INVENTORY', entityType: 'INVENTORY_ITEM', entityId: itemId, entityRef: item.code, description: `NRV write-down posted for ${item.name} — write-down ${totalWriteDown.toFixed(2)}`, before: { unitCost: currentCost.toFixed(4) }, after: { nrvPerUnit: nrv.toFixed(4), totalWriteDown: totalWriteDown.toFixed(2) } });
  return result;
}

export async function getStockBalance(organisationId: string, itemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
    select: {
      id: true,
      code: true,
      name: true,
      costMethod: true,
      quantityOnHand: true,
      unitCost: true,
    },
  });
  if (!item) throw new NotFoundError('Inventory item');

  const balances = await prisma.stockBalance.findMany({
    where: { itemId, organisationId },
    include: {
      location: { select: { id: true, name: true } },
    },
  });

  // For FIFO: also return open lots
  let lots: Awaited<ReturnType<typeof prisma.inventoryLot.findMany>> = [];
  if (item.costMethod === 'FIFO') {
    lots = await prisma.inventoryLot.findMany({
      where: { itemId, organisationId, isClosed: false },
      orderBy: { receivedDate: 'asc' },
    });
  }

  return { item, balances, lots };
}
