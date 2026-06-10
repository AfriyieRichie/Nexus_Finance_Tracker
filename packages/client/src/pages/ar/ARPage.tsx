import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, FileText, TrendingUp, Trash2, Eye, CreditCard, AlertTriangle, Pencil, Send, CheckCircle, XCircle, Clock, BookOpen, Mail, Printer } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listCustomers, createCustomer, updateCustomer,
  createInvoice, listInvoices, getInvoice, postInvoice,
  recordPayment, createCreditNote, writeBadDebt, getArAgeing,
  submitInvoiceForApproval, approveInvoice, rejectInvoice,
  getCustomerStatement, emailCustomerStatement,
} from '@/services/ar.service';
import type { Customer, Invoice, CustomerStatement } from '@/services/ar.service';
import { listAccounts } from '@/services/accounts.service';
import { listTaxCodes } from '@/services/tax.service';
import { AttachmentsDialog } from '@/components/ui/attachments';
import { uploadAttachment } from '@/services/attachments.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AccountSelect } from '@/components/ui/account-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  SENT: 'info',
  OVERDUE: 'destructive',
  DRAFT: 'secondary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  VOID: 'secondary',
};

function fmt(n: number | string) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'An error occurred';
}

// ─── Customer Form Dialog (create & edit) ────────────────────────────────────

