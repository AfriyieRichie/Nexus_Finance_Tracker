import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, FileText, TrendingUp, Trash2, Eye, CreditCard, AlertTriangle, Pencil } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listCustomers, createCustomer, updateCustomer,
  createInvoice, listInvoices, getInvoice, postInvoice,
  recordPayment, createCreditNote, writeBadDebt, getArAgeing,
} from '@/services/ar.service';
import type { Customer, Invoice } from '@/services/ar.service';
import { listAccounts } from '@/services/accounts.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
  taxAmount: string;
  accountId: string;
}

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
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
    enabled: open,
  });

  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [arAccountId, setArAccountId] = useState('');
  const [lines, setLines] = useState<InvoiceLineForm[]>([
    { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' },
  ]);

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

  const addLine = () => setLines((l) => [...l, { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof InvoiceLineForm, value: string) =>
    setLines((l) => l.map((line, idx) => (idx === i ? { ...line, [key]: value } : line)));

  const reset = () => {
    setCustomerId(''); setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(''); setCurrency('USD'); setNotes(''); setArAccountId('');
    setLines([{ description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }]);
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
              <Select value={arAccountId} onChange={(e) => setArAccountId(e.target.value)}>
                <option value="">Auto-select first RECEIVABLE account</option>
                {arAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
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
                    <th className="text-left px-2 py-1.5 font-medium">Description</th>
                    <th className="text-right px-2 py-1.5 font-medium w-14">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Unit Price</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20">Tax</th>
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
                          placeholder="Description" className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" />
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
                        <Input type="number" value={line.taxAmount} onChange={(e) => updateLine(i, 'taxAmount', e.target.value)}
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0" />
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-muted-foreground">
                        {(Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(2)}
                      </td>
                      <td className="px-1 py-1">
                        <Select value={line.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)} className="h-7 text-xs">
                          <option value="">Auto</option>
                          {revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </Select>
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

        <div className="flex justify-end gap-2 pt-3 border-t">
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

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'bank-cash'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
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
    mutationFn: () => recordPayment(organisationId, {
      invoiceId: invoice.id,
      amount: Number(amount),
      paymentDate,
      bankAccountId,
      periodId,
      reference: reference || undefined,
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
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setBankAccountId('');
      setPeriodId('');
      setReference('');
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
            <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
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

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
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
    mutationFn: () => createCreditNote(organisationId, {
      invoiceId: invoice.id,
      creditDate,
      periodId,
      amount: Number(amount),
      reason: reason || undefined,
      revenueAccountId: revenueAccountId || undefined,
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
      setCreditDate(new Date().toISOString().split('T')[0]);
      setPeriodId('');
      setReason('');
      setRevenueAccountId('');
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
            <Select value={revenueAccountId} onChange={(e) => setRevenueAccountId(e.target.value)}>
              <option value="">Auto-detect from invoice</option>
              {revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Goods returned, overcharge correction…" className="h-8 text-xs" />
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
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
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
            <Select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>
              <option value="">Auto-detect bad debt expense account</option>
              {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
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

// ─── Post Invoice Button ──────────────────────────────────────────────────────

function PostInvoiceButton({ organisationId, invoiceId, status }: { organisationId: string; invoiceId: string; status: string }) {
  const qc = useQueryClient();
  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: status === 'DRAFT',
  });
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');

  const mutation = useMutation({
    mutationFn: (periodId: string) => postInvoice(organisationId, invoiceId, periodId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ar-invoices'] }),
  });

  if (status !== 'DRAFT') return null;
  if (openPeriods.length === 0) return null;

  return (
    <button
      onClick={() => mutation.mutate(openPeriods[0].id)}
      disabled={mutation.isPending}
      className="text-xs text-primary hover:underline disabled:opacity-50"
    >
      {mutation.isPending ? 'Posting…' : 'Post'}
    </button>
  );
}

// ─── Invoice Actions Cell ─────────────────────────────────────────────────────

function InvoiceActions({ organisationId, invoice }: { organisationId: string; invoice: Invoice }) {
  const canPay = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status);
  const canCredit = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status);
  const canWriteOff = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status);

  return (
    <div className="flex items-center gap-2 justify-end">
      <InvoiceDetailDialog
        organisationId={organisationId}
        invoiceId={invoice.id}
        trigger={
          <button className="text-muted-foreground hover:text-foreground transition-colors" title="View details">
            <Eye size={13} />
          </button>
        }
      />
      <PostInvoiceButton organisationId={organisationId} invoiceId={invoice.id} status={invoice.status} />
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
      {canCredit && (
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
      {canWriteOff && (
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
            {['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
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
                    const isOverdue = inv.status !== 'PAID' && inv.status !== 'VOID' && inv.status !== 'DRAFT' && new Date(inv.dueDate) < new Date();
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
                            <InvoiceActions organisationId={activeOrganisationId} invoice={inv} />
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
                      <TableCell><Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell>
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
