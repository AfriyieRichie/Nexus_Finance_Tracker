import { Prisma, ApprovalEntityType, ApprovalRequestStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { auditLog } from '../audit-trail/audit.service';
import * as apService from '../accounts-payable/ap.service';
import type { CreatePoInput, UpdatePoInput, ListPoQuery, ConvertToBillInput } from './po.schemas';

const D = (n: number | string) => new Prisma.Decimal(n);

async function nextPoNumber(organisationId: string): Promise<string> {
  const last = await prisma.purchaseOrder.findFirst({
    where: { organisationId }, orderBy: { createdAt: 'desc' }, select: { poNumber: true },
  });
  const year = new Date().getFullYear();
  const seq = last ? parseInt(last.poNumber.split('-').pop() ?? '0', 10) + 1 : 1;
  return `PO-${year}-${String(seq).padStart(6, '0')}`;
}

function computeTotals(lines: { quantity: number; unitPrice: number; taxAmount: number }[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxAmount = lines.reduce((s, l) => s + l.taxAmount, 0);
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

export async function listPurchaseOrders(organisationId: string, q: ListPoQuery) {
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      organisationId,
      ...(q.status ? { status: q.status as Prisma.EnumPurchaseOrderStatusFilter['equals'] } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    },
    include: { supplier: { select: { name: true, code: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders;
}

export async function getPurchaseOrder(organisationId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, organisationId },
    include: {
      supplier: true,
      lines: { orderBy: { lineNumber: 'asc' } },
      invoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true, invoiceDate: true } },
    },
  });
  if (!po) throw new NotFoundError('Purchase order not found');
  return po;
}

export async function createPurchaseOrder(organisationId: string, userId: string, input: CreatePoInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, organisationId, isDeleted: false, isActive: true } });
  if (!supplier) throw new NotFoundError('Supplier not found or inactive');

  const totals = computeTotals(input.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, taxAmount: l.taxAmount })));
  const poNumber = await nextPoNumber(organisationId);

  const po = await prisma.purchaseOrder.create({
    data: {
      organisationId, poNumber, supplierId: input.supplierId,
      orderDate: new Date(input.orderDate),
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
      currency: input.currency, notes: input.notes,
      subtotal: D(totals.subtotal), taxAmount: D(totals.taxAmount), totalAmount: D(totals.totalAmount),
      createdBy: userId,
      lines: {
        create: input.lines.map((l, i) => ({
          lineNumber: i + 1, description: l.description,
          quantity: D(l.quantity), unitPrice: D(l.unitPrice),
          accountId: l.accountId, taxCode: l.taxCode, taxAmount: D(l.taxAmount),
          lineTotal: D(l.quantity * l.unitPrice + l.taxAmount),
        })),
      },
    },
    include: { supplier: true, lines: { orderBy: { lineNumber: 'asc' } } },
  });

  auditLog({
    organisationId, userId, action: 'Created', module: 'PROCUREMENT', entityType: 'PurchaseOrder',
    entityId: po.id, entityRef: po.poNumber, description: `Created purchase order ${po.poNumber} for ${supplier.name}`,
    after: { poNumber: po.poNumber, supplier: supplier.name, total: Number(po.totalAmount) },
  });
  return po;
}

export async function updatePurchaseOrder(organisationId: string, id: string, input: UpdatePoInput) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'DRAFT') throw new ValidationError('Only draft purchase orders can be edited');

  const data: Prisma.PurchaseOrderUpdateInput = {
    orderDate: input.orderDate ? new Date(input.orderDate) : undefined,
    expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
    currency: input.currency, notes: input.notes,
    ...(input.supplierId ? { supplier: { connect: { id: input.supplierId } } } : {}),
  };

  if (input.lines) {
    const totals = computeTotals(input.lines.map((l) => ({ quantity: l.quantity!, unitPrice: l.unitPrice!, taxAmount: l.taxAmount ?? 0 })));
    data.subtotal = D(totals.subtotal); data.taxAmount = D(totals.taxAmount); data.totalAmount = D(totals.totalAmount);
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    data.lines = {
      create: input.lines.map((l, i) => ({
        lineNumber: i + 1, description: l.description!,
        quantity: D(l.quantity!), unitPrice: D(l.unitPrice!),
        accountId: l.accountId, taxCode: l.taxCode, taxAmount: D(l.taxAmount ?? 0),
        lineTotal: D(l.quantity! * l.unitPrice! + (l.taxAmount ?? 0)),
      })),
    };
  }
  return prisma.purchaseOrder.update({ where: { id }, data, include: { supplier: true, lines: { orderBy: { lineNumber: 'asc' } } } });
}

export async function deletePurchaseOrder(organisationId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (!['DRAFT', 'CANCELLED'].includes(po.status)) throw new ValidationError('Only draft or cancelled purchase orders can be deleted');
  await prisma.purchaseOrder.delete({ where: { id } });
}

// ─── Approval ──────────────────────────────────────────────────────────────────

export async function submitForApproval(organisationId: string, id: string, userId: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId }, include: { supplier: true } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'DRAFT') throw new ValidationError(`Only DRAFT purchase orders can be submitted (current: ${po.status})`);

  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { organisationId, entityType: ApprovalEntityType.PURCHASE_ORDER, isActive: true },
    include: { levels: { orderBy: { levelNumber: 'asc' } } },
  });

  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });

  if (workflow && workflow.levels.length > 0) {
    const first = workflow.levels[0];
    await prisma.approvalRequest.create({
      data: {
        workflowId: workflow.id, entityType: ApprovalEntityType.PURCHASE_ORDER, entityId: id,
        requestedBy: userId, currentLevel: first.levelNumber, status: ApprovalRequestStatus.PENDING,
      },
    });
  }
  auditLog({ organisationId, userId, action: 'SubmittedForApproval', module: 'PROCUREMENT', entityType: 'PurchaseOrder', entityId: id, entityRef: po.poNumber, description: `Purchase order ${po.poNumber} submitted for approval` });
  return { status: 'PENDING_APPROVAL', hasWorkflow: !!(workflow && workflow.levels.length > 0) };
}