function CustomerFormDialog({
  organisationId,
  customer,
  trigger,
}: {
  organisationId: string;
  customer?: Customer;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEdit = !!customer;

  const [code, setCode] = useState(customer?.code ?? '');
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [taxId, setTaxId] = useState(customer?.taxId ?? '');
  const [creditLimit, setCreditLimit] = useState(customer?.creditLimit ? String(Number(customer.creditLimit)) : '');
  const [paymentTerms, setPaymentTerms] = useState(String(customer?.paymentTerms ?? 30));
  const [street, setStreet] = useState(customer?.address?.street ?? '');
  const [city, setCity] = useState(customer?.address?.city ?? '');
  const [country, setCountry] = useState(customer?.address?.country ?? '');

  const reset = () => {
    if (!isEdit) {
      setCode(''); setName(''); setEmail(''); setPhone('');
      setTaxId(''); setCreditLimit(''); setPaymentTerms('30');
      setStreet(''); setCity(''); setCountry('');
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name, email: email || undefined, phone: phone || undefined,
        taxId: taxId || undefined,
        creditLimit: creditLimit ? Number(creditLimit) : undefined,
        paymentTerms: Number(paymentTerms),
        address: (street || city || country) ? { street, city, country } : undefined,
      };
      return isEdit
        ? updateCustomer(organisationId, customer!.id, payload)
        : createCustomer(organisationId, { code, ...payload });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-customers'] });
      setOpen(false);
      reset();
    },
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && isEdit) {
      setCode(customer!.code);
      setName(customer!.name);
      setEmail(customer!.email ?? '');
      setPhone(customer!.phone ?? '');
      setTaxId(customer!.taxId ?? '');
      setCreditLimit(customer!.creditLimit ? String(Number(customer!.creditLimit)) : '');
      setPaymentTerms(String(customer!.paymentTerms));
      setStreet(customer!.address?.street ?? '');
      setCity(customer!.address?.city ?? '');
      setCountry(customer!.address?.country ?? '');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={isEdit ? 'Edit Customer' : 'New Customer'}
        description={isEdit ? 'Update customer details.' : 'Add a new customer to accounts receivable.'}
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CUST001" className="h-8 text-xs" disabled={isEdit} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Payment Terms (days)</label>
              <Input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" className="h-8 text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" className="h-8 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Tax ID / VAT Number</label>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="GB123456789" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Credit Limit</label>
              <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0.00" className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Address</label>
            <div className="space-y-1.5">
              <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" className="h-8 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-8 text-xs" />
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="h-8 text-xs" />
              </div>
            </div>
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!name || (!isEdit && !code) || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Invoice Dialog ───────────────────────────────────────────────────────

interface InvoiceLineForm {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
  taxAmount: string;
  accountId: string;
}

const EMPTY_INVOICE_LINE: InvoiceLineForm = { description: '', quantity: '1', unitPrice: '', taxCode: '', taxAmount: '0', accountId: '' };

function NewInvoiceDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: customersData } = useQuery({
    queryKey: ['ar-customers', organisationId],
    queryFn: () => listCustomers(organisationId),
    enabled: open,
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false, postingOnly: true }),
    enabled: open,
  });

  const { data: taxCodes = [] } = useQuery({
    queryKey: ['tax-codes', organisationId],
    queryFn: () => listTaxCodes(organisationId, true),
    enabled: open,
  });

  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [arAccountId, setArAccountId] = useState('');
  const [lines, setLines] = useState<InvoiceLineForm[]>([{ ...EMPTY_INVOICE_LINE }]);

  const revenueAccounts = (accountsData?.accounts ?? []).filter((a) => a.class === 'REVENUE' && a.isActive);
  const arAccounts = (accountsData?.accounts ?? []).filter((a) => a.type === 'RECEIVABLE' && a.isActive);

  const selectedCustomer = (customersData?.customers ?? []).find((c) => c.id === customerId);
  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = lines.reduce((s, l) => s + Number(l.taxAmount || 0), 0);
  const total = subtotal + tax;
  const creditLimit = selectedCustomer?.creditLimit ? Number(selectedCustomer.creditLimit) : null;
  const creditLimitExceeded = creditLimit !== null && total > creditLimit;

  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    const cust = (customersData?.customers ?? []).find((c) => c.id === id);
    if (cust && invoiceDate) {
      const due = new Date(invoiceDate);
      due.setDate(due.getDate() + cust.paymentTerms);
      setDueDate(due.toISOString().split('T')[0]);
    }
  };

  const handleInvoiceDateChange = (date: string) => {
    setInvoiceDate(date);
    if (selectedCustomer && date) {
      const due = new Date(date);
      due.setDate(due.getDate() + selectedCustomer.paymentTerms);
      setDueDate(due.toISOString().split('T')[0]);
    }
  };

  // Selecting a VAT code (or changing qty/price) auto-computes output VAT = net × rate.
  const recalcTax = (line: InvoiceLineForm): InvoiceLineForm => {
    if (!line.taxCode) return { ...line, taxAmount: '0' };
    const rate = Number(taxCodes.find((t) => t.code === line.taxCode)?.rate ?? 0);
    const net = Number(line.quantity || 0) * Number(line.unitPrice || 0);
    return { ...line, taxAmount: (net * rate / 100).toFixed(2) };
  };

  const addLine = () => setLines((l) => [...l, { ...EMPTY_INVOICE_LINE }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof InvoiceLineForm, value: string) =>
    setLines((l) => l.map((line, idx) => (idx === i ? recalcTax({ ...line, [key]: value }) : line)));

  const reset = () => {
    setCustomerId(''); setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(''); setCurrency('USD'); setNotes(''); setArAccountId('');
    setLines([{ ...EMPTY_INVOICE_LINE }]);
  };

  const mutation = useMutation({
    mutationFn: () => createInvoice(organisationId, {
      customerId,
      invoiceDate,
      dueDate: dueDate || invoiceDate,
      currency,
      exchangeRate: 1,
      notes: notes || undefined,
      arAccountId: arAccountId || arAccounts[0]?.id || '',
      lines: lines.map((l, i) => ({
        lineNumber: i + 1,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxCode: l.taxCode || undefined,
        taxAmount: Number(l.taxAmount),
        accountId: l.accountId || undefined,
      })),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-invoices'] });
      setOpen(false);
      reset();
    },
  });

  const canSubmit = customerId && invoiceDate && lines.every((l) => l.description && Number(l.unitPrice) > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Invoice</Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl"
        title="New Sales Invoice"
        description="Create a sales invoice. Save as draft, then post to record in the ledger."
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Customer *</label>
              <Select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                <option value="">Select customer…</option>
                {(customersData?.customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Currency</label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Invoice Date *</label>
              <Input type="date" value={invoiceDate} onChange={(e) => handleInvoiceDateChange(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">
                Due Date
                {selectedCustomer && (
                  <span className="text-muted-foreground font-normal ml-1">
                    (Net {selectedCustomer.paymentTerms})
                  </span>
                )}
              </label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {selectedCustomer?.creditLimit && (
            <div className={cn(
              'flex items-center gap-2 text-xs px-3 py-2 rounded-md',
              creditLimitExceeded ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
            )}>
              <AlertTriangle size={13} />
              Credit limit: {fmt(selectedCustomer.creditLimit)} {currency}
              {creditLimitExceeded && ' — Invoice total exceeds credit limit'}
            </div>
          )}

          {arAccounts.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">AR Control Account</label>
              <AccountSelect
                value={arAccountId}
                onChange={setArAccountId}
                accounts={arAccounts}
                placeholder="Auto-select first RECEIVABLE account"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Invoice Lines *</label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus size={12} /> Add Line</Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Description <span className="text-destructive">*</span></th>
                    <th className="text-right px-2 py-1.5 font-medium w-14">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Unit Price</th>
                    <th className="text-left px-2 py-1.5 font-medium w-36">VAT</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Total</th>
                    <th className="text-left px-2 py-1.5 font-medium">Revenue Acct</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-1 py-1">
                        <Input value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)}
                          placeholder="Required" className={cn('h-7 text-xs border-0 shadow-none focus-visible:ring-0', !line.description && 'bg-destructive/5 placeholder:text-destructive/60')} />
                      </td>
                      <td className="px-1 py-1">
                        <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0" />
                      </td>
                      <td className="px-1 py-1">
                        <Input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                          placeholder="0.00" className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0" />
                      </td>
                      <td className="px-1 py-1">
                        <Select
                          value={line.taxCode}
                          onChange={(e) => updateLine(i, 'taxCode', e.target.value)}
                          className="h-7 text-xs border-0 shadow-none focus:ring-0 px-1"
                        >
                          <option value="">No VAT</option>
                          {taxCodes.map((tc) => (
                            <option key={tc.id} value={tc.code}>{tc.code} · {Number(tc.rate)}%</option>
                          ))}
                        </Select>
                        {Number(line.taxAmount) > 0 && (
                          <p className="text-[10px] text-muted-foreground text-right pr-1">+{Number(line.taxAmount).toFixed(2)}</p>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-muted-foreground">
                        {(Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(2)}
                      </td>
                      <td className="px-1 py-1">
                        <AccountSelect
                          value={line.accountId}
                          onChange={(id) => updateLine(i, 'accountId', id)}
                          accounts={revenueAccounts}
                          placeholder="Auto"
                        />
                      </td>
                      <td className="px-1 py-1">
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <td colSpan={3} className="px-2 py-1.5 text-xs text-muted-foreground">Subtotal</td>
                    <td className="px-2 py-1.5 text-xs text-right">{tax.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-xs text-right font-semibold">{subtotal.toFixed(2)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-2 py-1 text-xs font-semibold text-right">Total</td>
                    <td className={cn('px-2 py-1 text-sm font-bold text-right', creditLimitExceeded ? 'text-destructive' : 'text-primary')}>
                      {total.toFixed(2)} {currency}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" className="h-8 text-xs" />
          </div>

          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          {!canSubmit && (
            <span className="text-xs text-muted-foreground mr-auto">
              {!customerId ? 'Select a customer' : !invoiceDate ? 'Set invoice date' : 'Each line needs a description and price'}
            </span>
          )}
          <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Save as Draft'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Detail Dialog ────────────────────────────────────────────────────

function InvoiceDetailDialog({ organisationId, invoiceId, trigger }: { organisationId: string; invoiceId: string; trigger: React.ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['ar-invoice', invoiceId],
    queryFn: () => getInvoice(organisationId, invoiceId),
    enabled: open,
  });

  const outstanding = invoice ? Number(invoice.totalAmount) - Number(invoice.amountPaid) : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl" title="Invoice Details" description="">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : invoice ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><p className="text-muted-foreground">Invoice #</p><p className="font-mono font-semibold">{invoice.invoiceNumber}</p></div>
              <div><p className="text-muted-foreground">Customer</p><p className="font-medium">{invoice.customer?.name}</p></div>
              <div><p className="text-muted-foreground">Status</p><Badge variant={STATUS_VARIANT[invoice.status] ?? 'secondary'}>{invoice.status.replace(/_/g, ' ')}</Badge></div>
              <div><p className="text-muted-foreground">Invoice Date</p><p>{new Date(invoice.invoiceDate).toLocaleDateString()}</p></div>
              <div><p className="text-muted-foreground">Due Date</p><p>{new Date(invoice.dueDate).toLocaleDateString()}</p></div>
              <div><p className="text-muted-foreground">Currency</p><p>{invoice.currency}</p></div>
            </div>

            {invoice.lines && invoice.lines.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Unit Price</th>
                      <th className="text-right px-3 py-2 font-medium">Tax</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 text-right">{Number(l.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.taxAmount)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <div className="text-xs space-y-1 w-48">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(invoice.taxAmount)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{fmt(invoice.totalAmount)} {invoice.currency}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Paid</span><span>{fmt(invoice.amountPaid)}</span></div>
                <div className={cn('flex justify-between font-semibold', outstanding > 0 && 'text-destructive')}>
                  <span>Outstanding</span><span>{fmt(outstanding)}</span>
                </div>
              </div>
            </div>

            {invoice.journalEntryId && (
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-muted-foreground">Journal entry posted</span>
                <Button variant="outline" size="sm" onClick={() => { setOpen(false); navigate(`/journals/${invoice.journalEntryId}`); }}>
                  View Journal
                </Button>
              </div>
            )}

            {invoice.notes && (
              <p className="text-xs text-muted-foreground border-t pt-2">Notes: {invoice.notes}</p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Payment Dialog ────────────────────────────────────────────────────

function RecordPaymentDialog({ organisationId, invoice, trigger }: { organisationId: string; invoice: Invoice; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'bank-cash'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false, postingOnly: true }),
    enabled: open,
  });

  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: open,
  });

  const bankAccounts = (accountsData?.accounts ?? []).filter(
    (a) => (a.type === 'BANK' || a.type === 'CASH') && a.isActive,
  );
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await recordPayment(organisationId, {
        invoiceId: invoice.id,
        amount: Number(amount),
        paymentDate,
        bankAccountId,
        periodId,
        reference: reference || undefined,
      }) as { journalEntryId?: string };
      // Attach the receipt to the payment's journal entry (viewable on the journal).
      if (receipt && result.journalEntryId) {
        try { await uploadAttachment(organisationId, 'JOURNAL_ENTRY', result.journalEntryId, receipt); } catch { /* don't fail the payment if the upload fails */ }
      }
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-invoices'] });
      void qc.invalidateQueries({ queryKey: ['ar-ageing'] });
      setOpen(false);
    },
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setAmount(outstanding.toFixed(2));
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setBankAccountId('');
      setPeriodId('');
      setReference('');
      setReceipt(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Record Payment"
        description={`Recording payment for ${invoice.invoiceNumber}. Outstanding: ${fmt(outstanding)} ${invoice.currency}`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Amount *</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                max={outstanding} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Payment Date *</label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Bank / Cash Account *</label>
            <AccountSelect
              value={bankAccountId}
              onChange={setBankAccountId}
              accounts={bankAccounts}
              placeholder="Select account…"
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">Select period…</option>
              {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Reference</label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque / transfer reference" className="h-8 text-xs" />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Receipt / proof of payment <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="h-8 text-xs" />
            {receipt && <p className="text-[10px] text-muted-foreground mt-0.5">{receipt.name} — attaches to this payment's journal entry.</p>}
          </div>

          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
          {mutation.isSuccess && <p className="text-xs text-green-600">Payment recorded successfully.</p>}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm"
              disabled={!amount || !bankAccountId || !periodId || Number(amount) <= 0 || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Recording…' : 'Record Payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credit Note Dialog ───────────────────────────────────────────────────────

function CreditNoteDialog({ organisationId, invoice, trigger }: { organisationId: string; invoice: Invoice; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [creditDate, setCreditDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodId, setPeriodId] = useState('');
  const [reason, setReason] = useState('');
  const [revenueAccountId, setRevenueAccountId] = useState('');
  const [doc, setDoc] = useState<File | null>(null);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false, postingOnly: true }),
    enabled: open,
  });

  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: open,
  });

  const revenueAccounts = (accountsData?.accounts ?? []).filter((a) => a.class === 'REVENUE' && a.isActive);
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await createCreditNote(organisationId, {
        invoiceId: invoice.id,
        creditDate,
        periodId,
        amount: Number(amount),
        reason: reason || undefined,
        revenueAccountId: revenueAccountId || undefined,
      }) as { journalEntryId?: string };
      if (doc && result.journalEntryId) {
        try { await uploadAttachment(organisationId, 'JOURNAL_ENTRY', result.journalEntryId, doc); } catch { /* don't fail the credit note if the upload fails */ }
      }
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-invoices'] });
      void qc.invalidateQueries({ queryKey: ['ar-ageing'] });
      setOpen(false);
    },
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setAmount(outstanding.toFixed(2));
      setCreditDate(new Date().toISOString().split('T')[0]);
      setPeriodId('');
      setReason('');
      setRevenueAccountId('');
      setDoc(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Issue Credit Note"
        description={`Credit note against ${invoice.invoiceNumber}. Max: ${fmt(outstanding)} ${invoice.currency}`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Credit Amount *</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                max={outstanding} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Credit Date *</label>
              <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">Select period…</option>
              {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Revenue Account (optional — auto-detected)</label>
            <AccountSelect
              value={revenueAccountId}
              onChange={setRevenueAccountId}
              accounts={revenueAccounts}
              placeholder="Auto-detect from invoice"
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Goods returned, overcharge correction…" className="h-8 text-xs" />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Supporting document <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} className="h-8 text-xs" />
            {doc && <p className="text-[10px] text-muted-foreground mt-0.5">{doc.name} — attaches to this credit note's journal entry.</p>}
          </div>

          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm"
              disabled={!amount || !periodId || Number(amount) <= 0 || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Issuing…' : 'Issue Credit Note'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bad Debt Write-off Dialog ────────────────────────────────────────────────

function BadDebtDialog({ organisationId, invoice, trigger }: { organisationId: string; invoice: Invoice; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [writeOffDate, setWriteOffDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodId, setPeriodId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false, postingOnly: true }),
    enabled: open,
  });

  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: open,
  });

  const expenseAccounts = (accountsData?.accounts ?? []).filter((a) => a.class === 'EXPENSE' && a.isActive);
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');

  const mutation = useMutation({
    mutationFn: () => writeBadDebt(organisationId, {
      invoiceId: invoice.id,
      writeOffDate,
      periodId,
      amount: Number(amount),
      expenseAccountId: expenseAccountId || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-invoices'] });
      void qc.invalidateQueries({ queryKey: ['ar-ageing'] });
      setOpen(false);
    },
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setAmount(outstanding.toFixed(2));
      setWriteOffDate(new Date().toISOString().split('T')[0]);
      setPeriodId('');
      setExpenseAccountId('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Write Off Bad Debt"
        description={`Write off uncollectible amount on ${invoice.invoiceNumber}. Outstanding: ${fmt(outstanding)} ${invoice.currency}`}
      >
        <div className="space-y-3">
          <div className="p-3 bg-destructive/10 rounded-md text-xs text-destructive">
            This action will void the invoice and post a bad debt expense journal entry. It cannot be undone.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Write-off Amount *</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                max={outstanding} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Write-off Date *</label>
              <Input type="date" value={writeOffDate} onChange={(e) => setWriteOffDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">Select period…</option>
              {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Expense Account (optional — auto-detects Bad Debt account)</label>
            <AccountSelect
              value={expenseAccountId}
              onChange={setExpenseAccountId}
              accounts={expenseAccounts}
              placeholder="Auto-detect bad debt expense account"
            />
          </div>

          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" variant="destructive"
              disabled={!amount || !periodId || Number(amount) <= 0 || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Writing Off…' : 'Write Off'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Customer Statement Dialog ────────────────────────────────────────────────

function printStatement(s: CustomerStatement) {
  const fmtAmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const typeLabel = (t: string) => t === 'INVOICE' ? 'Invoice' : t === 'PAYMENT' ? 'Payment' : 'Credit Note';
  const rows = s.transactions.map((t) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 8px;font-size:12px">${fmtDate(t.date)}</td>
      <td style="padding:6px 8px;font-size:11px;color:#6b7280">${typeLabel(t.type)}</td>
      <td style="padding:6px 8px;font-size:12px;color:#1d4ed8">${t.reference}</td>
      <td style="padding:6px 8px;font-size:11px;max-width:220px">${t.description}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:right">${t.debit > 0 ? fmtAmt(t.debit) : ''}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:right;color:#16a34a">${t.credit > 0 ? fmtAmt(t.credit) : ''}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:right;font-weight:600">${fmtAmt(t.balance)}</td>
    </tr>`).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Statement – ${s.customer.name}</title>
  <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:860px;margin:0 auto}@media print{body{padding:0}}</style>
  </head><body>
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end">
    <div><h2 style="margin:0;font-size:20px;color:#1d4ed8">${s.organisation.name}</h2><p style="margin:4px 0 0;font-size:12px;color:#6b7280">Customer Account Statement</p></div>
    <div style="text-align:right;font-size:12px">
      <div><strong>Period:</strong> ${fmtDate(s.period.from)} – ${fmtDate(s.period.to)}</div>
      <div><strong>Generated:</strong> ${fmtDate(s.generatedAt.split('T')[0])}</div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:20px">
    <div><p style="margin:0;font-size:14px;font-weight:600">${s.customer.name}</p><p style="margin:2px 0;font-size:12px;color:#6b7280">Code: ${s.customer.code}</p>${s.customer.email ? `<p style="margin:2px 0;font-size:12px;color:#6b7280">${s.customer.email}</p>` : ''}</div>
    <div style="text-align:right;font-size:12px"><p style="margin:0"><strong>Currency:</strong> ${s.currency}</p><p style="margin:4px 0 0;font-size:18px;font-weight:700;color:${s.closingBalance > 0 ? '#dc2626' : '#16a34a'}">${s.currency} ${fmtAmt(s.closingBalance)}</p><p style="margin:2px 0;font-size:11px;color:#6b7280">Closing Balance</p></div>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#1d4ed8;color:white">
      <th style="padding:8px;text-align:left;font-size:12px">Date</th>
      <th style="padding:8px;text-align:left;font-size:12px">Type</th>
      <th style="padding:8px;text-align:left;font-size:12px">Reference</th>
      <th style="padding:8px;text-align:left;font-size:12px">Description</th>
      <th style="padding:8px;text-align:right;font-size:12px">Charges</th>
      <th style="padding:8px;text-align:right;font-size:12px">Credits</th>
      <th style="padding:8px;text-align:right;font-size:12px">Balance</th>
    </thead>
    <tr style="background:#f1f5f9;border-bottom:1px solid #e5e7eb">
      <td colspan="6" style="padding:6px 8px;font-size:12px;font-weight:600">Opening Balance</td>
      <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:600">${fmtAmt(s.openingBalance)}</td>
    </tr>
    ${rows}
    <tr style="background:#1e3a5f;color:white">
      <td colspan="6" style="padding:8px;font-size:13px;font-weight:700">Closing Balance</td>
      <td style="padding:8px;text-align:right;font-size:14px;font-weight:700">${s.currency} ${fmtAmt(s.closingBalance)}</td>
    </tr>
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:11px;color:#6b7280">
    <span>Invoiced: ${s.currency} ${fmtAmt(s.totalInvoiced)}</span>
    <span>Payments: ${s.currency} ${fmtAmt(s.totalPayments)}</span>
    <span>Credits: ${s.currency} ${fmtAmt(s.totalCredits)}</span>
  </div>
  <script>window.onload=function(){window.print()}<\/script>
  </body></html>`);
  win.document.close();
}

function CustomerStatementDialog({ organisationId, customer }: { organisationId: string; customer: Customer }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [emailOverride, setEmailOverride] = useState('');
  const [emailSent, setEmailSent] = useState('');

  const { data: statement, isFetching, error, refetch } = useQuery({
    queryKey: ['customer-statement', organisationId, customer.id, from, to],
    queryFn: () => getCustomerStatement(organisationId, customer.id, from, to),
    enabled: open && !!from && !!to && from <= to,
  });

  const emailMutation = useMutation({
    mutationFn: () => emailCustomerStatement(organisationId, customer.id, { from, to, toEmail: emailOverride || undefined }),
    onSuccess: (r) => setEmailSent(r.sentTo),
  });

  const fmtAmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const typeLabel = (t: string) => t === 'INVOICE' ? 'Invoice' : t === 'PAYMENT' ? 'Payment' : 'Credit Note';
  const typeBadgeColor = (t: string) => t === 'INVOICE' ? 'text-primary' : t === 'PAYMENT' ? 'text-green-600' : 'text-amber-600';

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setEmailSent(''); }}>
      <DialogTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Customer statement">
          <BookOpen size={13} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" title={`Statement – ${customer.name}`} description="Account statement showing all transactions in the selected period.">
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 text-xs w-36" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 text-xs w-36" />
            </div>
            <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching} className="h-7 text-xs">
              {isFetching ? 'Loading…' : 'Generate'}
            </Button>
            {statement && (
              <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => printStatement(statement)}>
                <Printer size={12} className="mr-1" /> Print / PDF
              </Button>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-xs text-destructive">{errMsg(error)}</p>}

          {/* Statement */}
          {statement && (
            <div className="space-y-3">
              {/* Header summary */}
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-md border">
                <div>
                  <p className="text-sm font-semibold">{statement.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(statement.period.from)} – {fmtDate(statement.period.to)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Closing Balance</p>
                  <p className={cn('text-lg font-bold', statement.closingBalance > 0 ? 'text-destructive' : 'text-green-600')}>
                    {statement.currency} {fmtAmt(statement.closingBalance)}
                  </p>
                </div>
              </div>

              {/* Transactions table */}
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Reference</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Charges</th>
                      <th className="text-right px-3 py-2 font-medium">Credits</th>
                      <th className="text-right px-3 py-2 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="bg-muted/30 border-t">
                      <td colSpan={6} className="px-3 py-1.5 font-semibold text-xs">Opening Balance</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmtAmt(statement.openingBalance)}</td>
                    </tr>
                    {statement.transactions.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No transactions in this period</td>
                      </tr>
                    ) : (
                      statement.transactions.map((t, i) => (
                        <tr key={i} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDate(t.date)}</td>
                          <td className={cn('px-3 py-1.5 font-medium', typeBadgeColor(t.type))}>{typeLabel(t.type)}</td>
                          <td className="px-3 py-1.5 font-mono text-primary">{t.reference}</td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={t.description}>{t.description}</td>
                          <td className="px-3 py-1.5 text-right">{t.debit > 0 ? fmtAmt(t.debit) : ''}</td>
                          <td className="px-3 py-1.5 text-right text-green-600">{t.credit > 0 ? fmtAmt(t.credit) : ''}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{fmtAmt(t.balance)}</td>
                        </tr>
                      ))
                    )}
                    {/* Closing balance row */}
                    <tr className="border-t bg-primary text-primary-foreground">
                      <td colSpan={6} className="px-3 py-2 font-bold text-xs">Closing Balance</td>
                      <td className="px-3 py-2 text-right font-bold">{statement.currency} {fmtAmt(statement.closingBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals summary */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                {[
                  { label: 'Total Invoiced', value: statement.totalInvoiced, color: 'text-foreground' },
                  { label: 'Total Payments', value: statement.totalPayments, color: 'text-green-600' },
                  { label: 'Total Credits', value: statement.totalCredits, color: 'text-amber-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border rounded-md p-2 text-center">
                    <p className="text-muted-foreground">{label}</p>
                    <p className={cn('font-semibold mt-0.5', color)}>{statement.currency} {fmtAmt(value)}</p>
                  </div>
                ))}
              </div>

              {/* Email section */}
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-xs font-medium">Send by Email</p>
                <div className="flex gap-2">
                  <Input
                    value={emailOverride}
                    onChange={(e) => setEmailOverride(e.target.value)}
                    placeholder={customer.email ?? 'Enter email address…'}
                    className="h-7 text-xs flex-1"
                    type="email"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={emailMutation.isPending || (!emailOverride && !customer.email)}
                    onClick={() => emailMutation.mutate()}
                  >
                    <Mail size={11} className="mr-1" />
                    {emailMutation.isPending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
                {emailSent && <p className="text-xs text-green-600">Statement sent to {emailSent}</p>}
                {emailMutation.isError && <p className="text-xs text-destructive">{errMsg(emailMutation.error)}</p>}
                {!customer.email && !emailOverride && (
                  <p className="text-xs text-muted-foreground">This customer has no email on file. Enter an address above to send.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Actions Cell ─────────────────────────────────────────────────────

function InvoiceActions({ organisationId, invoice }: { organisationId: string; invoice: Invoice }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const userRole = activeOrg?.role ?? '';
  const isManager = ['ORG_ADMIN', 'FINANCE_MANAGER'].includes(userRole);

  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: invoice.status === 'APPROVED',
  });
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');
  // Post into the open period that contains the invoice date; fall back to the
  // latest open period so an invoice never silently lands in the wrong month.
  const invDate = new Date(invoice.invoiceDate);
  const targetPeriod =
    openPeriods.find((p) => new Date(p.startDate) <= invDate && invDate <= new Date(p.endDate)) ??
    [...openPeriods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () => submitInvoiceForApproval(organisationId, invoice.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ar-invoices'] }),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveInvoice(organisationId, invoice.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ar-invoices'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectInvoice(organisationId, invoice.id, rejectReason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ar-invoices'] }); setShowRejectInput(false); setRejectReason(''); },
  });

  const postMutation = useMutation({
    mutationFn: (periodId: string) => postInvoice(organisationId, invoice.id, periodId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ar-invoices'] }),
  });

  const canPay = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status);

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      <InvoiceDetailDialog
        organisationId={organisationId}
        invoiceId={invoice.id}
        trigger={
          <button className="text-muted-foreground hover:text-foreground transition-colors" title="View details">
            <Eye size={13} />
          </button>
        }
      />

      {/* DRAFT: submit for approval */}
      {invoice.status === 'DRAFT' && (
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
          title="Submit for approval"
        >
          <Send size={11} />
          {submitMutation.isPending ? 'Submitting…' : 'Submit'}
        </button>
      )}

      {/* PENDING_APPROVAL: managers can approve or reject */}
      {invoice.status === 'PENDING_APPROVAL' && isManager && !showRejectInput && (
        <>
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="text-xs text-green-600 hover:underline disabled:opacity-50 flex items-center gap-1"
            title="Approve invoice"
          >
            <CheckCircle size={11} />
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={() => setShowRejectInput(true)}
            className="text-xs text-destructive hover:underline flex items-center gap-1"
            title="Reject invoice"
          >
            <XCircle size={11} /> Reject
          </button>
        </>
      )}

      {/* PENDING_APPROVAL: rejection reason input inline */}
      {invoice.status === 'PENDING_APPROVAL' && isManager && showRejectInput && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason…"
            className="text-xs border rounded px-2 py-0.5 w-36 h-6"
          />
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            className="text-xs text-destructive hover:underline disabled:opacity-40"
          >
            {rejectMutation.isPending ? '…' : 'Confirm'}
          </button>
          <button onClick={() => setShowRejectInput(false)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
        </div>
      )}

      {/* PENDING_APPROVAL: waiting badge for non-managers */}
      {invoice.status === 'PENDING_APPROVAL' && !isManager && (
        <span className="text-xs text-amber-600 flex items-center gap-1" title="Awaiting manager approval">
          <Clock size={11} /> Pending
        </span>
      )}

      {/* APPROVED: managers can post to ledger */}
      {invoice.status === 'APPROVED' && isManager && (
        targetPeriod ? (
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={() => postMutation.mutate(targetPeriod.id)}
              disabled={postMutation.isPending}
              title={`Post to ${targetPeriod.name}`}
              className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1 font-medium"
            >
              <CheckCircle size={11} />
              {postMutation.isPending ? 'Posting…' : 'Post'}
            </button>
            {postMutation.isError && (
              <span className="text-[10px] text-destructive max-w-[220px] text-right leading-tight">
                {(postMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to post'}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-amber-600" title="No open accounting period — open one in Settings → Periods">No open period</span>
        )
      )}

      {/* Payment, credit note, bad debt — post-ledger actions */}
      {canPay && (
        <RecordPaymentDialog
          organisationId={organisationId}
          invoice={invoice}
          trigger={
            <button className="text-xs text-green-600 hover:underline" title="Record payment">
              <CreditCard size={13} />
            </button>
          }
        />
      )}
      {canPay && (
        <CreditNoteDialog
          organisationId={organisationId}
          invoice={invoice}
          trigger={
            <button className="text-xs text-amber-600 hover:underline" title="Issue credit note">
              <FileText size={13} />
            </button>
          }
        />
      )}
      {canPay && (
        <BadDebtDialog
          organisationId={organisationId}
          invoice={invoice}
          trigger={
            <button className="text-xs text-destructive hover:underline" title="Write off bad debt">
              <AlertTriangle size={13} />
            </button>
          }
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ARPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'invoices' | 'customers' | 'ageing'>('invoices');
  const [search, setSearch] = useState('');

  // Invoice filters
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['ar-invoices', activeOrganisationId, { statusFilter, customerFilter, fromFilter, toFilter }],
    queryFn: () => listInvoices(activeOrganisationId!, {
      status: statusFilter || undefined,
      customerId: customerFilter || undefined,
      from: fromFilter || undefined,
      to: toFilter || undefined,
      pageSize: 100,
    }),
    enabled: !!activeOrganisationId && tab === 'invoices',
  });

  const { data: customerData, isLoading: customersLoading } = useQuery({
    queryKey: ['ar-customers', activeOrganisationId],
    queryFn: () => listCustomers(activeOrganisationId!),
    enabled: !!activeOrganisationId && (tab === 'customers' || tab === 'invoices'),
  });

  const { data: ageing, isLoading: ageingLoading } = useQuery({
    queryKey: ['ar-ageing', activeOrganisationId],
    queryFn: () => getArAgeing(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'ageing',
  });

  const filteredCustomers = (customerData?.customers ?? []).filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredInvoices = (invoiceData?.invoices ?? []).filter(
    (i) => !search || i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || (i.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const tabs = [
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'ageing', label: 'AR Ageing', icon: TrendingUp },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users size={18} /> Accounts Receivable
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'invoices'
              ? `${invoiceData?.total ?? 0} invoices`
              : tab === 'customers'
              ? `${customerData?.total ?? 0} customers`
              : 'AR Ageing Analysis'}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'invoices' && activeOrganisationId && <NewInvoiceDialog organisationId={activeOrganisationId} />}
          {tab === 'customers' && activeOrganisationId && (
            <CustomerFormDialog
              organisationId={activeOrganisationId}
              trigger={<Button size="sm"><Plus size={14} /> New Customer</Button>}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSearch(''); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Invoice filters */}
      {tab === 'invoices' && (
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search invoices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-xs"
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs w-40">
            <option value="">All statuses</option>
            {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </Select>
          <Select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="h-8 text-xs w-44">
            <option value="">All customers</option>
            {(customerData?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} className="h-8 text-xs w-36" placeholder="From" />
          <Input type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} className="h-8 text-xs w-36" placeholder="To" />
          {(statusFilter || customerFilter || fromFilter || toFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setCustomerFilter(''); setFromFilter(''); setToFilter(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Customer search */}
      {tab === 'customers' && (
        <Input
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm h-8 text-xs"
        />
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <Card>
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No invoices found.</p>
                {!statusFilter && !customerFilter && !fromFilter && !toFilter && (
                  <p className="text-xs text-muted-foreground">Click <strong>New Invoice</strong> above to create one.</p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => {
                    const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
                    const isOverdue = !['PAID', 'VOID', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(inv.status) && new Date(inv.dueDate) < new Date();
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-sm">{inv.customer?.name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                        <TableCell className={cn('text-xs', isOverdue && 'text-destructive font-medium')}>
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmt(inv.totalAmount)} {inv.currency}</TableCell>
                        <TableCell className={cn('text-right text-xs font-medium', outstanding > 0 && inv.status !== 'VOID' && 'text-destructive')}>
                          {outstanding > 0 ? fmt(outstanding) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isOverdue && inv.status !== 'PAID' ? 'destructive' : STATUS_VARIANT[inv.status] ?? 'secondary'}>
                            {isOverdue && inv.status !== 'PAID' ? 'OVERDUE' : inv.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {activeOrganisationId && (
                            <div className="flex items-center justify-end gap-1">
                              <AttachmentsDialog organisationId={activeOrganisationId} entityType="SALES_INVOICE" entityId={inv.id} label={inv.invoiceNumber} />
                              <InvoiceActions organisationId={activeOrganisationId} invoice={inv} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customers Tab */}
      {tab === 'customers' && (
        <Card>
          <CardContent className="p-0">
            {customersLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No customers yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Terms</TableHead>
                    <TableHead className="text-right">Credit Limit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">{c.code}</TableCell>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.phone ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.paymentTerms}d</TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {c.creditLimit ? fmt(c.creditLimit) : '—'}
                      </TableCell>
                      <TableCell>
                        {c.approvalStatus === 'PENDING_APPROVAL'
                          ? <Badge variant="warning">Pending approval</Badge>
                          : <Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {activeOrganisationId && (
                            <AttachmentsDialog organisationId={activeOrganisationId} entityType="CUSTOMER" entityId={c.id} label={`${c.code} KYC`} />
                          )}
                          {activeOrganisationId && (
                            <CustomerStatementDialog organisationId={activeOrganisationId} customer={c} />
                          )}
                          {activeOrganisationId && (
                            <CustomerFormDialog
                              organisationId={activeOrganisationId}
                              customer={c}
                              trigger={
                                <button className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Edit customer">
                                  <Pencil size={13} />
                                </button>
                              }
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ageing Tab */}
      {tab === 'ageing' && (
        <div className="space-y-4">
          {ageingLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : ageing ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Current', key: 'current', variant: 'success' as const },
                  { label: '1–30 days', key: 'days1_30', variant: 'warning' as const },
                  { label: '31–60 days', key: 'days31_60', variant: 'warning' as const },
                  { label: '61–90 days', key: 'days61_90', variant: 'destructive' as const },
                  { label: 'Over 90 days', key: 'over90', variant: 'destructive' as const },
                ].map(({ label, key, variant }) => (
                  <Card key={key}>
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className={cn('text-lg font-semibold', Number(ageing.buckets?.[key] ?? 0) > 0 && (variant === 'destructive' ? 'text-destructive' : variant === 'warning' ? 'text-amber-600' : ''))}>
                        {fmt(ageing.buckets?.[key] ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium">Outstanding Invoices</p>
                  <p className="text-xs text-muted-foreground">Grand Total: {fmt(ageing.grandTotal ?? 0)}</p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Bucket</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ageing.invoices ?? []).map((inv: {
                        id: string; invoiceNumber: string; customer?: { name: string };
                        dueDate: string; outstanding: string; bucket: string; currency: string;
                      }) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{inv.customer?.name ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmt(inv.outstanding)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.bucket === 'over90' || inv.bucket === 'days61_90' ? 'destructive' : inv.bucket === 'current' ? 'success' : 'warning'}>
                              {inv.bucket.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
