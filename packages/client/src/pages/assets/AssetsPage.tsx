import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Play, Eye, ChevronRight, RotateCcw, Trash2, TrendingUp, AlertTriangle, Settings } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as assetSvc from '@/services/assets.service';
import { listPeriods } from '@/services/periods.service';
import { listAccounts } from '@/services/accounts.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const ASSET_CATEGORIES = [
  'Land', 'Buildings & Structures', 'Leasehold Improvements', 'Plant & Machinery',
  'Equipment', 'Office Equipment', 'Computer Hardware', 'Computer Software',
  'Motor Vehicles', 'Furniture & Fittings', 'Tools & Instruments',
  'Right-of-Use Assets (IFRS 16)', 'Investment Property', 'Biological Assets',
  'Intangible Assets', 'Other Fixed Assets',
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  FULLY_DEPRECIATED: 'warning',
  DISPOSED: 'secondary',
};

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'An error occurred';
}

// ─── New Asset Dialog ────────────────────────────────────────────────────────

function NewAssetDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', category: 'Equipment', categoryId: '',
    serialNumber: '', location: '',
    acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: '', residualValue: '0',
    usefulLifeMonths: '60', depreciationMethod: 'STRAIGHT_LINE',
    unitsOfProductionTotal: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: categories = [] } = useQuery({
    queryKey: ['asset-categories', organisationId],
    queryFn: () => assetSvc.listCategories(organisationId),
    enabled: open,
  });

  const onCategoryChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      setForm((f) => ({
        ...f,
        categoryId: catId,
        category: cat.name,
        depreciationMethod: cat.defaultDepreciationMethod,
        usefulLifeMonths: cat.defaultUsefulLifeMonths ? String(cat.defaultUsefulLifeMonths) : f.usefulLifeMonths,
      }));
    } else {
      setForm((f) => ({ ...f, categoryId: '', category: catId }));
    }
  };

  const mutation = useMutation({
    mutationFn: () => assetSvc.createAsset(organisationId, {
      ...form,
      acquisitionCost: Number(form.acquisitionCost),
      residualValue: Number(form.residualValue),
      usefulLifeMonths: Number(form.usefulLifeMonths),
      categoryId: form.categoryId || undefined,
      unitsOfProductionTotal: form.unitsOfProductionTotal ? Number(form.unitsOfProductionTotal) : undefined,
      serialNumber: form.serialNumber || undefined,
      location: form.location || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assets'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Asset</Button></DialogTrigger>
      <DialogContent title="Add Fixed Asset" description="Register a new asset in the fixed asset register.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="FA001" className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Category</label>
              {categories.length > 0 ? (
                <Select value={form.categoryId} onChange={(e) => onCategoryChange(e.target.value)} className="h-8 text-xs">
                  <option value="">— Select category —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </Select>
              ) : (
                <Select value={form.category} onChange={(e) => set('category', e.target.value)} className="h-8 text-xs">
                  {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}</div>
          </div>
          <div><label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Asset description" className="h-8 text-xs" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Serial Number</label>
              <Input value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} placeholder="SN-001" className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Location</label>
              <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Head Office" className="h-8 text-xs" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Acquisition Date</label>
              <Input type="date" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Cost *</label>
              <Input type="number" value={form.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} placeholder="0.00" className="h-8 text-xs" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Residual Value</label>
              <Input type="number" value={form.residualValue} onChange={(e) => set('residualValue', e.target.value)} className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Useful Life (months)</label>
              <Input type="number" value={form.usefulLifeMonths} onChange={(e) => set('usefulLifeMonths', e.target.value)} className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Method</label>
              <Select value={form.depreciationMethod} onChange={(e) => set('depreciationMethod', e.target.value)} className="h-8 text-xs">
                <option value="STRAIGHT_LINE">Straight Line</option>
                <option value="REDUCING_BALANCE">Reducing Balance</option>
                <option value="SUM_OF_YEARS_DIGITS">Sum of Years Digits</option>
                <option value="UNITS_OF_PRODUCTION">Units of Production</option>
              </Select></div>
          </div>
          {form.depreciationMethod === 'UNITS_OF_PRODUCTION' && (
            <div><label className="text-xs font-medium mb-1 block">Total Production Units *</label>
              <Input type="number" value={form.unitsOfProductionTotal} onChange={(e) => set('unitsOfProductionTotal', e.target.value)} placeholder="100000" className="h-8 text-xs" /></div>
          )}
          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
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

// ─── Depreciation Run Dialog (with preview) ──────────────────────────────────

function DepreciationRunDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [preview, setPreview] = useState<{ entries: Array<{ assetCode: string; assetName: string; amount: string }>; totalAmount: string } | null>(null);
  const asOfDate = new Date().toISOString().split('T')[0];

  const { data: periods } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: open,
  });

  const previewMutation = useMutation({
    mutationFn: () => assetSvc.previewDepreciation(organisationId, { periodId, asOfDate }),
    onSuccess: (data) => { setPreview(data); setStep('preview'); },
  });

  const runMutation = useMutation({
    mutationFn: () => assetSvc.runDepreciation(organisationId, { periodId, asOfDate }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assets'] }); void qc.invalidateQueries({ queryKey: ['deprn-runs'] }); setOpen(false); setStep('form'); setPreview(null); },
  });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep('form'); setPreview(null); } }}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Play size={14} /> Run Depreciation</Button></DialogTrigger>
      <DialogContent title="Depreciation Run" description="Preview and post monthly depreciation for all active assets.">
        {step === 'form' ? (
          <div className="space-y-3">
            <div><label className="text-xs font-medium mb-1 block">Accounting Period *</label>
              <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                <option value="">Select period…</option>
                {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select></div>
            <p className="text-xs text-muted-foreground">As of date: <strong>{asOfDate}</strong></p>
            {previewMutation.isError && <p className="text-xs text-destructive">{errMsg(previewMutation.error)}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
              <Button size="sm" variant="outline" disabled={!periodId || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
                <Eye size={14} /> {previewMutation.isPending ? 'Previewing…' : 'Preview'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{preview?.entries.length ?? 0} assets · Total <strong>{fmt(preview?.totalAmount ?? 0)}</strong></p>
            <div className="max-h-60 overflow-y-auto border rounded text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0"><tr><th className="px-3 py-1.5 text-left">Code</th><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-right">Amount</th></tr></thead>
                <tbody>{(preview?.entries ?? []).map((e, i) => (
                  <tr key={i} className="border-t"><td className="px-3 py-1.5 font-mono">{e.assetCode}</td><td className="px-3 py-1.5">{e.assetName}</td><td className="px-3 py-1.5 text-right">{fmt(e.amount)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {runMutation.isError && <p className="text-xs text-destructive">{errMsg(runMutation.error)}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setStep('form')}>Back</Button>
              <Button size="sm" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
                {runMutation.isPending ? 'Posting…' : 'Post Depreciation'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Asset Detail Panel ──────────────────────────────────────────────────────

function AssetDetailPanel({ organisationId, assetId, onClose }: { organisationId: string; assetId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'info' | 'history' | 'revalue' | 'impair' | 'dispose'>('info');
  const [periodId, setPeriodId] = useState('');

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => assetSvc.getAsset(organisationId, assetId),
  });

  const { data: periods } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts', organisationId],
    queryFn: () => listAccounts(organisationId),
  });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');
  const bankAccounts = (accounts ?? []).filter((a: { type: string }) => a.type === 'BANK' || a.type === 'CASH');

  // Revalue form
  const [revalForm, setRevalForm] = useState({ fairValue: '', revaluationDate: new Date().toISOString().split('T')[0], notes: '' });
  const revalMutation = useMutation({
    mutationFn: () => assetSvc.revalueAsset(organisationId, assetId, {
      revaluationDate: revalForm.revaluationDate,
      fairValue: Number(revalForm.fairValue),
      periodId,
      notes: revalForm.notes || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset', assetId] }); void qc.invalidateQueries({ queryKey: ['assets'] }); setTab('info'); },
  });

  // Impairment form
  const [impairForm, setImpairForm] = useState({ impairmentAmount: '', impairmentDate: new Date().toISOString().split('T')[0], notes: '' });
  const impairMutation = useMutation({
    mutationFn: () => assetSvc.impairAsset(organisationId, assetId, {
      impairmentDate: impairForm.impairmentDate,
      impairmentAmount: Number(impairForm.impairmentAmount),
      periodId,
      notes: impairForm.notes || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset', assetId] }); void qc.invalidateQueries({ queryKey: ['assets'] }); setTab('info'); },
  });

  // Dispose form
  const [disposeForm, setDisposeForm] = useState({ disposalDate: new Date().toISOString().split('T')[0], disposalProceeds: '0', bankAccountId: '' });
  const disposeMutation = useMutation({
    mutationFn: () => assetSvc.disposeAsset(organisationId, assetId, {
      disposalDate: disposeForm.disposalDate,
      disposalProceeds: Number(disposeForm.disposalProceeds),
      periodId,
      bankAccountId: disposeForm.bankAccountId || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset', assetId] }); void qc.invalidateQueries({ queryKey: ['assets'] }); onClose(); },
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!asset) return null;

  const nbv = Number(asset.carryingValue);
  const cost = Number(asset.acquisitionCost);
  const accDeprn = Number(asset.accumulatedDeprn);
  const impairment = Number(asset.impairmentLoss);
  const pctDepreciated = cost > 0 ? ((cost - nbv) / cost) * 100 : 0;

  return (
    <div className="border-l bg-background flex flex-col h-full min-w-0">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{asset.code}</p>
          <h2 className="text-sm font-semibold">{asset.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[asset.status] ?? 'secondary'}>{asset.status.replace(/_/g, ' ')}</Badge>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b text-xs">
        {(['info', 'history', 'revalue', 'impair', 'dispose'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize font-medium ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'revalue' ? 'Revaluation' : t === 'impair' ? 'Impairment' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {tab === 'info' && (
          <>
            {/* NBV progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Net Book Value</span>
                <span>{pctDepreciated.toFixed(1)}% depreciated</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${100 - pctDepreciated}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[['Cost', fmt(cost)], ['Accum. Deprn', fmt(accDeprn)], ['Carrying Value', fmt(nbv)]].map(([label, val]) => (
                <div key={label} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold">{val}</p>
                </div>
              ))}
            </div>
            {impairment > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs">
                <span className="font-medium text-destructive">Cumulative Impairment: </span>{fmt(impairment)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                ['Category', asset.category],
                ['Method', asset.depreciationMethod.replace(/_/g, ' ')],
                ['Useful Life', `${asset.usefulLifeMonths} months`],
                ['Months Elapsed', asset.depreciationMonthsElapsed],
                ['Residual Value', fmt(asset.residualValue)],
                ['Acquisition Date', new Date(asset.acquisitionDate).toLocaleDateString()],
                ...(asset.serialNumber ? [['Serial Number', asset.serialNumber]] : []),
                ...(asset.location ? [['Location', asset.location]] : []),
                ...(asset.lastDeprnDate ? [['Last Depreciation', new Date(asset.lastDeprnDate).toLocaleDateString()]] : []),
              ].map(([k, v]) => (
                <div key={String(k)}><span className="text-muted-foreground">{k}: </span><span className="font-medium">{String(v)}</span></div>
              ))}
            </div>
          </>
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            {(asset.revaluations ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">REVALUATIONS</p>
                <div className="space-y-2">
                  {(asset.revaluations ?? []).map((r) => (
                    <div key={r.id} className="border rounded-lg p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>{new Date(r.revaluationDate).toLocaleDateString()}</span>
                        <Badge variant={Number(r.surplusDeficit) >= 0 ? 'success' : 'destructive'}>
                          {Number(r.surplusDeficit) >= 0 ? '+' : ''}{fmt(r.surplusDeficit)}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">Fair value: {fmt(r.fairValue)} · Previous CV: {fmt(r.previousCarryingValue)}</div>
                      {r.notes && <div className="text-muted-foreground italic">{r.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(asset.impairments ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">IMPAIRMENTS</p>
                <div className="space-y-2">
                  {(asset.impairments ?? []).map((imp) => (
                    <div key={imp.id} className="border rounded-lg p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>{new Date(imp.impairmentDate).toLocaleDateString()}</span>
                        <Badge variant="destructive">-{fmt(imp.impairmentAmount)}</Badge>
                      </div>
                      <div className="text-muted-foreground">CV before: {fmt(imp.previousCarryingValue)} → after: {fmt(imp.newCarryingValue)}</div>
                      {imp.notes && <div className="text-muted-foreground italic">{imp.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(asset.revaluations ?? []).length === 0 && (asset.impairments ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No revaluation or impairment history.</p>
            )}
          </div>
        )}

        {tab === 'revalue' && asset.status !== 'DISPOSED' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Revalue the asset to fair value per IAS 16. Surplus posts to the Revaluation Reserve (equity); deficit reduces the reserve.</p>
            <div><label className="text-xs font-medium mb-1 block">Accounting Period *</label>
              <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-8 text-xs">
                <option value="">Select period…</option>
                {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium mb-1 block">Revaluation Date *</label>
                <Input type="date" value={revalForm.revaluationDate} onChange={(e) => setRevalForm((f) => ({ ...f, revaluationDate: e.target.value }))} className="h-8 text-xs" /></div>
              <div><label className="text-xs font-medium mb-1 block">Fair Value *</label>
                <Input type="number" value={revalForm.fairValue} onChange={(e) => setRevalForm((f) => ({ ...f, fairValue: e.target.value }))} placeholder="0.00" className="h-8 text-xs" /></div>
            </div>
            {revalForm.fairValue && (
              <div className={`text-xs p-2 rounded ${Number(revalForm.fairValue) > nbv ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {Number(revalForm.fairValue) > nbv ? 'Surplus' : 'Deficit'}: {fmt(Math.abs(Number(revalForm.fairValue) - nbv))} · Note: accumulated depreciation will be reset.
              </div>
            )}
            <div><label className="text-xs font-medium mb-1 block">Notes</label>
              <Input value={revalForm.notes} onChange={(e) => setRevalForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Basis of valuation…" className="h-8 text-xs" /></div>
            {revalMutation.isError && <p className="text-xs text-destructive">{errMsg(revalMutation.error)}</p>}
            <Button size="sm" className="w-full" disabled={!periodId || !revalForm.fairValue || revalMutation.isPending} onClick={() => revalMutation.mutate()}>
              <TrendingUp size={14} /> {revalMutation.isPending ? 'Posting…' : 'Post Revaluation'}
            </Button>
          </div>
        )}

        {tab === 'impair' && asset.status !== 'DISPOSED' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Record an impairment loss per IAS 36. Posts Dr Impairment Loss / Cr Asset. Current carrying value: <strong>{fmt(nbv)}</strong></p>
            <div><label className="text-xs font-medium mb-1 block">Accounting Period *</label>
              <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-8 text-xs">
                <option value="">Select period…</option>
                {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium mb-1 block">Impairment Date *</label>
                <Input type="date" value={impairForm.impairmentDate} onChange={(e) => setImpairForm((f) => ({ ...f, impairmentDate: e.target.value }))} className="h-8 text-xs" /></div>
              <div><label className="text-xs font-medium mb-1 block">Impairment Amount *</label>
                <Input type="number" value={impairForm.impairmentAmount} onChange={(e) => setImpairForm((f) => ({ ...f, impairmentAmount: e.target.value }))} placeholder="0.00" className="h-8 text-xs" /></div>
            </div>
            <div><label className="text-xs font-medium mb-1 block">Notes</label>
              <Input value={impairForm.notes} onChange={(e) => setImpairForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Reason for impairment…" className="h-8 text-xs" /></div>
            {impairMutation.isError && <p className="text-xs text-destructive">{errMsg(impairMutation.error)}</p>}
            <Button size="sm" className="w-full" variant="destructive" disabled={!periodId || !impairForm.impairmentAmount || impairMutation.isPending} onClick={() => impairMutation.mutate()}>
              <AlertTriangle size={14} /> {impairMutation.isPending ? 'Posting…' : 'Record Impairment'}
            </Button>
          </div>
        )}

        {tab === 'dispose' && asset.status !== 'DISPOSED' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Dispose of this asset. The system will calculate gain/loss automatically. Carrying value: <strong>{fmt(nbv)}</strong></p>
            <div><label className="text-xs font-medium mb-1 block">Accounting Period *</label>
              <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-8 text-xs">
                <option value="">Select period…</option>
                {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium mb-1 block">Disposal Date *</label>
                <Input type="date" value={disposeForm.disposalDate} onChange={(e) => setDisposeForm((f) => ({ ...f, disposalDate: e.target.value }))} className="h-8 text-xs" /></div>
              <div><label className="text-xs font-medium mb-1 block">Proceeds</label>
                <Input type="number" value={disposeForm.disposalProceeds} onChange={(e) => setDisposeForm((f) => ({ ...f, disposalProceeds: e.target.value }))} placeholder="0.00" className="h-8 text-xs" /></div>
            </div>
            {disposeForm.disposalProceeds && (
              <div className={`text-xs p-2 rounded ${Number(disposeForm.disposalProceeds) >= nbv ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {Number(disposeForm.disposalProceeds) >= nbv ? 'Gain on disposal' : 'Loss on disposal'}: {fmt(Math.abs(Number(disposeForm.disposalProceeds) - nbv))}
              </div>
            )}
            <div><label className="text-xs font-medium mb-1 block">Bank Account (if proceeds received)</label>
              <Select value={disposeForm.bankAccountId} onChange={(e) => setDisposeForm((f) => ({ ...f, bankAccountId: e.target.value }))} className="h-8 text-xs">
                <option value="">None</option>
                {bankAccounts.map((a: { id: string; name: string; code: string }) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Select></div>
            {disposeMutation.isError && <p className="text-xs text-destructive">{errMsg(disposeMutation.error)}</p>}
            <Button size="sm" className="w-full" variant="destructive" disabled={!periodId || disposeMutation.isPending} onClick={() => disposeMutation.mutate()}>
              <Trash2 size={14} /> {disposeMutation.isPending ? 'Posting…' : 'Dispose Asset'}
            </Button>
          </div>
        )}

        {(tab === 'revalue' || tab === 'impair' || tab === 'dispose') && asset.status === 'DISPOSED' && (
          <p className="text-sm text-muted-foreground text-center py-8">This asset has been disposed and cannot be modified.</p>
        )}
      </div>
    </div>
  );
}

// ─── Categories Tab ──────────────────────────────────────────────────────────

function CategoriesTab({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', defaultDepreciationMethod: 'STRAIGHT_LINE', defaultUsefulLifeMonths: '60', capitalisationThreshold: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['asset-categories', organisationId],
    queryFn: () => assetSvc.listCategories(organisationId),
  });

  const mutation = useMutation({
    mutationFn: () => assetSvc.createCategory(organisationId, {
      code: form.code, name: form.name,
      description: form.description || undefined,
      defaultDepreciationMethod: form.defaultDepreciationMethod,
      defaultUsefulLifeMonths: form.defaultUsefulLifeMonths ? Number(form.defaultUsefulLifeMonths) : undefined,
      capitalisationThreshold: form.capitalisationThreshold ? Number(form.capitalisationThreshold) : undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-categories'] }); setOpen(false); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{categories.length} categories defined</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Category</Button></DialogTrigger>
          <DialogContent title="Add Asset Category" description="Define a category with default depreciation settings.">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium mb-1 block">Code *</label>
                  <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="EQUIP" className="h-8 text-xs" /></div>
                <div><label className="text-xs font-medium mb-1 block">Name *</label>
                  <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Equipment" className="h-8 text-xs" /></div>
              </div>
              <div><label className="text-xs font-medium mb-1 block">Description</label>
                <Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium mb-1 block">Default Method</label>
                  <Select value={form.defaultDepreciationMethod} onChange={(e) => set('defaultDepreciationMethod', e.target.value)} className="h-8 text-xs">
                    <option value="STRAIGHT_LINE">Straight Line</option>
                    <option value="REDUCING_BALANCE">Reducing Balance</option>
                    <option value="SUM_OF_YEARS_DIGITS">Sum of Years Digits</option>
                    <option value="UNITS_OF_PRODUCTION">Units of Production</option>
                  </Select></div>
                <div><label className="text-xs font-medium mb-1 block">Default Life (mo.)</label>
                  <Input type="number" value={form.defaultUsefulLifeMonths} onChange={(e) => set('defaultUsefulLifeMonths', e.target.value)} className="h-8 text-xs" /></div>
                <div><label className="text-xs font-medium mb-1 block">Capitalisation Threshold</label>
                  <Input type="number" value={form.capitalisationThreshold} onChange={(e) => set('capitalisationThreshold', e.target.value)} placeholder="0.00" className="h-8 text-xs" /></div>
              </div>
              {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
              <div className="flex justify-end gap-2">
                <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
                <Button size="sm" disabled={!form.code || !form.name || mutation.isPending} onClick={() => mutation.mutate()}>
                  {mutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Skeleton className="h-32 w-full" /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Name</TableHead>
            <TableHead>Default Method</TableHead><TableHead>Default Life</TableHead><TableHead>Cap. Threshold</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No categories yet.</TableCell></TableRow>
            ) : categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="text-sm font-medium">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.defaultDepreciationMethod.replace(/_/g, ' ')}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.defaultUsefulLifeMonths ? `${c.defaultUsefulLifeMonths} months` : '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.capitalisationThreshold ? fmt(c.capitalisationThreshold) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── Depreciation Runs Tab ───────────────────────────────────────────────────

function DepreciationRunsTab({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<{ id: string; totalAmount: string } | null>(null);
  const [reversePeriodId, setReversePeriodId] = useState('');
  const [reverseReason, setReverseReason] = useState('');

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['deprn-runs', organisationId],
    queryFn: () => assetSvc.listDepreciationRuns(organisationId),
  });

  const { data: periods } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: reverseOpen,
  });

  const openPeriods = (periods ?? []).filter((p: { status: string }) => p.status === 'OPEN');

  const reverseMutation = useMutation({
    mutationFn: () => assetSvc.reverseDepreciation(organisationId, {
      runId: selectedRun!.id,
      periodId: reversePeriodId,
      reason: reverseReason,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deprn-runs'] });
      void qc.invalidateQueries({ queryKey: ['assets'] });
      setReverseOpen(false);
      setSelectedRun(null);
      setReversePeriodId('');
      setReverseReason('');
    },
  });

  type Run = { id: string; asOfDate: string; processedCount: number; totalAmount: string; status: string };

  return (
    <div className="space-y-4">
      {isLoading ? <Skeleton className="h-32 w-full" /> : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>As-of Date</TableHead>
              <TableHead className="text-right">Assets</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28" />
            </TableRow></TableHeader>
            <TableBody>
              {(runs as Run[]).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No depreciation runs yet.</TableCell></TableRow>
              ) : (runs as Run[]).map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-sm">{new Date(run.asOfDate).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right text-xs">{run.processedCount}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{fmt(run.totalAmount)}</TableCell>
                  <TableCell><Badge variant={run.status === 'POSTED' ? 'success' : 'secondary'}>{run.status}</Badge></TableCell>
                  <TableCell>
                    {run.status === 'POSTED' && (
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setSelectedRun({ id: run.id, totalAmount: run.totalAmount }); setReverseOpen(true); }}>
                        <RotateCcw size={12} /> Reverse
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={reverseOpen} onOpenChange={(v) => { setReverseOpen(v); if (!v) { setSelectedRun(null); setReversePeriodId(''); setReverseReason(''); } }}>
        <DialogContent title="Reverse Depreciation Run" description="Reverses all journal entries from this run and restores asset balances.">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Total amount being reversed: <strong>{fmt(selectedRun?.totalAmount ?? 0)}</strong></p>
            <div><label className="text-xs font-medium mb-1 block">Reversal Period *</label>
              <Select value={reversePeriodId} onChange={(e) => setReversePeriodId(e.target.value)} className="h-8 text-xs">
                <option value="">Select period…</option>
                {openPeriods.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select></div>
            <div><label className="text-xs font-medium mb-1 block">Reason *</label>
              <Input value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Reason for reversal…" className="h-8 text-xs" /></div>
            {reverseMutation.isError && <p className="text-xs text-destructive">{errMsg(reverseMutation.error)}</p>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
              <Button size="sm" variant="destructive" disabled={!reversePeriodId || !reverseReason || reverseMutation.isPending} onClick={() => reverseMutation.mutate()}>
                <RotateCcw size={14} /> {reverseMutation.isPending ? 'Reversing…' : 'Reverse Run'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function AssetsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assets' | 'categories' | 'runs'>('assets');

  const { data, isLoading } = useQuery({
    queryKey: ['assets', activeOrganisationId, statusFilter],
    queryFn: () => assetSvc.listAssets(activeOrganisationId!, { status: statusFilter || undefined }),
    enabled: !!activeOrganisationId,
  });

  const assets = (data?.assets ?? []).filter(
    (a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.code.toLowerCase().includes(search.toLowerCase()),
  );

  // Summary cards
  const totalCost = assets.reduce((s, a) => s + Number(a.acquisitionCost), 0);
  const totalNbv = assets.reduce((s, a) => s + Number(a.carryingValue), 0);
  const activeCount = assets.filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Package size={18} /> Fixed Assets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} assets</p>
        </div>
        <div className="flex gap-2">
          {activeOrganisationId && <DepreciationRunDialog organisationId={activeOrganisationId} />}
          {activeOrganisationId && <NewAssetDialog organisationId={activeOrganisationId} />}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[['Total Cost', fmt(totalCost)], ['Net Book Value', fmt(totalNbv)], ['Active Assets', String(activeCount)]].map(([label, val]) => (
          <Card key={String(label)}><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{val}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b text-sm gap-6">
        {(['assets', 'categories', 'runs'] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`pb-2 capitalize font-medium ${activeTab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'assets' ? `Assets (${data?.total ?? 0})` : t === 'categories' ? <span className="flex items-center gap-1"><Settings size={13} /> Categories</span> : <span className="flex items-center gap-1"><RotateCcw size={13} /> Deprn Runs</span>}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && activeOrganisationId && (
        <CategoriesTab organisationId={activeOrganisationId} />
      )}

      {activeTab === 'runs' && activeOrganisationId && (
        <DepreciationRunsTab organisationId={activeOrganisationId} />
      )}

      {activeTab === 'assets' && (
        <div className={`flex gap-4 ${selectedAssetId ? 'items-start' : ''}`}>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex gap-3">
              <Input placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-8 text-xs" />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44 h-8 text-xs">
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="FULLY_DEPRECIATED">Fully Depreciated</option>
                <option value="DISPOSED">Disposed</option>
              </Select>
            </div>
            <Card><CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : assets.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">No assets found.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Accum. Deprn</TableHead>
                    <TableHead className="text-right">NBV</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-8" />
                  </TableRow></TableHeader>
                  <TableBody>
                    {assets.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedAssetId(a.id === selectedAssetId ? null : a.id)}>
                        <TableCell className="font-mono text-xs font-medium text-muted-foreground">{a.code}</TableCell>
                        <TableCell className="text-sm font-medium">{a.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.category}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.depreciationMethod.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(a.acquisitionCost)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{fmt(a.accumulatedDeprn)}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmt(a.carryingValue)}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[a.status] ?? 'secondary'}>{a.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell><ChevronRight size={14} className={`text-muted-foreground transition-transform ${a.id === selectedAssetId ? 'rotate-90' : ''}`} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </div>

          {selectedAssetId && activeOrganisationId && (
            <div className="w-96 flex-shrink-0 border rounded-lg overflow-hidden" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <AssetDetailPanel
                organisationId={activeOrganisationId}
                assetId={selectedAssetId}
                onClose={() => setSelectedAssetId(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
