import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Plus, FileText, TrendingDown, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listSuppliers, createSupplier, listSupplierInvoices, createSupplierInvoice, postSupplierInvoice, getApAgeing } from '@/services/ap.service';
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
  DRAFT: 'secondary',
  VOID: 'secondary',
};

function NewSupplierDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');

  const mutation = useMutation({
    mutationFn: () => createSupplier(organisationId, { code, name, email: email || undefined, paymentTerms: Number(paymentTerms) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ap-suppliers'] });
      setOpen(false); setCode(''); setName(''); setEmail('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Supplier</Button>
      </DialogTrigger>
      <DialogContent title="New Supplier" description="Add a new supplier to your accounts payable.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUPP001" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Payment Terms (days)</label>
              <Input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name" className="h-8 text-xs" />
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

// ─── New Supplier Invoice Dialog ─────────────────────────────────────────────

interface InvoiceLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  accountId: string;
}

function NewSupplierInvoiceDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: suppliersData } = useQuery({
    queryKey: ['ap-suppliers', organisationId],
    queryFn: () => listSuppliers(organisationId),
    enabled: open,
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
    enabled: open,
  });

  const [supplierId, setSupplierId] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [apAccountId, setApAccountId] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' },
  ]);

  const expenseAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.class === 'EXPENSE' && a.isActive,
  );
  const apAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.type === 'PAYABLE' && a.isActive,
  );

  const addLine = () => setLines((l) => [...l, { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof InvoiceLine, value: string) =>
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, [key]: value } : line));

  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = lines.reduce((s, l) => s + Number(l.taxAmount || 0), 0);
  const total = subtotal + tax;

  const reset = () => {
    setSupplierId(''); setSupplierRef(''); setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(''); setCurrency('USD'); setNotes(''); setApAccountId('');
    setLines([{ description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }]);
  };

  const mutation = useMutation({
    mutationFn: () => createSupplierInvoice(organisationId, {
      supplierId,
      supplierRef: supplierRef || undefined,
      invoiceDate,
      dueDate: dueDate || invoiceDate,
      currency,
      exchangeRate: 1,
      notes: notes || undefined,
      apAccountId: apAccountId || apAccounts[0]?.id || '',
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
      void qc.invalidateQueries({ queryKey: ['ap-invoices'] });
      setOpen(false);
      reset();
    },
  });

  const canSubmit = supplierId && invoiceDate && lines.every((l) => l.description && Number(l.unitPrice) > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Invoice</Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl"
        title="New Supplier Invoice"
        description="Record a supplier invoice. Save as draft, then post to record it in the ledger."
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Supplier *</label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>
                {(suppliersData?.suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Supplier Reference</label>
              <Input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="Their invoice number" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Invoice Date *</label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Currency</label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            {apAccounts.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-1 block">AP Control Account</label>
                <Select value={apAccountId} onChange={(e) => setApAccountId(e.target.value)}>
                  <option value="">Auto-select first PAYABLE account</option>
                  {apAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Select>
              </div>
            )}
          </div>

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
                    <th className="text-left px-2 py-1.5 font-medium">Expense Account</th>
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
                          <option value="">Auto (first expense acct)</option>
                          {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
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

// ─── Post Supplier Invoice Button ─────────────────────────────────────────────

function PostSupplierInvoiceButton({ organisationId, invoiceId, status }: { organisationId: string; invoiceId: string; status: string }) {
  const qc = useQueryClient();
  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: status === 'DRAFT',
  });
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');

  const mutation = useMutation({
    mutationFn: (periodId: string) => postSupplierInvoice(organisationId, invoiceId, periodId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ap-invoices'] }),
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

export function APPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'invoices' | 'suppliers' | 'ageing'>('invoices');
  const [search, setSearch] = useState('');

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['ap-invoices', activeOrganisationId],
    queryFn: () => listSupplierInvoices(activeOrganisationId!, { pageSize: 50 }),
    enabled: !!activeOrganisationId && tab === 'invoices',
  });

  const { data: supplierData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['ap-suppliers', activeOrganisationId],
    queryFn: () => listSuppliers(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'suppliers',
  });

  const { data: ageing, isLoading: ageingLoading } = useQuery({
    queryKey: ['ap-ageing', activeOrganisationId],
    queryFn: () => getApAgeing(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'ageing',
  });

  const filteredSuppliers = (supplierData?.suppliers ?? []).filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredInvoices = (invoiceData?.invoices ?? []).filter(
    (i) => !search || i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || i.supplier?.name.toLowerCase().includes(search.toLowerCase()),
  );

  const tabs = [
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'suppliers', label: 'Suppliers', icon: ShoppingCart },
    { id: 'ageing', label: 'AP Ageing', icon: TrendingDown },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShoppingCart size={18} /> Accounts Payable
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'invoices' ? `${invoiceData?.total ?? 0} supplier invoices` : tab === 'suppliers' ? `${supplierData?.total ?? 0} suppliers` : 'AP Ageing Analysis'}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'invoices' && activeOrganisationId && <NewSupplierInvoiceDialog organisationId={activeOrganisationId} />}
          {tab === 'suppliers' && activeOrganisationId && <NewSupplierDialog organisationId={activeOrganisationId} />}
        </div>
      </div>

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
          placeholder={tab === 'suppliers' ? 'Search suppliers…' : 'Search invoices…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm h-8 text-xs"
        />
      )}

      {tab === 'invoices' && (
        <Card>
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No supplier invoices yet.</p>
                <p className="text-xs text-muted-foreground">Click <strong>New Invoice</strong> above to record one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Supplier Ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
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
                      <TableCell className="text-sm">{inv.supplier?.name ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{inv.supplierRef ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right text-xs">{(Number(inv.totalAmount) - Number(inv.amountPaid)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[inv.status] ?? 'secondary'}>{inv.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell>
                        {activeOrganisationId && (
                          <PostSupplierInvoiceButton organisationId={activeOrganisationId} invoiceId={inv.id} status={inv.status} />
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

      {tab === 'suppliers' && (
        <Card>
          <CardContent className="p-0">
            {suppliersLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No suppliers found.</div>
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
                  {filteredSuppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">{s.code}</TableCell>
                      <TableCell className="text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.email ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.paymentTerms} days</TableCell>
                      <TableCell><Badge variant={s.isActive ? 'success' : 'secondary'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

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
                      <p className="text-lg font-semibold">{Number(ageing.buckets?.[key] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium">Overdue Payables — Grand Total: {Number(ageing.grandTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Bucket</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ageing.invoices ?? []).map((inv: { id: string; invoiceNumber: string; supplier?: { name: string }; dueDate: string; outstanding: string; bucket: string }) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{inv.supplier?.name ?? '—'}</TableCell>
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
