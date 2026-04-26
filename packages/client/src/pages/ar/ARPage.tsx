import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, FileText, TrendingUp, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listCustomers, createCustomer, createInvoice, listInvoices, postInvoice, getArAgeing } from '@/services/ar.service';
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

// ─── New Customer Dialog ──────────────────────────────────────────────────────

function NewCustomerDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');

  const mutation = useMutation({
    mutationFn: () => createCustomer(organisationId, { code, name, email: email || undefined, paymentTerms: Number(paymentTerms) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-customers'] });
      setOpen(false); setCode(''); setName(''); setEmail('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Customer</Button>
      </DialogTrigger>
      <DialogContent title="New Customer" description="Add a new customer to your accounts receivable.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CUST001" className="h-8 text-xs" />
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
          <div>
            <label className="text-xs font-medium mb-1 block">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-xs" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!code || !name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Invoice Dialog ───────────────────────────────────────────────────────

interface InvoiceLine {
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
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' },
  ]);

  const revenueAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.class === 'REVENUE' && a.isActive,
  );
  const arAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.type === 'RECEIVABLE' && a.isActive,
  );
  const [arAccountId, setArAccountId] = useState('');

  const addLine = () => setLines((l) => [...l, { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof InvoiceLine, value: string) =>
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, [key]: value } : line));

  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = lines.reduce((s, l) => s + Number(l.taxAmount || 0), 0);
  const total = subtotal + tax;

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
        description="Create a sales invoice for a customer. Save as draft, then post to record it in the ledger."
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Customer *</label>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
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
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {arAccounts.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">AR Control Account</label>
              <Select value={arAccountId} onChange={(e) => setArAccountId(e.target.value)}>
                <option value="">Auto-select first RECEIVABLE account</option>
                {arAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Invoice Lines *</label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus size={12} /> Add Line</Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium w-40">Description</th>
                    <th className="text-right px-2 py-1.5 font-medium w-16">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Unit Price</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20">Tax</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Line Total</th>
                    <th className="text-left px-2 py-1.5 font-medium">Revenue Account</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-1 py-1">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(i, 'description', e.target.value)}
                          placeholder="Description"
                          className="h-7 text-xs border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={line.taxAmount}
                          onChange={(e) => updateLine(i, 'taxAmount', e.target.value)}
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-muted-foreground">
                        {(Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(2)}
                      </td>
                      <td className="px-1 py-1">
                        <Select
                          value={line.accountId}
                          onChange={(e) => updateLine(i, 'accountId', e.target.value)}
                          className="h-7 text-xs"
                        >
                          <option value="">Auto (first revenue acct)</option>
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
                    <td className="px-2 py-1 text-sm font-bold text-right text-primary">{total.toFixed(2)} {currency}</td>
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

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create invoice'}
            </p>
          )}
          {mutation.isSuccess && (
            <p className="text-xs text-green-600">Invoice created as Draft. Use the Post button in the list to post it to the ledger.</p>
          )}
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

  if (status !== 'DRAFT') {
    return (
      <span
        title="Invoice already posted"
        className="text-xs text-muted-foreground cursor-default select-none"
      >
        Posted
      </span>
    );
  }

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ARPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'invoices' | 'customers' | 'ageing'>('invoices');
  const [search, setSearch] = useState('');

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['ar-invoices', activeOrganisationId],
    queryFn: () => listInvoices(activeOrganisationId!, { pageSize: 50 }),
    enabled: !!activeOrganisationId && tab === 'invoices',
  });

  const { data: customerData, isLoading: customersLoading } = useQuery({
    queryKey: ['ar-customers', activeOrganisationId],
    queryFn: () => listCustomers(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'customers',
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
    (i) => !search || i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || i.customer?.name.toLowerCase().includes(search.toLowerCase()),
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
            {tab === 'invoices' ? `${invoiceData?.total ?? 0} invoices` : tab === 'customers' ? `${customerData?.total ?? 0} customers` : 'AR Ageing Analysis'}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'invoices' && activeOrganisationId && <NewInvoiceDialog organisationId={activeOrganisationId} />}
          {tab === 'customers' && activeOrganisationId && <NewCustomerDialog organisationId={activeOrganisationId} />}
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

      {tab !== 'ageing' && (
        <Input
          placeholder={tab === 'customers' ? 'Search customers…' : 'Search invoices…'}
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
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
                <p className="text-xs text-muted-foreground">Click <strong>New Invoice</strong> above to create one.</p>
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
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{inv.customer?.name ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right text-xs">
                        {(Number(inv.totalAmount) - Number(inv.amountPaid)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[inv.status] ?? 'secondary'}>{inv.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell>
                        {activeOrganisationId && (
                          <PostInvoiceButton organisationId={activeOrganisationId} invoiceId={inv.id} status={inv.status} />
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

      {/* Customers Tab */}
      {tab === 'customers' && (
        <Card>
          <CardContent className="p-0">
            {customersLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No customers yet. Add one above.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">{c.code}</TableCell>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.paymentTerms} days</TableCell>
                      <TableCell><Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
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
                  { label: 'Current', key: 'current' },
                  { label: '1–30 days', key: 'days1_30' },
                  { label: '31–60 days', key: 'days31_60' },
                  { label: '61–90 days', key: 'days61_90' },
                  { label: 'Over 90 days', key: 'over90' },
                ].map(({ label, key }) => (
                  <Card key={key}>
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className="text-lg font-semibold">
                        {Number(ageing.buckets?.[key] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium">Outstanding Invoices</p>
                  <p className="text-xs text-muted-foreground">Grand Total: {Number(ageing.grandTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
                      {(ageing.invoices ?? []).map((inv: { id: string; invoiceNumber: string; customer?: { name: string }; dueDate: string; outstanding: string; bucket: string }) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{inv.customer?.name ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{Number(inv.outstanding).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell><Badge variant={inv.bucket === 'over90' ? 'destructive' : inv.bucket === 'current' ? 'success' : 'warning'}>{inv.bucket.replace(/_/g, ' ')}</Badge></TableCell>
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
