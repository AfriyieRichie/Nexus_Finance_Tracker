import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import { createAuditLog } from '../audit-trail/audit.service';
import type {
  CreateCustomerInput, UpdateCustomerInput, ListCustomersQuery,
  CreateInvoiceInput, ListInvoicesQuery, RecordPaymentInput,
  CreateCreditNoteInput, WriteBadDebtInput,
} from './ar.schemas';

const MANAGER_ROLES = ['ORG_ADMIN', 'FINANCE_MANAGER'];

async function getUserRole(organisationId: string, userId: string): Promise<string | null> {
  const member = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function createCustomer(organisationId: string, input: CreateCustomerInput) {
  const exists = await prisma.customer.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (exists) throw new ConflictError(`Customer code '${input.code}' already exists`);

  return prisma.customer.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue | undefined,
      taxId: input.taxId,
      creditLimit: input.creditLimit != null ? new Prisma.Decimal(input.creditLimit) : null,
      paymentTerms: input.paymentTerms,
    },
  });
}

export async function updateCustomer(organisationId: string, customerId: string, input: UpdateCustomerInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organisationId, isDeleted: false },
  });
  if (!customer) throw new NotFoundError('Customer not found');

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue | undefined,
      taxId: input.taxId,
      creditLimit: input.creditLimit != null ? new Prisma.Decimal(input.creditLimit) : undefined,
      paymentTerms: input.paymentTerms,
    },
  });
}

export async function listCustomers(organisationId: string, query: ListCustomersQuery) {
  const where: Prisma.CustomerWhereInput = {
    organisationId,
    isDeleted: false,
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { customers, total, page: query.page, pageSize: query.pageSize };
}

export async function getCustomer(organisationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organisationId, isDeleted: false },
    include: { invoices: { orderBy: { invoiceDate: 'desc' }, take: 10 } },
  });
  if (!customer) throw new NotFoundError('Customer not found');
  return customer;
}

export async function deleteCustomer(organisationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organisationId, isDeleted: false },
  });
  if (!customer) throw new NotFoundError('Customer not found');
  const hasInvoices = await prisma.invoice.count({ where: { customerId } });
  if (hasInvoices > 0) throw new ValidationError('Cannot delete customer with existing invoices');
  return prisma.customer.update({
    where: { id: customerId },
    data: { isDeleted: true, isActive: false },
  });
}

// ─── Invoices ────────────────────────────────────────────────────────────────

