import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ListItemsParams {
  search?: string;
  category?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateItemInput {
  code: string;
  name: string;
  description?: string;
  category?: string;
  unit?: string;
  costMethod?: 'FIFO' | 'WEIGHTED_AVERAGE';
  unitCost?: number;
  reorderLevel?: number;
  inventoryAccountId?: string;
  cogsAccountId?: string;
}

export type UpdateItemInput = Partial<CreateItemInput>;

export interface ReceiveStockInput {
  itemId: string;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export interface IssueStockInput {
  itemId: string;
  quantity: number;
  notes?: string;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listItems(organisationId: string, params: ListItemsParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where: Prisma.InventoryItemWhereInput = {
    organisationId,
    isDeleted: false,
    ...(params.category && { category: params.category }),
    ...(params.isActive !== undefined && { isActive: params.isActive }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, items] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize };
}

// ─── Get single ───────────────────────────────────────────────────────────────

export async function getItem(organisationId: string, itemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');
  return item;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createItem(organisationId: string, input: CreateItemInput) {
  const existing = await prisma.inventoryItem.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (existing) throw new ConflictError(`Inventory item code '${input.code}' already exists`);

  return prisma.inventoryItem.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      unit: input.unit ?? 'unit',
      costMethod: input.costMethod ?? 'WEIGHTED_AVERAGE',
      unitCost: input.unitCost != null ? new Prisma.Decimal(input.unitCost) : new Prisma.Decimal(0),
      reorderLevel: input.reorderLevel != null ? new Prisma.Decimal(input.reorderLevel) : null,
      inventoryAccountId: input.inventoryAccountId ?? null,
      cogsAccountId: input.cogsAccountId ?? null,
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateItem(
  organisationId: string,
  itemId: string,
  input: UpdateItemInput,
) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  return prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.costMethod !== undefined && { costMethod: input.costMethod }),
      ...(input.unitCost !== undefined && { unitCost: new Prisma.Decimal(input.unitCost) }),
      ...(input.reorderLevel !== undefined && {
        reorderLevel: input.reorderLevel !== null ? new Prisma.Decimal(input.reorderLevel) : null,
      }),
      ...(input.inventoryAccountId !== undefined && {
        inventoryAccountId: input.inventoryAccountId,
      }),
      ...(input.cogsAccountId !== undefined && { cogsAccountId: input.cogsAccountId }),
    },
  });
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deleteItem(organisationId: string, itemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  return prisma.inventoryItem.update({
    where: { id: itemId },
    data: { isDeleted: true, isActive: false },
  });
}

// ─── Receive stock ────────────────────────────────────────────────────────────

export async function receiveStock(organisationId: string, input: ReceiveStockInput) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: input.itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  if (input.quantity <= 0) {
    throw new ValidationError('Quantity to receive must be greater than zero');
  }
  if (input.unitCost < 0) {
    throw new ValidationError('Unit cost cannot be negative');
  }

  const existingQty = Number(item.quantityOnHand);
  const existingCost = Number(item.unitCost);
  const newQty = input.quantity;
  const newCost = input.unitCost;

  const totalQty = existingQty + newQty;

  // Weighted average: (existing qty * existing cost + new qty * new cost) / total qty
  const newUnitCost =
    totalQty > 0
      ? (existingQty * existingCost + newQty * newCost) / totalQty
      : newCost;

  return prisma.inventoryItem.update({
    where: { id: input.itemId },
    data: {
      quantityOnHand: new Prisma.Decimal(totalQty),
      unitCost: new Prisma.Decimal(newUnitCost),
    },
  });
}

// ─── Issue stock ──────────────────────────────────────────────────────────────

export async function issueStock(organisationId: string, input: IssueStockInput) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: input.itemId, organisationId, isDeleted: false },
  });
  if (!item) throw new NotFoundError('Inventory item');

  if (input.quantity <= 0) {
    throw new ValidationError('Quantity to issue must be greater than zero');
  }

  const currentQty = Number(item.quantityOnHand);
  if (input.quantity > currentQty) {
    throw new ValidationError(
      `Insufficient stock. Available: ${currentQty}, requested: ${input.quantity}`,
    );
  }

  const remainingQty = currentQty - input.quantity;

  return prisma.inventoryItem.update({
    where: { id: input.itemId },
    data: {
      quantityOnHand: new Prisma.Decimal(remainingQty),
    },
  });
}

// ─── Valuation report ─────────────────────────────────────────────────────────

export async function getValuationReport(organisationId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { organisationId, isDeleted: false, isActive: true },
    orderBy: [{ code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      unit: true,
      costMethod: true,
      unitCost: true,
      quantityOnHand: true,
    },
  });

  return items.map((item) => {
    const unitCost = Number(item.unitCost);
    const qty = Number(item.quantityOnHand);
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      unit: item.unit,
      costMethod: item.costMethod,
      unitCost: item.unitCost,
      quantityOnHand: item.quantityOnHand,
      totalValue: new Prisma.Decimal(unitCost * qty),
    };
  });
}
