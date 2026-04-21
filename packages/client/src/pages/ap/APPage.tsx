import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Plus, FileText, TrendingDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listSuppliers, createSupplier, listSupplierInvoices, getApAgeing } from '@/services/ap.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        {tab === 'suppliers' && activeOrganisationId && <NewSupplierDialog organisationId={activeOrganisationId} />}
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
              <div className="py-16 text-center text-sm text-muted-foreground">No supplier invoices found.</div>
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