async function nextInvoiceNumber(orgId: string): Promise<string> {
  const last = await prisma.invoice.findFirst({
    where: { organisationId: orgId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  const year = new Date().getFullYear();
  const seq = last ? parseInt(last.invoiceNumber.split('-').pop() ?? '0', 10) + 1 : 1;
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}

export async function createInvoice(organisationId: string, userId: string, input: CreateInvoiceInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organisationId, isDeleted: false, isActive: true },
  });
  if (!customer) throw new NotFoundError('Customer not found or inactive');

  const role = await getUserRole(organisationId, userId);
  const initialStatus = MANAGER_ROLES.includes(role ?? '') ? 'APPROVED' : 'DRAFT';

  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxAmount = input.lines.reduce((s, l) => s + l.taxAmount, 0);
  const totalAmount = subtotal + taxAmount;
  const invoiceNumber = await nextInvoiceNumber(organisationId);

  return prisma.invoice.create({
    data: {
      organisationId,
      customerId: input.customerId,
      invoiceNumber,
      invoiceDate: new Date(input.invoiceDate),
      dueDate: new Date(input.dueDate),
      currency: input.currency,
      exchangeRate: new Prisma.Decimal(input.exchangeRate),
      subtotal: new Prisma.Decimal(subtotal),
      taxAmount: new Prisma.Decimal(taxAmount),
      totalAmount: new Prisma.Decimal(totalAmount),
      notes: input.notes,
      createdBy: userId,
      status: initialStatus,
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
    include: { customer: true, lines: true },
  });
}

export async function postInvoice(organisationId: string, invoiceId: string, periodId: string, userId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organisationId },
    include: { lines: true, customer: true },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status !== 'APPROVED') throw new ValidationError(`Invoice must be approved before posting. Current status: ${invoice.status}`);

  // Find AR control account
  const arAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'RECEIVABLE', isActive: true, isDeleted: false },
  });
  if (!arAccount) throw new ValidationError('No AR control account found. Create an account with type RECEIVABLE.');

  // Build revenue lines from invoice lines that have an accountId
  const revenueLines = invoice.lines.filter((l) => l.accountId);
  if (revenueLines.length === 0) {
    const revenueAccount = await prisma.account.findFirst({
      where: { organisationId, class: 'REVENUE', isActive: true, isDeleted: false },
    });
    if (!revenueAccount) throw new ValidationError('No revenue account found. Assign account IDs to invoice lines.');
    revenueLines.push({ ...invoice.lines[0], accountId: revenueAccount.id, lineTotal: invoice.totalAmount });
  }

  const total = invoice.totalAmount;
  const entryDate = invoice.invoiceDate.toISOString().split('T')[0];

  // Use the journal service to create + post the entry properly
  const journalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'SALES',
      reference: invoice.invoiceNumber,
      description: `Sales Invoice – ${invoice.customer.name} – ${invoice.invoiceNumber}`,
      entryDate,
      periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: [
        {
          accountId: arAccount.id,
          description: `AR – ${invoice.customer.name} – ${invoice.invoiceNumber}`,
          debitAmount: Number(total),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        ...revenueLines.map((l) => ({
          accountId: l.accountId!,
          description: l.description,
          debitAmount: 0,
          creditAmount: Number(l.lineTotal),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        })),
      ],
    },
    userId,
  );


  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT', journalEntryId: journalEntry.id },
  });

  return { invoiceId, journalEntryId: journalEntry.id };
}

