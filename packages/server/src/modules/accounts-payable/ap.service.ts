import { Prisma, ApprovalEntityType, ApprovalRequestStatus, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { sendEmail } from '../../config/email';
import { auditLog } from '../audit-trail/audit.service';
import * as journalService from '../journals/journal.service';
import type {
  CreateSupplierInput, UpdateSupplierInput, ListSuppliersQuery,
  CreateSupplierInvoiceInput, ListSupplierInvoicesQuery,
  RecordSupplierPaymentInput, ReversePaymentInput,
  CreateSupplierCreditNoteInput, ListSupplierCreditNotesQuery,
  StatementQuery, EmailStatementInput,
} from './ap.schemas';

// ─── Notification helper ──────────────────────────────────────────────────────

async function notify(
  userIds: string[],
  organisationId: string,
  type: NotificationType,
  title: string,
  body: string,
  entityId?: string,
  entityType?: string,
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId, organisationId, type, title, body,
      entityId: entityId ?? null,
      entityType: entityType ?? null,
    })),
    skipDuplicates: true,
  });
}

// ─── WHT account lookup ───────────────────────────────────────────────────────

async function findWhtPayableAccount(organisationId: string) {
  // Prefer an account explicitly named for WHT
  const named = await prisma.account.findFirst({
    where: {
      organisationId, type: 'TAX_PAYABLE', isActive: true, isDeleted: false,
      OR: [
        { name: { contains: 'WHT', mode: 'insensitive' } },
        { name: { contains: 'Withhold', mode: 'insensitive' } },
      ],
    },
    orderBy: { code: 'asc' },
  });
  if (named) return named;

  // Fall back to any TAX_PAYABLE account
  return prisma.account.findFirst({
    where: { organisationId, type: 'TAX_PAYABLE', isActive: true, isDeleted: false },
    orderBy: { code: 'asc' },
  });
}

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
      whtRate: input.whtRate != null ? new Prisma.Decimal(input.whtRate) : null,
      whtClassification: input.whtClassification ?? null,
    },
  });
}

export async function updateSupplier(organisationId: string, supplierId: string, input: UpdateSupplierInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organisationId, isDeleted: false } });
  if (!supplier) throw new NotFoundError('Supplier not found');
  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue | undefined,
      taxId: input.taxId,
      paymentTerms: input.paymentTerms,
      bankDetails: input.bankDetails as Prisma.InputJsonValue | undefined,
      whtRate: input.whtRate != null ? new Prisma.Decimal(input.whtRate) : undefined,
      whtClassification: input.whtClassification,
    },
  });

  const snap = (s: typeof updated) => ({
    name: s.name, email: s.email, phone: s.phone, taxId: s.taxId, paymentTerms: s.paymentTerms,
    whtRate: s.whtRate != null ? Number(s.whtRate) : null, whtClassification: s.whtClassification,
  });
  auditLog({
    organisationId, action: 'Updated', module: 'AP', entityType: 'Supplier',
    entityId: updated.id, entityRef: updated.code,
    description: `Updated supplier ${updated.code} – ${updated.name}`,
    before: snap(supplier), after: snap(updated),
  });

  return updated;
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

  // ── Duplicate detection ───────────────────────────────────────────────────
  // Hard block: same supplier reference number (supplier's own invoice number)
  if (input.supplierRef) {
    const dup = await prisma.supplierInvoice.findFirst({
      where: { organisationId, supplierId: input.supplierId, supplierRef: input.supplierRef, status: { not: 'VOID' } },
    });
    if (dup) {
      throw new ConflictError(
        `Duplicate invoice detected: supplier reference '${input.supplierRef}' already recorded as ${dup.invoiceNumber}. ` +
        `Use a unique supplier reference or void the existing invoice first.`,
      );
    }
  }

  // Soft block: same supplier + same total amount within ±7 days
  if (!input.skipDuplicateCheck) {
    const invoiceDate = new Date(input.invoiceDate);
    const windowStart = new Date(invoiceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(invoiceDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const similar = await prisma.supplierInvoice.findFirst({
      where: {
        organisationId,
        supplierId: input.supplierId,
        totalAmount: new Prisma.Decimal(totalAmount),
        invoiceDate: { gte: windowStart, lte: windowEnd },
        status: { not: 'VOID' },
      },
    });
    if (similar) {
      throw new ConflictError(
        `Possible duplicate: invoice for the same supplier with the same amount (${totalAmount.toFixed(2)}) ` +
        `was recorded within 7 days as ${similar.invoiceNumber}. ` +
        `If this is intentional, re-submit with skipDuplicateCheck: true.`,
      );
    }
  }

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

// ─── Approval flow ───────────────────────────────────────────────────────────

export async function submitSupplierInvoiceForApproval(
  organisationId: string,
  invoiceId: string,
  userId: string,
  comments?: string,
) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: invoiceId, organisationId },
    include: { supplier: true },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (invoice.status !== 'DRAFT') {
    throw new ValidationError(`Invoice must be in DRAFT status to submit for approval (current: ${invoice.status})`);
  }

  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { organisationId, entityType: ApprovalEntityType.SUPPLIER_INVOICE, isActive: true },
    include: { levels: { orderBy: { levelNumber: 'asc' } } },
  });

  await prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { status: 'PENDING_APPROVAL' } });

  if (!workflow || workflow.levels.length === 0) {
    return {
      status: 'PENDING_APPROVAL',
      hasWorkflow: false,
      message: 'No approval workflow configured. A Finance Manager can approve this invoice directly.',
    };
  }

  const firstLevel = workflow.levels[0];
  const escalationHours = workflow.levels
    .filter((l) => l.escalationHours != null)
    .map((l) => l.escalationHours!)
    .sort((a, b) => a - b)[0];
  const slaDeadline = escalationHours ? new Date(Date.now() + escalationHours * 3_600_000) : null;

  const request = await prisma.approvalRequest.create({
    data: {
      workflowId:   workflow.id,
      entityType:   ApprovalEntityType.SUPPLIER_INVOICE,
      entityId:     invoiceId,
      requestedBy:  userId,
      currentLevel: firstLevel.levelNumber,
      status:       ApprovalRequestStatus.PENDING,
      comments:     comments ?? null,
      slaDeadline,
    },
  });

  const level1 = await prisma.approvalLevel.findFirst({
    where:   { workflowId: workflow.id, levelNumber: firstLevel.levelNumber },
    include: { approvers: { select: { userId: true } } },
  });
  if (level1) {
    await notify(
      level1.approvers.map((a) => a.userId),
      organisationId,
      NotificationType.APPROVAL_REQUESTED,
      'AP Invoice Approval Required',
      `Invoice ${invoice.invoiceNumber} from ${invoice.supplier.name} (${Number(invoice.totalAmount).toFixed(2)} ${invoice.currency}) requires your approval.`,
      request.id,
      'APPROVAL_REQUEST',
    );
  }

  return { status: 'PENDING_APPROVAL', hasWorkflow: true, requestId: request.id };
}

