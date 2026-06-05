import { Prisma, ApprovalEntityType } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import * as approvalService from '../approvals/approval.service';
import { createAuditLog, auditLog } from '../audit-trail/audit.service';
import { sendEmail } from '../../config/email';
import type {
  CreateCustomerInput, UpdateCustomerInput, ListCustomersQuery,
  CreateInvoiceInput, ListInvoicesQuery, RecordPaymentInput,
  CreateCreditNoteInput, WriteBadDebtInput, StatementQuery, EmailStatementInput,
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

// Fields whose change is governed by master-data approval.
const CUSTOMER_SENSITIVE_FIELDS = ['name', 'taxId', 'paymentTerms', 'creditLimit'] as const;

export async function createCustomer(organisationId: string, input: CreateCustomerInput, userId?: string) {
  const exists = await prisma.customer.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (exists) throw new ConflictError(`Customer code '${input.code}' already exists`);

  const customer = await prisma.customer.create({
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

  auditLog({
    organisationId, userId, action: 'Created', module: 'AR', entityType: 'Customer',
    entityId: customer.id, entityRef: customer.code,
    description: `Created customer ${customer.code} – ${customer.name}`,
    after: { code: customer.code, name: customer.name, taxId: customer.taxId },
  });

  // Master-data governance: if a CUSTOMER approval workflow is active, the new
  // customer stays inactive (cannot be invoiced) until approved.
  if (userId) {
    const { hasWorkflow } = await approvalService.createMasterDataApprovalRequest(
      organisationId, ApprovalEntityType.CUSTOMER, customer.id, 'CREATE', undefined, userId,
    );
    if (hasWorkflow) {
      const pending = await prisma.customer.update({
        where: { id: customer.id },
        data: { approvalStatus: 'PENDING_APPROVAL', isActive: false },
      });
      auditLog({
        organisationId, userId, action: 'SubmittedForApproval', module: 'AR', entityType: 'Customer',
        entityId: customer.id, entityRef: customer.code,
        description: `Customer ${customer.code} submitted for approval — inactive until approved`,
      });
      return pending;
    }
  }
  return customer;
}

export async function updateCustomer(organisationId: string, customerId: string, input: UpdateCustomerInput, userId?: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organisationId, isDeleted: false },
  });
  if (!customer) throw new NotFoundError('Customer not found');
  if (customer.approvalStatus === 'PENDING_APPROVAL') {
    throw new ValidationError('This customer already has a change awaiting approval. Resolve that first.');
  }

  const current: Record<string, unknown> = {
    name: customer.name, taxId: customer.taxId, paymentTerms: customer.paymentTerms,
    creditLimit: customer.creditLimit != null ? Number(customer.creditLimit) : null,
  };
  const sensitiveChanges: Record<string, unknown> = {};
  for (const f of CUSTOMER_SENSITIVE_FIELDS) {
    const next = (input as Record<string, unknown>)[f];
    if (next !== undefined && JSON.stringify(next) !== JSON.stringify(current[f])) {
      sensitiveChanges[f] = next;
    }
  }

  // Apply routine (non-governed) changes immediately.
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue | undefined,
    },
  });

  const hasSensitive = Object.keys(sensitiveChanges).length > 0;
  if (hasSensitive && userId) {
    const { hasWorkflow } = await approvalService.createMasterDataApprovalRequest(
      organisationId, ApprovalEntityType.CUSTOMER, customerId, 'UPDATE',
      sensitiveChanges as Prisma.InputJsonValue, userId,
    );
    if (hasWorkflow) {
      await prisma.customer.update({ where: { id: customerId }, data: { approvalStatus: 'PENDING_APPROVAL' } });
      auditLog({
        organisationId, userId, action: 'ChangeSubmittedForApproval', module: 'AR', entityType: 'Customer',
        entityId: customerId, entityRef: customer.code,
        description: `Customer ${customer.code} sensitive change staged for approval`,
        before: current, after: sensitiveChanges,
      });
      return { ...updated, approvalStatus: 'PENDING_APPROVAL' as const };
    }
  }

  const final = hasSensitive
    ? await prisma.customer.update({
        where: { id: customerId },
        data: {
          name: sensitiveChanges.name as string | undefined,
          taxId: sensitiveChanges.taxId as string | undefined,
          paymentTerms: sensitiveChanges.paymentTerms as number | undefined,
          creditLimit: sensitiveChanges.creditLimit != null ? new Prisma.Decimal(sensitiveChanges.creditLimit as number) : undefined,
        },
      })
    : updated;

  auditLog({
    organisationId, userId, action: 'Updated', module: 'AR', entityType: 'Customer',
    entityId: final.id, entityRef: final.code,
    description: `Updated customer ${final.code} – ${final.name}`,
    before: current,
    after: { name: final.name, taxId: final.taxId, paymentTerms: final.paymentTerms, creditLimit: final.creditLimit != null ? Number(final.creditLimit) : null },
  });

  return final;
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

  const created = await prisma.invoice.create({
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

  auditLog({
    organisationId, userId, action: 'Created', module: 'AR', entityType: 'Invoice',
    entityId: created.id, entityRef: created.invoiceNumber,
    description: `Created invoice ${created.invoiceNumber} for ${customer.name} – ${created.currency} ${Number(created.totalAmount).toFixed(2)} (${created.status})`,
    after: { invoiceNumber: created.invoiceNumber, customer: customer.name, totalAmount: Number(created.totalAmount), status: created.status },
  });

  return created;
}

export async function postInvoice(organisationId: string, invoiceId: string, periodId: string, userId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organisationId },
    include: { lines: true, customer: true },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status !== 'APPROVED') throw new ValidationError(`Invoice must be approved before posting. Current status: ${invoice.status}`);

  const arAccount = await prisma.account.findFirst({
    where: { organisationId, type: 'RECEIVABLE', isActive: true, isDeleted: false },
  });
  if (!arAccount) throw new ValidationError('No AR control account found. Create an account with type RECEIVABLE.');

  const entryDate = invoice.invoiceDate.toISOString().split('T')[0];
  const invoiceTotalTax = Number(invoice.taxAmount);

  // ── VAT GL account resolution ─────────────────────────────────────────────
  // Build map: VAT GL account id → accumulated tax amount
  const vatGlById = new Map<string, number>();

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
          vatGlById.set(glAccountId, (vatGlById.get(glAccountId) ?? 0) + lineTax);
        } else {
          fallbackVatAmount += lineTax;
        }
      }
    } else {
      fallbackVatAmount = invoiceTotalTax;
    }

    if (fallbackVatAmount > 0) {
      const fallbackVatAccount = await prisma.account.findFirst({
        where: { organisationId, type: 'TAX_PAYABLE', isActive: true, isDeleted: false },
        orderBy: { code: 'asc' },
      });
      if (!fallbackVatAccount) {
        throw new ValidationError(
          'Invoice has tax but no Output VAT account (type: TAX_PAYABLE) was found. ' +
          'Create a VAT Payable account or assign a GL account to your tax codes.',
        );
      }
      vatGlById.set(fallbackVatAccount.id, (vatGlById.get(fallbackVatAccount.id) ?? 0) + fallbackVatAmount);
    }
  }

  // ── Revenue lines (net of tax) ────────────────────────────────────────────
  const revenueLines = invoice.lines.filter((l) => l.accountId);

  const revenueJournalLines: Array<{
    accountId: string; description: string;
    debitAmount: number; creditAmount: number;
    currency: string; exchangeRate: number;
  }> = revenueLines.length > 0
    ? revenueLines.map((l) => ({
        accountId: l.accountId!,
        description: l.description,
        debitAmount: 0,
        creditAmount: Number(l.lineTotal) - Number(l.taxAmount), // net of VAT
        currency: invoice.currency,
        exchangeRate: Number(invoice.exchangeRate),
      }))
    : await (async () => {
        const revenueAccount = await prisma.account.findFirst({
          where: { organisationId, class: 'REVENUE', isActive: true, isDeleted: false, isControlAccount: false },
          orderBy: { code: 'asc' },
        });
        if (!revenueAccount) throw new ValidationError('No revenue account found. Assign a non-control revenue account to invoice lines.');
        return [{
          accountId: revenueAccount.id,
          description: `Sales – ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: Number(invoice.subtotal), // net subtotal, excl. VAT
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        }];
      })();

  const vatJournalLines = Array.from(vatGlById.entries()).map(([accountId, amount]) => ({
    accountId,
    description: `Output VAT – ${invoice.invoiceNumber}`,
    debitAmount: 0,
    creditAmount: amount,
    currency: invoice.currency,
    exchangeRate: Number(invoice.exchangeRate),
  }));

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
          debitAmount: Number(invoice.totalAmount),
          creditAmount: 0,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
        },
        ...revenueJournalLines,
        ...vatJournalLines,
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

  auditLog({
    organisationId, userId, action: 'Recorded payment', module: 'AR', entityType: 'Payment',
    entityId: journalEntry.id, entityRef: invoice.invoiceNumber,
    description: `Recorded payment of ${invoice.currency} ${amount.toFixed(2)} against invoice ${invoice.invoiceNumber} (${invoice.customer.name})`,
    after: { invoiceNumber: invoice.invoiceNumber, amount: Number(amount), newStatus, amountPaid: Number(newAmountPaid) },
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
        where: { organisationId, class: 'REVENUE', isActive: true, isDeleted: false, isControlAccount: false },
        orderBy: { code: 'asc' },
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

  // ── VAT split on credit note ──────────────────────────────────────────────
  const invoiceTotalTax = Number(invoice.taxAmount);
  const invoiceTotal = Number(invoice.totalAmount);
  const creditAmount = Number(amount);

  let vatOnCredit = 0;
  let vatGlAccountId: string | null = null;

  if (invoiceTotalTax > 0 && invoiceTotal > 0) {
    vatOnCredit = Math.round((creditAmount * invoiceTotalTax / invoiceTotal) * 10000) / 10000;

    const taxCodes = [...new Set(
      invoice.lines
        .filter((l) => Number(l.taxAmount) > 0 && l.taxCode)
        .map((l) => l.taxCode!),
    )];

    if (taxCodes.length > 0) {
      const taxCodeRecord = await prisma.taxCode.findFirst({
        where: { organisationId, code: { in: taxCodes }, glAccountId: { not: null }, isActive: true },
        select: { glAccountId: true },
      });
      vatGlAccountId = taxCodeRecord?.glAccountId ?? null;
    }

    if (!vatGlAccountId) {
      const fallbackVatAccount = await prisma.account.findFirst({
        where: { organisationId, type: 'TAX_PAYABLE', isActive: true, isDeleted: false },
        orderBy: { code: 'asc' },
      });
      if (!fallbackVatAccount) {
        throw new ValidationError(
          'Cannot issue credit note with VAT: no Output VAT account (type: TAX_PAYABLE) found.',
        );
      }
      vatGlAccountId = fallbackVatAccount.id;
    }
  }

  const netCredit = creditAmount - vatOnCredit;
  const cnNumber = await nextCreditNoteNumber(organisationId);

  const cnLines: Array<{
    accountId: string; description: string;
    debitAmount: number; creditAmount: number;
    currency: string; exchangeRate: number;
  }> = [
    {
      accountId: revenueAccountId,
      description: `Credit Note – ${invoice.invoiceNumber}`,
      debitAmount: netCredit,
      creditAmount: 0,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
    },
  ];

  if (vatOnCredit > 0 && vatGlAccountId) {
    cnLines.push({
      accountId: vatGlAccountId,
      description: `Output VAT Reversal – ${invoice.invoiceNumber}`,
      debitAmount: vatOnCredit,
      creditAmount: 0,
      currency: invoice.currency,
      exchangeRate: Number(invoice.exchangeRate),
    });
  }

  cnLines.push({
    accountId: arAccount.id,
    description: `AR Credit – ${invoice.invoiceNumber}`,
    debitAmount: 0,
    creditAmount: creditAmount,
    currency: invoice.currency,
    exchangeRate: Number(invoice.exchangeRate),
  });

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
      lines: cnLines,
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
      where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, isControlAccount: false, name: { contains: 'bad debt', mode: 'insensitive' } },
    });
    if (badDebtAccount) {
      expenseAccountId = badDebtAccount.id;
    } else {
      const fallbackExpense = await prisma.account.findFirst({
        where: { organisationId, class: 'EXPENSE', isActive: true, isDeleted: false, isControlAccount: false },
        orderBy: { code: 'asc' },
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

// ─── Customer Statement ───────────────────────────────────────────────────────

interface StatementLine {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

async function buildStatement(organisationId: string, customerId: string, from: string, to: string) {
  const [customer, org] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, organisationId, isDeleted: false } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, baseCurrency: true, address: true, email: true, phone: true } }),
  ]);
  if (!customer) throw new NotFoundError('Customer not found');

  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T23:59:59Z');

  // Get all posted invoices for this customer (all time, to compute opening balance)
  const invoices = await prisma.invoice.findMany({
    where: { organisationId, customerId, status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] } },
    orderBy: { invoiceDate: 'asc' },
  });

  // Get all payment journal entries referencing this customer
  const paymentEntries = await prisma.journalEntry.findMany({
    where: {
      organisationId,
      type: 'CASH_RECEIPT',
      status: 'POSTED',
      description: { contains: customer.name },
    },
    include: { lines: true },
    orderBy: { entryDate: 'asc' },
  });

  // Get all credit note journal entries referencing this customer
  const creditNoteEntries = await prisma.journalEntry.findMany({
    where: {
      organisationId,
      type: 'GENERAL',
      status: 'POSTED',
      reference: { startsWith: 'CN-' },
      description: { contains: customer.name },
    },
    include: { lines: true },
    orderBy: { entryDate: 'asc' },
  });

  type RawTx = { date: Date; type: StatementLine['type']; reference: string; description: string; amount: number; isDebit: boolean };

  const allTxs: RawTx[] = [
    ...invoices.map((inv) => ({
      date: inv.invoiceDate,
      type: 'INVOICE' as const,
      reference: inv.invoiceNumber,
      description: `Sales Invoice – ${inv.invoiceNumber}`,
      amount: Number(inv.totalAmount),
      isDebit: true,
    })),
    ...paymentEntries.map((je) => ({
      date: je.entryDate,
      type: 'PAYMENT' as const,
      reference: je.reference ?? je.journalNumber,
      description: je.description,
      amount: je.lines.reduce((s, l) => s + Number(l.creditAmount), 0),
      isDebit: false,
    })),
    ...creditNoteEntries.map((je) => ({
      date: je.entryDate,
      type: 'CREDIT_NOTE' as const,
      reference: je.reference ?? je.journalNumber,
      description: je.description,
      amount: je.lines.reduce((s, l) => s + Number(l.creditAmount), 0),
      isDebit: false,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const preTxs = allTxs.filter((t) => t.date < fromDate);
  const periodTxs = allTxs.filter((t) => t.date >= fromDate && t.date <= toDate);

  const openingBalance = preTxs.reduce((bal, t) => bal + (t.isDebit ? t.amount : -t.amount), 0);

  let balance = openingBalance;
  const transactions: StatementLine[] = periodTxs.map((t) => {
    const debit = t.isDebit ? t.amount : 0;
    const credit = t.isDebit ? 0 : t.amount;
    balance = balance + debit - credit;
    return { date: t.date.toISOString().split('T')[0], type: t.type, reference: t.reference, description: t.description, debit, credit, balance };
  });

  return {
    customer: { id: customer.id, name: customer.name, code: customer.code, email: customer.email, phone: customer.phone, address: customer.address },
    organisation: { name: org?.name ?? '', currency: org?.baseCurrency ?? 'USD', address: org?.address, email: org?.email },
    period: { from, to },
    currency: org?.baseCurrency ?? 'USD',
    openingBalance: Number(openingBalance.toFixed(2)),
    transactions,
    closingBalance: Number(balance.toFixed(2)),
    totalInvoiced: Number(transactions.reduce((s, t) => s + t.debit, 0).toFixed(2)),
    totalPayments: Number(transactions.filter((t) => t.type === 'PAYMENT').reduce((s, t) => s + t.credit, 0).toFixed(2)),
    totalCredits: Number(transactions.filter((t) => t.type === 'CREDIT_NOTE').reduce((s, t) => s + t.credit, 0).toFixed(2)),
    generatedAt: new Date().toISOString(),
  };
}

export async function generateCustomerStatement(organisationId: string, customerId: string, query: StatementQuery) {
  return buildStatement(organisationId, customerId, query.from, query.to);
}

export async function emailCustomerStatement(organisationId: string, customerId: string, input: EmailStatementInput) {
  const statement = await buildStatement(organisationId, customerId, input.from, input.to);

  const recipientEmail = input.toEmail ?? statement.customer.email;
  if (!recipientEmail) throw new ValidationError('Customer has no email address. Provide a toEmail override.');

  const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const rowColor = (type: string) => type === 'INVOICE' ? '#fff' : '#f8fffe';

  const rows = statement.transactions.map((t) => `
    <tr style="background:${rowColor(t.type)}">
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
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280">Customer Account Statement</p>
</div>
<table style="width:100%;margin-bottom:20px"><tr>
  <td style="vertical-align:top">
    <p style="margin:0;font-size:13px;font-weight:600">${statement.customer.name}</p>
    <p style="margin:2px 0;font-size:12px;color:#6b7280">${statement.customer.code}</p>
    ${statement.customer.email ? `<p style="margin:2px 0;font-size:12px;color:#6b7280">${statement.customer.email}</p>` : ''}
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
    <th style="padding:8px 10px;text-align:right;font-size:12px">Charges (${statement.currency})</th>
    <th style="padding:8px 10px;text-align:right;font-size:12px">Credits (${statement.currency})</th>
    <th style="padding:8px 10px;text-align:right;font-size:12px">Balance (${statement.currency})</th>
  </tr></thead>
  <tr style="background:#f1f5f9">
    <td colspan="5" style="padding:6px 10px;font-size:12px;font-weight:600">Opening Balance</td>
    <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:600">${fmtAmt(statement.openingBalance)}</td>
  </tr>
  ${rows}
  <tr style="background:#1e3a5f;color:white">
    <td colspan="5" style="padding:8px 10px;font-size:13px;font-weight:700">Closing Balance</td>
    <td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:700">${statement.currency} ${fmtAmt(statement.closingBalance)}</td>
  </tr>
</table>
<p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px">
  This is an automated statement from ${statement.organisation.name}. Please contact us if you have any queries.
</p>
</body></html>`;

  await sendEmail(recipientEmail, `Account Statement – ${statement.customer.name} – ${fmtDate(statement.period.from)} to ${fmtDate(statement.period.to)}`, html);

  return { sentTo: recipientEmail, period: statement.period };
}