export async function recordPayment(organisationId: string, userId: string, input: RecordPaymentInput) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, organisationId },
    include: { customer: true },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'PAID') throw new ValidationError('Invoice is already fully paid');
  if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(invoice.status)) {
    throw new ValidationError('Invoice must be posted to the ledger before recording payment');
  }

  const arAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'RECEIVABLE', isActive: true, isDeleted: false },
  });
  if (!arAccount) throw new ValidationError('No AR control account found');

  const bankAccount = await prisma.account.findFirst({
    where: { id: input.bankAccountId, organisationId, isActive: true, isDeleted: false },
  });
  if (!bankAccount) throw new ValidationError('Bank account not found');

  const amount = new Prisma.Decimal(input.amount);
  const outstanding = invoice.totalAmount.minus(invoice.amountPaid);
  if (amount.greaterThan(outstanding)) {
    throw new ValidationError(`Payment amount exceeds outstanding balance of ${outstanding.toFixed(2)}`);
  }

  const journalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'CASH_RECEIPT',
      reference: input.reference,
      description: `Payment – ${invoice.customer.name} – ${invoice.invoiceNumber}`,
      entryDate: input.paymentDate,
      periodId: input.periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: [
        {
          accountId: bankAccount.id,
          description: `Cash received – ${invoice.invoiceNumber}`,
          debitAmount: Number(amount),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        {
          accountId: arAccount.id,
          description: `AR cleared – ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: Number(amount),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
      ],
    },
    userId,
  );


  const newAmountPaid = invoice.amountPaid.plus(amount);
  const newStatus = newAmountPaid.greaterThanOrEqualTo(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

  await prisma.invoice.update({
    where: { id: input.invoiceId },
    data: { amountPaid: newAmountPaid, status: newStatus },
  });

  return { status: newStatus, amountPaid: newAmountPaid.toFixed(2), journalEntryId: journalEntry.id };
}

export async function listInvoices(organisationId: string, query: ListInvoicesQuery) {
  const statusMap: Record<string, string> = {
    POSTED: 'SENT', DRAFT: 'DRAFT', PARTIALLY_PAID: 'PARTIALLY_PAID', PAID: 'PAID', OVERDUE: 'OVERDUE', CANCELLED: 'VOID',
  };
  const mappedStatus = query.status ? statusMap[query.status] ?? query.status : undefined;

  const where: Prisma.InvoiceWhereInput = {
    organisationId,
    ...(query.customerId && { customerId: query.customerId }),
    ...(mappedStatus && { status: mappedStatus as Prisma.EnumInvoiceStatusFilter }),
    ...(query.from && { invoiceDate: { gte: new Date(query.from) } }),
    ...(query.to && { invoiceDate: { lte: new Date(query.to) } }),
  };

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: { customer: { select: { name: true, code: true } } },
      orderBy: { invoiceDate: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { invoices, total, page: query.page, pageSize: query.pageSize };
}

export async function getInvoice(organisationId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organisationId },
    include: { customer: true, lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

// ─── Approval Workflow ────────────────────────────────────────────────────────

export async function submitInvoiceForApproval(organisationId: string, invoiceId: string, userId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status !== 'DRAFT') {
    throw new ValidationError(`Only DRAFT invoices can be submitted for approval. Current status: ${invoice.status}`);
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'PENDING_APPROVAL' },
  });

  await createAuditLog({
    organisationId, userId,
    action: 'INVOICE_SUBMITTED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    newValue: { invoiceNumber: invoice.invoiceNumber, submittedBy: userId },
  });

  return updated;
}

export async function approveInvoice(organisationId: string, invoiceId: string, userId: string) {
  const role = await getUserRole(organisationId, userId);
  if (!MANAGER_ROLES.includes(role ?? '')) {
    throw new ForbiddenError('Only Finance Managers and Admins can approve invoices');
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(invoice.status)) {
    throw new ValidationError(`Invoice cannot be approved in status ${invoice.status}`);
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'APPROVED' },
  });

  await createAuditLog({
    organisationId, userId,
    action: 'INVOICE_APPROVED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    newValue: { invoiceNumber: invoice.invoiceNumber, approvedBy: userId },
  });

  return updated;
}

export async function rejectInvoice(organisationId: string, invoiceId: string, userId: string, reason: string) {
  const role = await getUserRole(organisationId, userId);
  if (!MANAGER_ROLES.includes(role ?? '')) {
    throw new ForbiddenError('Only Finance Managers and Admins can reject invoices');
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Only PENDING_APPROVAL invoices can be rejected. Current status: ${invoice.status}`);
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'DRAFT' },
  });

  await createAuditLog({
    organisationId, userId,
    action: 'INVOICE_REJECTED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    newValue: { invoiceNumber: invoice.invoiceNumber, rejectedBy: userId, reason },
  });

  return updated;
}

// ─── Credit Notes ────────────────────────────────────────────────────────────

async function nextCreditNoteNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.journalEntry.count({
    where: { organisationId: orgId, reference: { startsWith: `CN-${year}-` } },
  });
  return `CN-${year}-${String(count + 1).padStart(6, '0')}`;
}