export async function approveSupplierInvoice(
  organisationId: string,
  invoiceId: string,
  userId: string,
  comments?: string,
) {
  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (invoice.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Invoice must be in PENDING_APPROVAL status to approve (current: ${invoice.status})`);
  }
  if (invoice.createdBy === userId) {
    throw new ForbiddenError('Segregation of duties: you cannot approve an invoice you created');
  }

  await prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { status: 'APPROVED' } });

  // Close any pending approval requests for this invoice
  await prisma.approvalRequest.updateMany({
    where: { entityId: invoiceId, entityType: ApprovalEntityType.SUPPLIER_INVOICE, status: ApprovalRequestStatus.PENDING },
    data:  { status: ApprovalRequestStatus.APPROVED, completedAt: new Date() },
  });

  await notify(
    [invoice.createdBy],
    organisationId,
    NotificationType.APPROVAL_APPROVED,
    'Invoice Approved',
    `Supplier invoice ${invoice.invoiceNumber} has been approved.${comments ? ` Comment: ${comments}` : ''}`,
    invoiceId,
    'SUPPLIER_INVOICE',
  );

  return prisma.supplierInvoice.findFirst({
    where: { id: invoiceId },
    include: { supplier: true, lines: { orderBy: { lineNumber: 'asc' } } },
  });
}

export async function rejectSupplierInvoice(
  organisationId: string,
  invoiceId: string,
  userId: string,
  comments: string,
) {
  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (invoice.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Invoice must be in PENDING_APPROVAL status to reject (current: ${invoice.status})`);
  }
  if (invoice.createdBy === userId) {
    throw new ForbiddenError('Segregation of duties violation');
  }

  await prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { status: 'DRAFT' } });

  await prisma.approvalRequest.updateMany({
    where: { entityId: invoiceId, entityType: ApprovalEntityType.SUPPLIER_INVOICE, status: ApprovalRequestStatus.PENDING },
    data:  { status: ApprovalRequestStatus.REJECTED, completedAt: new Date() },
  });

  await notify(
    [invoice.createdBy],
    organisationId,
    NotificationType.APPROVAL_REJECTED,
    'Invoice Rejected',
    `Supplier invoice ${invoice.invoiceNumber} was rejected. Reason: ${comments}`,
    invoiceId,
    'SUPPLIER_INVOICE',
  );

  return { status: 'DRAFT', reason: comments };
}

