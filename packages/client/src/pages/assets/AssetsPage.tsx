import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Play } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listAssets, createAsset, runDepreciation } from '@/services/assets.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const ASSET_CATEGORIES = [
  'Land',
  'Buildings & Structures',
  'Leasehold Improvements',
  'Plant & Machinery',
  'Equipment',
  'Office Equipment',
  'Computer Hardware',
  'Computer Software',
  'Motor Vehicles',
  'Furniture & Fittings',
  'Tools & Instruments',
  'Right-of-Use Assets (IFRS 16)',
  'Investment Property',
  'Biological Assets',
  'Intangible Assets',
  'Other Fixed Assets',
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  FULLY_DEPRECIATED: 'warning',
  DISPOSED: 'secondary',
};

function NewAssetDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', category: 'Equipment',
    acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: '',
    residualValue: '0',
    usefulLifeMonths: '60',
    depreciationMethod: 'STRAIGHT_LINE',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => createAsset(organisationId, {
      ...form,
      acquisitionCost: Number(form.acquisitionCost),
      residualValue: Number(form.residualValue),
      usefulLifeMonths: Number(form.usefulLifeMonths),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Asset</Button>
      </DialogTrigger>
      <DialogContent title="Add Fixed Asset" description="Register a new asset in the fixed asset register.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="FA001" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Category</label>
              <Select value={form.category} onChange={(e) => set('category', e.target.value)} className="h-8 text-xs">
                {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Asset description" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Acquisition Date</label>
              <Input type="date" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Cost *</label>
              <Input type="number" value={form.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} placeholder="0.00" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Residual Value</label>
              <Input type="number" value={form.residualValue} onChange={(e) => set('residualValue', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Useful Life (months)</label>
              <Input type="number" value={form.usefulLifeMonths} onChange={(e) => set('usefulLifeMonths', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Method</label>
              <Select value={form.depreciationMethod} onChange={(e) => set('depreciationMethod', e.target.value)} className="h-8 text-xs">
                <option value="STRAIGHT_LINE">Straight Line</option>
                <option value="REDUCING_BALANCE">Reducing Balance</option>
              </Select>
            </div>
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.code || !form.name || !form.acquisitionCost || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save Asset'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RunDepreciationDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: periods } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: open,
  });
  const [periodId, setPeriodId] = useState('');
  const asOfDate = new Date().toISOString().split('T')[0];

  const mutation = useMutation({
    mutationFn: () => runDepreciation(organisationId, { periodId, asOfDate }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      alert(`Depreciation run complete: ${data.processed} assets processed.`);
      setOpen(false);
    },
  });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Play size={14} /> Run Depreciation</Button>
      </DialogTrigger>
      <DialogContent title="Run Depreciation" description="Generate monthly depreciation entries for all active assets.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">Select period…</option>
              {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">As of date: <strong>{asOfDate}</strong></p>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!periodId || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Running…' : 'Run Now'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssetsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['assets', activeOrganisationId, statusFilter],
    queryFn: () => listAssets(activeOrganisationId!, { status: statusFilter || undefined }),
    enabled: !!activeOrganisationId,
  });

  const assets = (data?.assets ?? []).filter(
    (a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Package size={18} /> Fixed Assets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} assets</p>
        </div>
        <div className="flex gap-2">
          {activeOrganisationId && <RunDepreciationDialog organisationId={activeOrganisationId} />}
          {activeOrganisationId && <NewAssetDialog organisationId={activeOrganisationId} />}
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search assets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-xs"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40 h-8 text-xs">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FULLY_DEPRECIATED">Fully Depreciated</option>
          <option value="DISPOSED">Disposed</option>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : assets.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No assets found. Add your first fixed asset above.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Accum. Deprn</TableHead>
                  <TableHead className="text-right">Carrying Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">{a.code}</TableCell>
                    <TableCell className="text-sm font-medium">{a.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.category}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.depreciationMethod.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right text-xs">{Number(a.acquisitionCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{Number(a.accumulatedDeprn).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{Number(a.carryingValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[a.status] ?? 'secondary'}>{a.status.replace(/_/g, ' ')}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
