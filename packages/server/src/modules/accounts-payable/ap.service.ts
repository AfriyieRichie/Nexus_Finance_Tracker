import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import type {
  CreateSupplierInput, UpdateSupplierInput, ListSuppliersQuery,
  CreateSupplierInvoiceInput, ListSupplierInvoicesQuery, RecordSupplierPaymentInput,
} from './ap.schemas';

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function createSupplier(organisationId: string, input: CreateSupplierInput) {
  const exists = await prisma.supplier.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (exists) throw new ConflictError(`Supplier code '${input.code}' already exists`);

  return prisma.supplier.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue | undefined,
      taxId: input.taxId,
      paymentTerms: input.paymentTerms,
      bankDetails: input.bankDetails as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function updateSupplier(organisationId: string, supplierId: string, input: UpdateSupplierInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organisationId, isDeleted: false } });
  if (!supplier) throw new NotFoundError('Supplier not found');
  return prisma.supplier.update({
    where: { id: supplierId },
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue | undefined,
      taxId: input.taxId,
      paymentTerms: input.paymentTerms,
      bankDetails: input.bankDetails as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listSuppliers(organisationId: string, query: ListSuppliersQuery) {
  const where: Prisma.SupplierWhereInput = {
    organisationId,
    isDeleted: false,
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };
  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { suppliers, total, page: query.page, pageSize: query.pageSize };
}

export async function getSupplier(organisationId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organisationId, isDeleted: false },
    include: { supplierInvoices: { orderBy: { invoiceDate: 'desc' }, take: 10 } },
  });
  if (!supplier) throw new NotFoundError('Supplier not found');
  return supplier;
}

export async function deleteSupplier(organisationId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organisationId, isDeleted: false } });
  if (!supplier) throw new NotFoundError('Supplier not found');
  const hasInvoices = await prisma.supplierInvoice.count({ where: { supplierId } });
  if (hasInvoices > 0) throw new ValidationError('Cannot delete supplier with existing invoices');
  return prisma.supplier.update({ where: { id: supplierId }, data: { isDeleted: true, isActive: false } });
}

// ─── Supplier Invoices ───────────────────────────────────────────────────────

async function nextSInvoiceNumber(orgId: string): Promise<string> {
  const last = await prisma.supplierInvoice.findFirst({
    where: { organisationId: orgId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  const year = new Date().getFullYear();
  const seq = last ? parseInt(last.invoiceNumber.split('-').pop() ?? '0', 10) + 1 : 1;
  return `SINV-${year}-${String(seq).padStart(6, '0')}`;
}

export async function createSupplierInvoice(organisationId: string, userId: string, input: CreateSupplierInvoiceInput) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, organisationId, isDeleted: false, isActive: true },
  });
  if (!supplier) throw new NotFoundError('Supplier not found or inactive');

  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxAmount = input.lines.reduce((s, l) => s + l.taxAmount, 0);
  const totalAmount = subtotal + taxAmount;
  const invoiceNumber = await nextSInvoiceNumber(organisationId);

  return prisma.supplierInvoice.create({
    data: {
      organisationId,
      supplierId: input.supplierId,
      invoiceNumber,
      supplierRef: input.supplierRef,
      invoiceDate: new Date(input.invoiceDate),
      dueDate: new Date(input.dueDate),
      currency: input.currency,
      exchangeRate: new Prisma.Decimal(input.exchangeRate),
      subtotal: new Prisma.Decimal(subtotal),
      taxAmount: new Prisma.Decimal(taxAmount),
      totalAmount: new Prisma.Decimal(totalAmount),
      notes: input.notes,
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          lineNumber: l.lineNumber,
          description: l.description,
          quantity: new Prisma.Decimal(l.quantity),
          unitPrice: new Prisma.Decimal(l.unitPrice),
          taxCode: l.taxCode,
          taxAmount: new Prisma.Decimal(l.taxAmount),
          lineTotal: new Prisma.Decimal(l.quantity * l.unitPrice + l.taxAmount),
          accountId: l.accountId,
        })),
      },
    },
    include: { supplier: true, lines: true },
  });
}