export async function voidSupplierInvoice(
  organisationId: string,
  invoiceId: string,
  _userId: string,
  reason: string,
) {
  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(invoice.status)) {
    throw new ValidationError(
      `Only DRAFT or PENDING_APPROVAL invoices can be voided (current: ${invoice.status}). ` +
      `Posted invoices require a credit note or reversal.`,
    );
  }

  await prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } });

  await prisma.approvalRequest.updateMany({
    where: { entityId: invoiceId, entityType: ApprovalEntityType.SUPPLIER_INVOICE, status: ApprovalRequestStatus.PENDING },
    data:  { status: ApprovalRequestStatus.WITHDRAWN, completedAt: new Date() },
  });

  return { status: 'VOID', reason };
}

// ─── Post invoice to GL ───────────────────────────────────────────────────────

export async function postSupplierInvoice(
  organisationId: string, supplierInvoiceId: string, periodId: string, userId: string,
) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: supplierInvoiceId, organisationId },
    include: { lines: true, supplier: true },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');

  // ── Approval check ────────────────────────────────────────────────────────
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { organisationId, entityType: ApprovalEntityType.SUPPLIER_INVOICE, isActive: true },
    include: { levels: true },
  });

  if (workflow && workflow.levels.length > 0) {
    if (invoice.status !== 'APPROVED') {
      throw new ValidationError(
        `An approval workflow is active. Invoice must be APPROVED before posting (current: ${invoice.status}). ` +
        `Submit for approval and have a Finance Manager approve it first.`,
      );
    }
  } else {
    if (!['DRAFT', 'APPROVED'].includes(invoice.status)) {
      throw new ValidationError(`Invoice cannot be posted in status ${invoice.status}`);
    }
  }

  const apAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'PAYABLE', isActive: true, isDeleted: false },
  });
  if (!apAccount) throw new ValidationError('No AP control account found. Create an account with type PAYABLE.');

  const entryDate = invoice.invoiceDate.toISOString().split('T')[0];
  const invoiceTotalTax = Number(invoice.taxAmount);

  // ── Input VAT GL account resolution ──────────────────────────────────────
  const inputVatGlById = new Map<string, number>();

  if (invoiceTotalTax > 0) {
    const taxCodeStrings = [...new Set(
      invoice.lines
        .filter((l) => Number(l.taxAmount) > 0 && l.taxCode)
        .map((l) => l.taxCode!),
    )];

    let fallbackVatAmount = 0;

    if (taxCodeStrings.length > 0) {
      const taxCodeRecords = await prisma.taxCode.findMany({
        where: { organisationId, code: { in: taxCodeStrings }, isActive: true },
        select: { code: true, glAccountId: true },
      });
      const codeToGl = new Map(taxCodeRecords.map((t) => [t.code, t.glAccountId]));

      for (const line of invoice.lines) {
        const lineTax = Number(line.taxAmount);
        if (lineTax <= 0) continue;
        const glAccountId = line.taxCode ? (codeToGl.get(line.taxCode) ?? null) : null;
        if (glAccountId) {
          inputVatGlById.set(glAccountId, (inputVatGlById.get(glAccountId) ?? 0) + lineTax);
        } else {
          fallbackVatAmount += lineTax;
        }
      }
    } else {
      fallbackVatAmount = invoiceTotalTax;
    }

    if (fallbackVatAmount > 0) {
      const fallbackVatAccount = await prisma.account.findFirst({
        where: { organisationId, type: 'TAX_RECEIVABLE', isActive: true, isDeleted: false },
        orderBy: { code: 'asc' },
      });
      if (!fallbackVatAccount) {
        throw new ValidationError(
          'Invoice has tax but no Input VAT account (type: TAX_RECEIVABLE) was found. ' +
          'Create an Input VAT Recoverable account or assign a GL account to your tax codes.',
        );
      }
      inputVatGlById.set(fallbackVatAccount.id, (inputVatGlById.get(fallbackVatAccount.id) ?? 0) + fallbackVatAmount);
    }
  }

  // ── Expense lines (net of tax) ────────────────────────────────────────────
  const expenseLines = invoice.lines.filter((l) => l.accountId);

  const expenseJournalLines: Array<{
    accountId: string; description: string;
    debitAmount: number; creditAmount: number;
    currency: string; exchangeRate: number;
  }> = expenseLines.length > 0
    ? expenseLines.map((l) => ({
        accountId: l.accountId!,
        description: l.description,
        debitAmount: Number(l.lineTotal) - Number(l.taxAmount),
        creditAmount: 0,
        currency: invoice.currency,
        exchangeRate: Number(invoice.exchangeRate),
      }))
    : await (async () => {
        const expenseAccount = await prisma.account.findFirst({
          where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, isControlAccount: false },
          orderBy: { code: 'asc' },
        });
        if (!expenseAccount) throw new ValidationError('No expense account found. Assign account IDs to invoice lines.');
        return [{
          accountId: expenseAccount.id,
          description: `Purchase – ${invoice.invoiceNumber}`,
          debitAmount: Number(invoice.subtotal),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        }];
      })();

  const inputVatJournalLines = Array.from(inputVatGlById.entries()).map(([accountId, amount]) => ({
    accountId,
    description: `Input VAT – ${invoice.invoiceNumber}`,
    debitAmount: amount,
    creditAmount: 0,
    currency: invoice.currency,
    exchangeRate: Number(invoice.exchangeRate),
  }));

  const journalEntry = await journalService.createAndPostSystemEntry(
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
          creditAmount: Number(invoice.totalAmount),
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        ...expenseJournalLines,
        ...inputVatJournalLines,
      ],
    },
    userId,
  );

  await prisma.supplierInvoice.update({
    where: { id: supplierInvoiceId },
    data: { status: 'SENT', journalEntryId: journalEntry.id },
  });

  return { supplierInvoiceId, journalEntryId: journalEntry.id };
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function recordSupplierPayment(
  organisationId: string, userId: string, input: RecordSupplierPaymentInput,
) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: input.supplierInvoiceId, organisationId },
    include: { supplier: true },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  if (invoice.status === 'PAID') throw new ValidationError('Invoice is already fully paid');
  if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'VOID'].includes(invoice.status)) {
    throw new ValidationError(`Post the invoice before recording payment (current status: ${invoice.status})`);
  }

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

  // ── WHT calculation ───────────────────────────────────────────────────────
  let whtAmount = new Prisma.Decimal(0);
  let whtRate: Prisma.Decimal | null = null;
  const journalLines: Array<{
    accountId: string; description: string;
    debitAmount: number; creditAmount: number;
    currency: string; exchangeRate: number;
  }> = [];

  if (input.applyWht && invoice.supplier.whtRate && invoice.supplier.whtRate.greaterThan(0)) {
    whtRate = invoice.supplier.whtRate;
    whtAmount = amount.times(whtRate).dividedBy(100).toDecimalPlaces(4);

    const whtAccount = await findWhtPayableAccount(organisationId);
    if (!whtAccount) {
      throw new ValidationError(
        'Supplier has a WHT rate configured but no WHT Payable account was found. ' +
        'Create an account with type TAX_PAYABLE named "WHT Payable" or similar.',
      );
    }

    journalLines.push({
      accountId: whtAccount.id,
      description: `WHT deducted – ${invoice.invoiceNumber} (${whtRate}%)`,
      debitAmount: 0,
      creditAmount: Number(whtAmount),
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
    });
  }

  const netCashOut = Number(amount) - Number(whtAmount);

  journalLines.unshift(
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
      creditAmount: netCashOut,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
    },
  );

  const journalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'CASH_PAYMENT',
      reference: input.reference,
      description: `Payment – ${invoice.supplier.name} – ${invoice.invoiceNumber}`,
      entryDate: input.paymentDate,
      periodId: input.periodId,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
      lines: journalLines,
    },
    userId,
  );

  // Create SupplierPayment audit record
  const payment = await prisma.supplierPayment.create({
    data: {
      organisationId,
      supplierInvoiceId: input.supplierInvoiceId,
      supplierId: invoice.supplierId,
      paymentDate: new Date(input.paymentDate),
      amount,
      whtAmount,
      whtRate: whtRate ?? null,
      reference: input.reference ?? null,
      bankAccountId: input.bankAccountId,
      periodId: input.periodId,
      journalEntryId: journalEntry.id,
      createdBy: userId,
    },
  });

  const newAmountPaid = invoice.amountPaid.plus(amount);
  const newStatus = newAmountPaid.greaterThanOrEqualTo(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

  await prisma.supplierInvoice.update({
    where: { id: input.supplierInvoiceId },
    data: { amountPaid: newAmountPaid, status: newStatus },
  });

  auditLog({
    organisationId, userId, action: 'Recorded payment', module: 'AP', entityType: 'Payment',
    entityId: payment.id, entityRef: invoice.invoiceNumber,
    description: `Paid ${invoice.currency} ${Number(amount).toFixed(2)} to ${invoice.supplier.name} for invoice ${invoice.invoiceNumber}`
      + (Number(whtAmount) > 0 ? ` (WHT ${Number(whtAmount).toFixed(2)} withheld)` : ''),
    after: { invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier.name, amount: Number(amount), whtAmount: Number(whtAmount), newStatus, amountPaid: Number(newAmountPaid) },
  });

  return {
    paymentId: payment.id,
    status: newStatus,
    amountPaid: newAmountPaid.toFixed(2),
    whtDeducted: Number(whtAmount).toFixed(2),
    netCashOut: netCashOut.toFixed(2),
    journalEntryId: journalEntry.id,
  };
}

