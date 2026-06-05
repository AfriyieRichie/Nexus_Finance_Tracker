import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { auditLog } from '../audit-trail/audit.service';
import * as apService from '../accounts-payable/ap.service';
import type { CreatePvInput, ListPvQuery, PayPvInput } from './pv.schemas';

const PAYABLE_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'APPROVED'];

async function nextPvNumber(organisationId: string): Promise<string> {
  const last = await prisma.paymentVoucher.findFirst({ where: { organisationId }, orderBy: { createdAt: 'desc' }, select: { pvNumber: true } });
  const year = new Date().getFullYear();
  const seq = last ? parseInt(last.pvNumber.split('-').pop() ?? '0', 10) + 1 : 1;
  return `PV-${year}-${String(seq).padStart(6, '0')}`;
}

export async function listPaymentVouchers(organisationId: string, q: ListPvQuery) {
  return prisma.paymentVoucher.findMany({
    where: {
      organisationId,
      ...(q.status ? { status: q.status as Prisma.EnumPaymentVoucherStatusFilter['equals'] } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    },
    include: { supplier: { select: { name: true, code: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPaymentVoucher(organisationId: string, id: string) {
  const pv = await prisma.paymentVoucher.findFirst({
    where: { id, organisationId },
    include: {
      supplier: true,
      lines: { include: { supplierInvoice: { select: { invoiceNumber: true, totalAmount: true, amountPaid: true, status: true } } } },
    },
  });
  if (!pv) throw new NotFoundError('Payment voucher not found');
  return pv;
}

export async function createPaymentVoucher(organisationId: string, userId: string, input: CreatePvInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, organisationId, isDeleted: false } });
  if (!supplier) throw new NotFoundError('Supplier not found');

  const invoiceIds = input.lines.map((l) => l.supplierInvoiceId);
  const invoices = await prisma.supplierInvoice.findMany({ where: { id: { in: invoiceIds }, organisationId, supplierId: input.supplierId } });
  if (invoices.length !== invoiceIds.length) throw new ValidationError('One or more invoices do not belong to this supplier.');

  for (const line of input.lines) {
    const inv = invoices.find((i) => i.id === line.supplierInvoiceId)!;
    if (!PAYABLE_STATUSES.includes(inv.status)) throw new ValidationError(`Invoice ${inv.invoiceNumber} is not payable (status ${inv.status}).`);
    const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
    if (line.amount > outstanding + 0.0001) throw new ValidationError(`Amount for ${inv.invoiceNumber} exceeds its outstanding balance (${outstanding.toFixed(2)}).`);
  }

  const total = input.lines.reduce((s, l) => s + l.amount, 0);
  const pvNumber = await nextPvNumber(organisationId);

  const pv = await prisma.paymentVoucher.create({
    data: {
      organisationId, pvNumber, supplierId: input.supplierId,
      voucherDate: new Date(input.voucherDate), bankAccountId: input.bankAccountId,
      currency: invoices[0]?.currency ?? 'GHS', totalAmount: new Prisma.Decimal(total),
      payeeMemo: input.payeeMemo, notes: input.notes, createdBy: userId,
      lines: { create: input.lines.map((l) => ({ supplierInvoiceId: l.supplierInvoiceId, amount: new Prisma.Decimal(l.amount) })) },
    },
    include: { supplier: true, lines: true },
  });

  auditLog({
    organisationId, userId, action: 'Created', module: 'PROCUREMENT', entityType: 'PaymentVoucher',
    entityId: pv.id, entityRef: pv.pvNumber, description: `Raised payment voucher ${pv.pvNumber} for ${supplier.name}`,
    after: { pvNumber: pv.pvNumber, supplier: supplier.name, total },
  });
  return pv;
}

export async function submitForApproval(organisationId: string, id: string, userId: string) {
  const pv = await prisma.paymentVoucher.findFirst({ where: { id, organisationId } });
  if (!pv) throw new NotFoundError('Payment voucher not found');
  if (pv.status !== 'DRAFT') throw new ValidationError(`Only DRAFT vouchers can be submitted (current: ${pv.status})`);
  await prisma.paymentVoucher.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });
  auditLog({ organisationId, userId, action: 'SubmittedForApproval', module: 'PROCUREMENT', entityType: 'PaymentVoucher', entityId: id, entityRef: pv.pvNumber, description: `Payment voucher ${pv.pvNumber} submitted for approval` });
  return { status: 'PENDING_APPROVAL' };
}

export async function approvePaymentVoucher(organisationId: string, id: string, userId: string) {
  const pv = await prisma.paymentVoucher.findFirst({ where: { id, organisationId } });
  if (!pv) throw new NotFoundError('Payment voucher not found');
  if (pv.status !== 'PENDING_APPROVAL') throw new ValidationError(`Voucher must be PENDING_APPROVAL to approve (current: ${pv.status})`);
  if (pv.createdBy === userId) throw new ForbiddenError('Segregation of duties: you cannot approve a voucher you raised');
  await prisma.paymentVoucher.update({ where: { id }, data: { status: 'APPROVED' } });
  auditLog({ organisationId, userId, action: 'Approved', module: 'PROCUREMENT', entityType: 'PaymentVoucher', entityId: id, entityRef: pv.pvNumber, description: `Payment voucher ${pv.pvNumber} approved` });
  return { status: 'APPROVED' };
}

export async function rejectPaymentVoucher(organisationId: string, id: string, userId: string, reason: string) {
  const pv = await prisma.paymentVoucher.findFirst({ where: { id, organisationId } });
  if (!pv) throw new NotFoundError('Payment voucher not found');
  if (pv.status !== 'PENDING_APPROVAL') throw new ValidationError(`Voucher must be PENDING_APPROVAL to reject (current: ${pv.status})`);
  if (pv.createdBy === userId) throw new ForbiddenError('Segregation of duties violation');
  await prisma.paymentVoucher.update({ where: { id }, data: { status: 'DRAFT' } });
  auditLog({ organisationId, userId, action: 'Rejected', module: 'PROCUREMENT', entityType: 'PaymentVoucher', entityId: id, entityRef: pv.pvNumber, description: `Payment voucher ${pv.pvNumber} rejected. Reason: ${reason}` });
  return { status: 'DRAFT', reason };
}

export async function cancelPaymentVoucher(organisationId: string, id: string, userId: string) {
  const pv = await prisma.paymentVoucher.findFirst({ where: { id, organisationId } });
  if (!pv) throw new NotFoundError('Payment voucher not found');
  if (['PAID', 'CANCELLED'].includes(pv.status)) throw new ValidationError(`Cannot cancel a ${pv.status} voucher`);
  await prisma.paymentVoucher.update({ where: { id }, data: { status: 'CANCELLED' } });
  auditLog({ organisationId, userId, action: 'Cancelled', module: 'PROCUREMENT', entityType: 'PaymentVoucher', entityId: id, entityRef: pv.pvNumber, description: `Payment voucher ${pv.pvNumber} cancelled` });
  return { status: 'CANCELLED' };
}

// Pay the voucher: records a supplier payment for each line (Dr AP / Cr Bank, WHT
// applied), marking the invoices paid. Requires an approved voucher, a bank
// account, and an open period covering the voucher date.
export async function payPaymentVoucher(organisationId: string, id: string, userId: string, input: PayPvInput) {
  const pv = await prisma.paymentVoucher.findFirst({ where: { id, organisationId }, include: { lines: true } });
  if (!pv) throw new NotFoundError('Payment voucher not found');
  if (pv.status !== 'APPROVED') throw new ValidationError(`Only an APPROVED voucher can be paid (current: ${pv.status})`);

  const bankAccountId = input.bankAccountId ?? pv.bankAccountId;
  if (!bankAccountId) throw new ValidationError('A bank/cash account is required to pay this voucher.');

  const voucherDate = pv.voucherDate;
  const period = await prisma.accountingPeriod.findFirst({
    where: { organisationId, status: 'OPEN', startDate: { lte: voucherDate }, endDate: { gte: voucherDate } },
    select: { id: true },
  });
  if (!period) throw new ValidationError('No open accounting period for the voucher date.');

  const paymentDate = voucherDate.toISOString().split('T')[0];
  for (const line of pv.lines) {
    await apService.recordSupplierPayment(organisationId, userId, {
      supplierInvoiceId: line.supplierInvoiceId,
      amount: Number(line.amount),
      paymentDate,
      bankAccountId,
      periodId: period.id,
      reference: pv.pvNumber,
      applyWht: true,
    });
  }

  await prisma.paymentVoucher.update({ where: { id }, data: { status: 'PAID', bankAccountId } });
  auditLog({ organisationId, userId, action: 'Paid', module: 'PROCUREMENT', entityType: 'PaymentVoucher', entityId: id, entityRef: pv.pvNumber, description: `Payment voucher ${pv.pvNumber} paid (${pv.lines.length} invoice(s))` });
  return { status: 'PAID', pvNumber: pv.pvNumber };
}