export async function postSupplierInvoice(
  organisationId: string, supplierInvoiceId: string, periodId: string, userId: string,
) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: supplierInvoiceId, organisationId },
    include: { lines: true, supplier: true },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (invoice.status !== 'DRAFT') throw new ValidationError(`Invoice cannot be posted in status ${invoice.status}`);

  const apAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'PAYABLE', isActive: true, isDeleted: false },
  });
  if (!apAccount) throw new ValidationError('No AP control account found. Create an account with type PAYABLE.');

  const expenseLines = invoice.lines.filter((l) => l.accountId);
  if (expenseLines.length === 0) {
    const expenseAccount = await prisma.account.findFirst({
      where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false },
    });
    if (!expenseAccount) throw new ValidationError('No expense account found. Assign account IDs to invoice lines.');
    expenseLines.push({ ...invoice.lines[0], accountId: expenseAccount.id, lineTotal: invoice.totalAmount });
  }

  const total = invoice.totalAmount;
  const entryDate = invoice.invoiceDate.toISOString().split('T')[0];

  const journalEntry = await journalService.createJournalEntry(
    organisationId,
    {
      type: 'PURCHASE',
      reference: invoice.supplierRef ?? invoice.invoiceNumber,
      description: `Purchase Invoice – ${invoice.supplier.name} – ${invoice.invoiceNumber}`,
      entryDate,
      periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: [
        {
          accountId: apAccount.id,
          description: `AP – ${invoice.supplier.name} – ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: Number(total),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        ...expenseLines.map((l) => ({
          accountId: l.accountId!,
          description: l.description,
          debitAmount: Number(l.lineTotal),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        })),
      ],
    },
    userId,
  );

  await journalService.postJournalEntry(organisationId, journalEntry.id, userId);

  await prisma.supplierInvoice.update({
    where: { id: supplierInvoiceId },
    data: { status: 'SENT', journalEntryId: journalEntry.id },
  });

  return { supplierInvoiceId, journalEntryId: journalEntry.id };
}

export async function recordSupplierPayment(
  organisationId: string, userId: string, input: RecordSupplierPaymentInput,
) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: input.supplierInvoiceId, organisationId },
    include: { supplier: true },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (invoice.status === 'PAID') throw new ValidationError('Invoice is already fully paid');
  if (invoice.status === 'DRAFT') throw new ValidationError('Post the invoice before recording payment');

  const apAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'PAYABLE', isActive: true, isDeleted: false },
  });
  if (!apAccount) throw new ValidationError('No AP control account found');

  const bankAccount = await prisma.account.findFirst({
    where: { id: input.bankAccountId, organisationId, isActive: true, isDeleted: false },
  });
  if (!bankAccount) throw new ValidationError('Bank account not found');

  const amount = new Prisma.Decimal(input.amount);
  const outstanding = invoice.totalAmount.minus(invoice.amountPaid);
  if (amount.greaterThan(outstanding)) {
    throw new ValidationError(`Payment exceeds outstanding balance of ${outstanding.toFixed(2)}`);
  }

  const journalEntry = await journalService.createJournalEntry(
    organisationId,
    {
      type: 'CASH_PAYMENT',
      reference: input.reference,
      description: `Payment – ${invoice.supplier.name} – ${invoice.invoiceNumber}`,
      entryDate: input.paymentDate,
      periodId: input.periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: [
        {
          accountId: apAccount.id,
          description: `AP cleared – ${invoice.invoiceNumber}`,
          debitAmount: Number(amount),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        {
          accountId: bankAccount.id,
          description: `Cash paid – ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: Number(amount),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
      ],
    },
    userId,
  );

  await journalService.postJournalEntry(organisationId, journalEntry.id, userId);

  const newAmountPaid = invoice.amountPaid.plus(amount);
  const newStatus = newAmountPaid.greaterThanOrEqualTo(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

  await prisma.supplierInvoice.update({
    where: { id: input.supplierInvoiceId },
    data: { amountPaid: newAmountPaid, status: newStatus },
  });

  return { status: newStatus, amountPaid: newAmountPaid.toFixed(2), journalEntryId: journalEntry.id };
}

export async function listSupplierInvoices(organisationId: string, query: ListSupplierInvoicesQuery) {
  const where: Prisma.SupplierInvoiceWhereInput = {
    organisationId,
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.from && { invoiceDate: { gte: new Date(query.from) } }),
    ...(query.to && { invoiceDate: { lte: new Date(query.to) } }),
  };
  const [total, invoices] = await Promise.all([
    prisma.supplierInvoice.count({ where }),
    prisma.supplierInvoice.findMany({
      where,
      include: { supplier: { select: { name: true, code: true } } },
      orderBy: { invoiceDate: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { invoices, total, page: query.page, pageSize: query.pageSize };
}

export async function getSupplierInvoice(organisationId: string, invoiceId: string) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: invoiceId, organisationId },
    include: { supplier: true, lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  return invoice;
}

export async function getApAgeing(organisationId: string) {
  const today = new Date();
  const invoices = await prisma.supplierInvoice.findMany({
    where: { organisationId, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
    include: { supplier: { select: { name: true, code: true } } },
  });

  const result = invoices.map((inv) => {
    const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
    const daysDue = Math.floor((today.getTime() - inv.dueDate.getTime()) / 86400000);
    let bucket: string;
    if (daysDue <= 0) bucket = 'current';
    else if (daysDue <= 30) bucket = 'days1_30';
    else if (daysDue <= 60) bucket = 'days31_60';
    else if (daysDue <= 90) bucket = 'days61_90';
    else bucket = 'over90';
    return { ...inv, outstanding: outstanding.toFixed(2), daysDue, bucket };
  });

  const bucketTotals = result.reduce(
    (acc, i) => { acc[i.bucket] = (acc[i.bucket] ?? 0) + Number(i.outstanding); return acc; },
    {} as Record<string, number>,
  );

  return {
    asOfDate: today.toISOString().split('T')[0],
    buckets: {
      current: (bucketTotals['current'] ?? 0).toFixed(2),
      days1_30: (bucketTotals['days1_30'] ?? 0).toFixed(2),
      days31_60: (bucketTotals['days31_60'] ?? 0).toFixed(2),
      days61_90: (bucketTotals['days61_90'] ?? 0).toFixed(2),
      over90: (bucketTotals['over90'] ?? 0).toFixed(2),
    },
    grandTotal: result.reduce((s, i) => s + Number(i.outstanding), 0).toFixed(2),
    invoices: result,
  };
}