export async function reverseSupplierPayment(
  organisationId: string,
  paymentId: string,
  userId: string,
  input: ReversePaymentInput,
) {
  const payment = await prisma.supplierPayment.findFirst({
    where: { id: paymentId, organisationId },
    include: { invoice: { include: { supplier: true } } },
  });
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.isReversed) throw new ValidationError('This payment has already been reversed');
  if (!payment.journalEntryId) throw new ValidationError('No journal entry found for this payment');

  const originalJournal = await prisma.journalEntry.findUnique({
    where: { id: payment.journalEntryId },
    include: { lines: true },
  });
  if (!originalJournal) throw new ValidationError('Original payment journal not found');

  const reversalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'REVERSAL',
      reference: `REV-${payment.id.slice(0, 8).toUpperCase()}`,
      description: `Reversal of payment – ${payment.invoice.supplier.name} – ${payment.invoice.invoiceNumber}: ${input.reason}`,
      entryDate: new Date().toISOString().split('T')[0],
      periodId: input.periodId,
      currency: payment.invoice.currency,
      exchangeRate: Number(payment.invoice.exchangeRate),
      lines: originalJournal.lines.map((l) => ({
        accountId: l.accountId,
        description: `Reversal: ${l.description}`,
        debitAmount: Number(l.creditAmount),
        creditAmount: Number(l.debitAmount),
        currency: l.currency,
        exchangeRate: Number(l.exchangeRate),
      })),
    },
    userId,
  );

  await prisma.supplierPayment.update({
    where: { id: paymentId },
    data: {
      isReversed:        true,
      reversedAt:        new Date(),
      reversedBy:        userId,
      reversalReason:    input.reason,
      reversalJournalId: reversalEntry.id,
    },
  });

  // Restore invoice amountPaid and status
  const invoice = payment.invoice;
  const newAmountPaid = invoice.amountPaid.minus(payment.amount);
  const effective = newAmountPaid.lessThan(0) ? new Prisma.Decimal(0) : newAmountPaid;
  const newStatus = effective.greaterThan(0) ? 'PARTIALLY_PAID' : 'SENT';

  await prisma.supplierInvoice.update({
    where: { id: payment.supplierInvoiceId },
    data: { amountPaid: effective, status: newStatus },
  });

  return { status: 'REVERSED', reversalJournalId: reversalEntry.id, invoiceStatus: newStatus };
}