export async function createCreditNote(organisationId: string, userId: string, input: CreateCreditNoteInput) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, organisationId },
    include: { customer: true, lines: true },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'DRAFT') throw new ValidationError('Cannot issue credit note against a draft invoice');
  if (invoice.status === 'VOID') throw new ValidationError('Invoice is already voided');

  const arAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'RECEIVABLE', isActive: true, isDeleted: false },
  });
  if (!arAccount) throw new ValidationError('No AR control account found');

  let revenueAccountId = input.revenueAccountId;
  if (!revenueAccountId) {
    const lineWithAccount = invoice.lines.find((l) => l.accountId);
    if (lineWithAccount?.accountId) {
      revenueAccountId = lineWithAccount.accountId;
    } else {
      const revenueAccount = await prisma.account.findFirst({
        where: { organisationId, class: 'REVENUE', isActive: true, isDeleted: false },
      });
      if (!revenueAccount) throw new ValidationError('No revenue account found');
      revenueAccountId = revenueAccount.id;
    }
  }

  const amount = new Prisma.Decimal(input.amount);
  const outstanding = invoice.totalAmount.minus(invoice.amountPaid);
  if (amount.greaterThan(outstanding)) {
    throw new ValidationError(`Credit note amount exceeds outstanding balance of ${outstanding.toFixed(2)}`);
  }

  const cnNumber = await nextCreditNoteNumber(organisationId);

  const journalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'GENERAL',
      reference: cnNumber,
      description: `Credit Note – ${invoice.customer.name} – ${invoice.invoiceNumber}${input.reason ? ` – ${input.reason}` : ''}`,
      entryDate: input.creditDate,
      periodId: input.periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: [
        {
          accountId: revenueAccountId,
          description: `Credit Note – ${invoice.invoiceNumber}`,
          debitAmount: Number(amount),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        {
          accountId: arAccount.id,
          description: `AR Credit – ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: Number(amount),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
      ],
    },
    userId,
  );


  const newAmountPaid = invoice.amountPaid.plus(amount);
  const newStatus = newAmountPaid.greaterThanOrEqualTo(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

  await prisma.invoice.update({
    where: { id: input.invoiceId },
    data: { amountPaid: newAmountPaid, status: newStatus },
  });

  return { creditNoteNumber: cnNumber, journalEntryId: journalEntry.id, newStatus };
}

// ─── Bad Debt Write-off ───────────────────────────────────────────────────────

export async function writeBadDebt(organisationId: string, userId: string, input: WriteBadDebtInput) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, organisationId },
    include: { customer: true },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'DRAFT') throw new ValidationError('Cannot write off a draft invoice');
  if (invoice.status === 'VOID' || invoice.status === 'PAID') throw new ValidationError('Invoice is already closed');

  const arAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'RECEIVABLE', isActive: true, isDeleted: false },
  });
  if (!arAccount) throw new ValidationError('No AR control account found');

  let expenseAccountId = input.expenseAccountId;
  if (!expenseAccountId) {
    const badDebtAccount = await prisma.account.findFirst({
      where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, name: { contains: 'bad debt', mode: 'insensitive' } },
    });
    if (badDebtAccount) {
      expenseAccountId = badDebtAccount.id;
    } else {
      const fallbackExpense = await prisma.account.findFirst({
        where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false },
      });
      if (!fallbackExpense) throw new ValidationError('No expense account found. Specify an expense account for write-off.');
      expenseAccountId = fallbackExpense.id;
    }
  }

  const outstanding = invoice.totalAmount.minus(invoice.amountPaid);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.greaterThan(outstanding)) {
    throw new ValidationError(`Write-off amount exceeds outstanding balance of ${outstanding.toFixed(2)}`);
  }

  const journalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'GENERAL',
      reference: `WO-${invoice.invoiceNumber}`,
      description: `Bad Debt Write-off – ${invoice.customer.name} – ${invoice.invoiceNumber}`,
      entryDate: input.writeOffDate,
      periodId: input.periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: [
        {
          accountId: expenseAccountId,
          description: `Bad Debt – ${invoice.invoiceNumber}`,
          debitAmount: Number(amount),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        {
          accountId: arAccount.id,
          description: `AR Write-off – ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: Number(amount),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
      ],
    },
    userId,
  );


  await prisma.invoice.update({
    where: { id: input.invoiceId },
    data: { status: 'VOID', amountPaid: invoice.totalAmount },
  });

  return { journalEntryId: journalEntry.id, amountWrittenOff: Number(amount).toFixed(2) };
}

// ─── AR Ageing ───────────────────────────────────────────────────────────────

export async function getArAgeing(organisationId: string) {
  const today = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      organisationId,
      status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    include: { customer: { select: { name: true, code: true } } },
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