export async function approvePurchaseOrder(organisationId: string, id: string, userId: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'PENDING_APPROVAL') throw new ValidationError(`PO must be PENDING_APPROVAL to approve (current: ${po.status})`);
  if (po.createdBy === userId) throw new ForbiddenError('Segregation of duties: you cannot approve a PO you created');

  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'APPROVED' } });
  await prisma.approvalRequest.updateMany({
    where: { entityId: id, entityType: ApprovalEntityType.PURCHASE_ORDER, status: ApprovalRequestStatus.PENDING },
    data: { status: ApprovalRequestStatus.APPROVED, completedAt: new Date() },
  });
  auditLog({ organisationId, userId, action: 'Approved', module: 'PROCUREMENT', entityType: 'PurchaseOrder', entityId: id, entityRef: po.poNumber, description: `Purchase order ${po.poNumber} approved` });
  return prisma.purchaseOrder.findFirst({ where: { id }, include: { supplier: true, lines: true } });
}

export async function rejectPurchaseOrder(organisationId: string, id: string, userId: string, reason: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'PENDING_APPROVAL') throw new ValidationError(`PO must be PENDING_APPROVAL to reject (current: ${po.status})`);
  if (po.createdBy === userId) throw new ForbiddenError('Segregation of duties violation');

  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'DRAFT' } });
  await prisma.approvalRequest.updateMany({
    where: { entityId: id, entityType: ApprovalEntityType.PURCHASE_ORDER, status: ApprovalRequestStatus.PENDING },
    data: { status: ApprovalRequestStatus.REJECTED, completedAt: new Date() },
  });
  auditLog({ organisationId, userId, action: 'Rejected', module: 'PROCUREMENT', entityType: 'PurchaseOrder', entityId: id, entityRef: po.poNumber, description: `Purchase order ${po.poNumber} rejected. Reason: ${reason}` });
  return { status: 'DRAFT', reason };
}

export async function cancelPurchaseOrder(organisationId: string, id: string, userId: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (['BILLED', 'CANCELLED'].includes(po.status)) throw new ValidationError(`Cannot cancel a ${po.status} purchase order`);
  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  await prisma.approvalRequest.updateMany({
    where: { entityId: id, entityType: ApprovalEntityType.PURCHASE_ORDER, status: ApprovalRequestStatus.PENDING },
    data: { status: ApprovalRequestStatus.WITHDRAWN, completedAt: new Date() },
  });
  auditLog({ organisationId, userId, action: 'Cancelled', module: 'PROCUREMENT', entityType: 'PurchaseOrder', entityId: id, entityRef: po.poNumber, description: `Purchase order ${po.poNumber} cancelled` });
  return { status: 'CANCELLED' };
}

// ─── Convert to bill (PO → supplier invoice) ───────────────────────────────────

export async function convertToBill(organisationId: string, id: string, userId: string, input: ConvertToBillInput) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organisationId }, include: { lines: { orderBy: { lineNumber: 'asc' } } } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (!['APPROVED', 'PARTIALLY_BILLED'].includes(po.status)) {
    throw new ValidationError(`Only an APPROVED purchase order can be billed (current: ${po.status})`);
  }

  // Bill the remaining (un-billed) quantity on each line.
  const billable = po.lines
    .map((l) => ({ line: l, remaining: Number(l.quantity) - Number(l.quantityBilled) }))
    .filter((x) => x.remaining > 0.0001);
  if (billable.length === 0) throw new ValidationError('Nothing left to bill on this purchase order.');

  const invoice = await apService.createSupplierInvoice(organisationId, userId, {
    supplierId: po.supplierId,
    supplierRef: input.supplierRef,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: input.dueDate ?? new Date().toISOString().split('T')[0],
    currency: po.currency,
    exchangeRate: Number(po.exchangeRate),
    apAccountId: input.apAccountId,
    notes: `From purchase order ${po.poNumber}`,
    lines: billable.map(({ line, remaining }, i) => {
      const unit = Number(line.unitPrice);
      const taxPerUnit = Number(line.quantity) > 0 ? Number(line.taxAmount) / Number(line.quantity) : 0;
      return {
        lineNumber: i + 1,
        description: line.description,
        quantity: remaining,
        unitPrice: unit,
        taxCode: line.taxCode ?? undefined,
        taxAmount: Math.round(taxPerUnit * remaining * 10000) / 10000,
        accountId: line.accountId ?? undefined,
      };
    }),
    skipDuplicateCheck: true,
  });

  // Link the bill to the PO and mark each line fully billed.
  await prisma.supplierInvoice.update({ where: { id: invoice.id }, data: { purchaseOrderId: po.id } });
  for (const { line } of billable) {
    await prisma.purchaseOrderLine.update({ where: { id: line.id }, data: { quantityBilled: line.quantity } });
  }
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'BILLED' } });

  auditLog({
    organisationId, userId, action: 'ConvertedToBill', module: 'PROCUREMENT', entityType: 'PurchaseOrder',
    entityId: po.id, entityRef: po.poNumber, description: `Purchase order ${po.poNumber} converted to bill ${invoice.invoiceNumber}`,
    after: { invoiceNumber: invoice.invoiceNumber },
  });
  return { purchaseOrderId: po.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
}