export async function listSupplierPayments(organisationId: string, invoiceId: string) {
  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: invoiceId, organisationId } });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');

  return prisma.supplierPayment.findMany({
    where: { organisationId, supplierInvoiceId: invoiceId },
    orderBy: { paymentDate: 'desc' },
  });
}

// ─── Credit Notes ─────────────────────────────────────────────────────────────

export async function createSupplierCreditNote(
  organisationId: string, userId: string, input: CreateSupplierCreditNoteInput,
) {
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, organisationId, isDeleted: false } });
  if (!supplier) throw new NotFoundError('Supplier not found');

  // Duplicate credit note number check
  const dupCn = await prisma.supplierCreditNote.findFirst({
    where: { organisationId, supplierId: input.supplierId, creditNoteNumber: input.creditNoteNumber },
  });
  if (dupCn) throw new ConflictError(`Credit note number '${input.creditNoteNumber}' already exists for this supplier`);

  let linkedInvoice: Awaited<ReturnType<typeof prisma.supplierInvoice.findFirst>> = null;
  if (input.supplierInvoiceId) {
    linkedInvoice = await prisma.supplierInvoice.findFirst({
      where: { id: input.supplierInvoiceId, organisationId },
    });
    if (!linkedInvoice) throw new NotFoundError('Linked supplier invoice not found');
    if (!['SENT', 'PARTIALLY_PAID', 'PAID'].includes(linkedInvoice.status)) {
      throw new ValidationError('Credit notes can only be applied to posted invoices (SENT, PARTIALLY_PAID, or PAID)');
    }
    if (new Prisma.Decimal(input.amount).greaterThan(linkedInvoice.totalAmount)) {
      throw new ValidationError(`Credit note amount (${input.amount}) exceeds invoice total (${linkedInvoice.totalAmount})`);
    }
  }

  const apAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'PAYABLE', isActive: true, isDeleted: false },
  });
  if (!apAccount) throw new ValidationError('No AP control account found');

  const netAmount = input.amount - input.taxAmount;

  // GL: DR AP Control / CR Expense (net) / CR Input VAT Recoverable
  const journalLines: Array<{
    accountId: string; description: string;
    debitAmount: number; creditAmount: number;
    currency: string; exchangeRate: number;
  }> = [
    {
      accountId: apAccount.id,
      description: `AP Credit Note – ${supplier.name} – ${input.creditNoteNumber}`,
      debitAmount: input.amount,
      creditAmount: 0,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
    },
  ];

  // Expense reversal line
  if (input.accountId) {
    journalLines.push({
      accountId: input.accountId,
      description: `Expense reversal – ${input.creditNoteNumber}`,
      debitAmount: 0,
      creditAmount: netAmount,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
    });
  } else {
    const expAccount = await prisma.account.findFirst({
      where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, isControlAccount: false },
      orderBy: { code: 'asc' },
    });
    if (!expAccount) throw new ValidationError('No expense account found. Specify accountId in the request body.');
    journalLines.push({
      accountId: expAccount.id,
      description: `Expense reversal – ${input.creditNoteNumber}`,
      debitAmount: 0,
      creditAmount: netAmount,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
    });
  }

  // Input VAT reversal
  if (input.taxAmount > 0) {
    const vatAccount = await prisma.account.findFirst({
      where: { organisationId, type: 'TAX_RECEIVABLE', isActive: true, isDeleted: false },
      orderBy: { code: 'asc' },
    });
    if (!vatAccount) throw new ValidationError('No Input VAT Recoverable account found (type: TAX_RECEIVABLE)');
    journalLines.push({
      accountId: vatAccount.id,
      description: `Input VAT reversal – ${input.creditNoteNumber}`,
      debitAmount: 0,
      creditAmount: input.taxAmount,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
    });
  }

  const journalEntry = await journalService.createAndPostSystemEntry(
    organisationId,
    {
      type: 'PURCHASE',
      reference: input.creditNoteNumber,
      description: `Supplier Credit Note – ${supplier.name} – ${input.creditNoteNumber}`,
      entryDate: input.creditNoteDate,
      periodId: input.periodId,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      lines: journalLines,
    },
    userId,
  );

  const creditNote = await prisma.supplierCreditNote.create({
    data: {
      organisationId,
      supplierId: input.supplierId,
      supplierInvoiceId: input.supplierInvoiceId ?? null,
      creditNoteNumber: input.creditNoteNumber,
      creditNoteDate: new Date(input.creditNoteDate),
      amount: new Prisma.Decimal(input.amount),
      taxAmount: new Prisma.Decimal(input.taxAmount),
      reason: input.reason ?? null,
      currency: input.currency,
      exchangeRate: new Prisma.Decimal(input.exchangeRate),
      journalEntryId: journalEntry.id,
      createdBy: userId,
    },
  });

  // Adjust linked invoice balance
  if (linkedInvoice && input.supplierInvoiceId) {
    const creditDecimal = new Prisma.Decimal(input.amount);
    const newTotal = linkedInvoice.totalAmount.minus(creditDecimal);
    const effectiveTotal = newTotal.lessThan(0) ? new Prisma.Decimal(0) : newTotal;
    const effectivePaid = linkedInvoice.amountPaid.greaterThan(effectiveTotal) ? effectiveTotal : linkedInvoice.amountPaid;

    let newStatus = linkedInvoice.status;
    if (effectiveTotal.lessThanOrEqualTo(0)) newStatus = 'PAID' as typeof newStatus;
    else if (effectivePaid.greaterThan(0)) newStatus = 'PARTIALLY_PAID' as typeof newStatus;
    else newStatus = 'SENT' as typeof newStatus;

    await prisma.supplierInvoice.update({
      where: { id: input.supplierInvoiceId },
      data: { totalAmount: effectiveTotal, amountPaid: effectivePaid, status: newStatus },
    });
  }

  return creditNote;
}

export async function listSupplierCreditNotes(organisationId: string, query: ListSupplierCreditNotesQuery) {
  return prisma.supplierCreditNote.findMany({
    where: { organisationId, ...(query.supplierId && { supplierId: query.supplierId }) },
    include: { supplier: { select: { name: true, code: true } } },
    orderBy: { creditNoteDate: 'desc' },
  });
}

// ─── Invoice list / get ───────────────────────────────────────────────────────

export async function listSupplierInvoices(organisationId: string, query: ListSupplierInvoicesQuery) {
  const where: Prisma.SupplierInvoiceWhereInput = {
    organisationId,
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.status && { status: query.status }),
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
    include: {
      supplier: true,
      lines: { orderBy: { lineNumber: 'asc' } },
      supplierPayments: { orderBy: { paymentDate: 'desc' } },
      supplierCreditNotes: { orderBy: { creditNoteDate: 'desc' } },
    },
  });
  if (!invoice) throw new NotFoundError('Supplier invoice not found');
  return invoice;
}

// ─── AP Ageing ────────────────────────────────────────────────────────────────

export async function getApAgeing(organisationId: string) {
  const today = new Date();
  const invoices = await prisma.supplierInvoice.findMany({
    where: { organisationId, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
    include: { supplier: { select: { name: true, code: true } } },
  });

  const result = invoices.map((inv) => {
    const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
    const daysDue = Math.floor((today.getTime() - inv.dueDate.getTime()) / 86_400_000);
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

  // Supplier-level grouping
  type SupplierRow = {
    supplierCode: string; supplierName: string;
    current: number; days1_30: number; days31_60: number; days61_90: number; over90: number; total: number;
  };
  const bySupplier = new Map<string, SupplierRow>();
  for (const inv of result) {
    const key = inv.supplier.code;
    if (!bySupplier.has(key)) {
      bySupplier.set(key, {
        supplierCode: inv.supplier.code, supplierName: inv.supplier.name,
        current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0, total: 0,
      });
    }
    const row = bySupplier.get(key)!;
    const amt = Number(inv.outstanding);
    if (inv.bucket === 'current') row.current += amt;
    else if (inv.bucket === 'days1_30') row.days1_30 += amt;
    else if (inv.bucket === 'days31_60') row.days31_60 += amt;
    else if (inv.bucket === 'days61_90') row.days61_90 += amt;
    else row.over90 += amt;
    row.total += amt;
  }

  return {
    asOfDate: today.toISOString().split('T')[0],
    buckets: {
      current:    (bucketTotals['current']    ?? 0).toFixed(2),
      days1_30:   (bucketTotals['days1_30']   ?? 0).toFixed(2),
      days31_60:  (bucketTotals['days31_60']  ?? 0).toFixed(2),
      days61_90:  (bucketTotals['days61_90']  ?? 0).toFixed(2),
      over90:     (bucketTotals['over90']     ?? 0).toFixed(2),
    },
    grandTotal: result.reduce((s, i) => s + Number(i.outstanding), 0).toFixed(2),
    bySupplier: Array.from(bySupplier.values())
      .map((r) => ({
        ...r,
        current:   r.current.toFixed(2),
        days1_30:  r.days1_30.toFixed(2),
        days31_60: r.days31_60.toFixed(2),
        days61_90: r.days61_90.toFixed(2),
        over90:    r.over90.toFixed(2),
        total:     r.total.toFixed(2),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total)),
    invoices: result,
  };
}

// ─── Supplier Statement ───────────────────────────────────────────────────────

interface SupplierStatementLine {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  description: string;
  debit: number;   // increases what we owe the supplier (an invoice)
  credit: number;  // reduces what we owe (a payment or credit note)
  balance: number; // amount currently owed to the supplier
}

async function buildSupplierStatement(organisationId: string, supplierId: string, from: string, to: string) {
  const [supplier, org] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: supplierId, organisationId, isDeleted: false } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, baseCurrency: true, address: true, email: true, phone: true } }),
  ]);
  if (!supplier) throw new NotFoundError('Supplier not found');

  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T23:59:59Z');

  // Dedicated AP tables — no journal scraping needed.
  const [invoices, payments, creditNotes] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: { organisationId, supplierId, status: { in: ['APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } },
      orderBy: { invoiceDate: 'asc' },
    }),
    prisma.supplierPayment.findMany({
      where: { organisationId, supplierId, isReversed: false },
      orderBy: { paymentDate: 'asc' },
    }),
    prisma.supplierCreditNote.findMany({
      where: { organisationId, supplierId },
      orderBy: { creditNoteDate: 'asc' },
    }),
  ]);

  type RawTx = { date: Date; type: SupplierStatementLine['type']; reference: string; description: string; amount: number; isDebit: boolean };

  const allTxs: RawTx[] = [
    ...invoices.map((inv) => ({
      date: inv.invoiceDate,
      type: 'INVOICE' as const,
      reference: inv.invoiceNumber,
      description: `Supplier Invoice – ${inv.invoiceNumber}`,
      amount: Number(inv.totalAmount),
      isDebit: true,
    })),
    ...payments.map((p) => ({
      date: p.paymentDate,
      type: 'PAYMENT' as const,
      reference: p.reference ?? 'Payment',
      // The payable is settled by the cash paid plus any tax withheld at source.
      description: Number(p.whtAmount) > 0 ? `Payment (incl. WHT ${Number(p.whtAmount).toFixed(2)})` : 'Payment',
      amount: Number(p.amount) + Number(p.whtAmount),
      isDebit: false,
    })),
    ...creditNotes.map((cn) => ({
      date: cn.creditNoteDate,
      type: 'CREDIT_NOTE' as const,
      reference: cn.creditNoteNumber,
      description: `Credit Note – ${cn.creditNoteNumber}`,
      amount: Number(cn.amount) + Number(cn.taxAmount),
      isDebit: false,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const preTxs = allTxs.filter((t) => t.date < fromDate);
  const periodTxs = allTxs.filter((t) => t.date >= fromDate && t.date <= toDate);

  const openingBalance = preTxs.reduce((bal, t) => bal + (t.isDebit ? t.amount : -t.amount), 0);

  let balance = openingBalance;
  const transactions: SupplierStatementLine[] = periodTxs.map((t) => {
    const debit = t.isDebit ? t.amount : 0;
    const credit = t.isDebit ? 0 : t.amount;
    balance = balance + debit - credit;
    return { date: t.date.toISOString().split('T')[0], type: t.type, reference: t.reference, description: t.description, debit, credit, balance };
  });

  return {
    supplier: { id: supplier.id, name: supplier.name, code: supplier.code, email: supplier.email, phone: supplier.phone, address: supplier.address },
    organisation: { name: org?.name ?? '', currency: org?.baseCurrency ?? 'GHS', address: org?.address, email: org?.email },
    period: { from, to },
    currency: org?.baseCurrency ?? 'GHS',
    openingBalance: Number(openingBalance.toFixed(2)),
    transactions,
    closingBalance: Number(balance.toFixed(2)),
    totalInvoiced: Number(transactions.reduce((s, t) => s + t.debit, 0).toFixed(2)),
    totalPayments: Number(transactions.filter((t) => t.type === 'PAYMENT').reduce((s, t) => s + t.credit, 0).toFixed(2)),
    totalCredits: Number(transactions.filter((t) => t.type === 'CREDIT_NOTE').reduce((s, t) => s + t.credit, 0).toFixed(2)),
    generatedAt: new Date().toISOString(),
  };
}

export async function generateSupplierStatement(organisationId: string, supplierId: string, query: StatementQuery) {
  return buildSupplierStatement(organisationId, supplierId, query.from, query.to);
}

export async function emailSupplierStatement(organisationId: string, supplierId: string, input: EmailStatementInput) {
  const statement = await buildSupplierStatement(organisationId, supplierId, input.from, input.to);

  const recipientEmail = input.toEmail ?? statement.supplier.email;
  if (!recipientEmail) throw new ValidationError('Supplier has no email address. Provide a toEmail override.');

  const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const rows = statement.transactions.map((t) => `
    <tr style="background:${t.type === 'INVOICE' ? '#fff' : '#f8fffe'}">
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px">${fmtDate(t.date)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#6b7280">${t.reference}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px">${t.description}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;text-align:right">${t.debit > 0 ? fmtAmt(t.debit) : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;text-align:right;color:#16a34a">${t.credit > 0 ? fmtAmt(t.credit) : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-weight:600">${fmtAmt(t.balance)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:700px;margin:0 auto;padding:20px">
<div style="border-bottom:3px solid #1d4ed8;padding-bottom:16px;margin-bottom:20px">
  <h2 style="margin:0;font-size:22px;color:#1d4ed8">${statement.organisation.name}</h2>
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280">Supplier Account Statement</p>
</div>
<table style="width:100%;margin-bottom:20px"><tr>
  <td style="vertical-align:top">
    <p style="margin:0;font-size:13px;font-weight:600">${statement.supplier.name}</p>
    <p style="margin:2px 0;font-size:12px;color:#6b7280">${statement.supplier.code}</p>
    ${statement.supplier.email ? `<p style="margin:2px 0;font-size:12px;color:#6b7280">${statement.supplier.email}</p>` : ''}
  </td>
  <td style="text-align:right;vertical-align:top">
    <p style="margin:0;font-size:12px"><strong>Statement Period:</strong> ${fmtDate(statement.period.from)} – ${fmtDate(statement.period.to)}</p>
    <p style="margin:4px 0 0;font-size:12px"><strong>Generated:</strong> ${fmtDate(statement.generatedAt.split('T')[0])}</p>
    <p style="margin:4px 0 0;font-size:12px"><strong>Currency:</strong> ${statement.currency}</p>
  </td>
</tr></table>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  <thead><tr style="background:#1d4ed8;color:white">
    <th style="padding:8px 10px;text-align:left;font-size:12px">Date</th>
    <th style="padding:8px 10px;text-align:left;font-size:12px">Reference</th>
    <th style="padding:8px 10px;text-align:left;font-size:12px">Description</th>
    <th style="padding:8px 10px;text-align:right;font-size:12px">Invoiced (${statement.currency})</th>
    <th style="padding:8px 10px;text-align:right;font-size:12px">Paid/Credit (${statement.currency})</th>
    <th style="padding:8px 10px;text-align:right;font-size:12px">Balance (${statement.currency})</th>
  </tr></thead>
  <tr style="background:#f1f5f9">
    <td colspan="5" style="padding:6px 10px;font-size:12px;font-weight:600">Opening Balance</td>
    <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:600">${fmtAmt(statement.openingBalance)}</td>
  </tr>
  ${rows}
  <tr style="background:#1e3a5f;color:white">
    <td colspan="5" style="padding:8px 10px;font-size:13px;font-weight:700">Closing Balance (owed to supplier)</td>
    <td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:700">${statement.currency} ${fmtAmt(statement.closingBalance)}</td>
  </tr>
</table>
<p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px">
  This is an automated statement from ${statement.organisation.name}. Please contact us if you have any queries.
</p>
</body></html>`;

  await sendEmail(recipientEmail, `Supplier Statement – ${statement.supplier.name} – ${fmtDate(statement.period.from)} to ${fmtDate(statement.period.to)}`, html);

  return { sentTo: recipientEmail, period: statement.period };
}
