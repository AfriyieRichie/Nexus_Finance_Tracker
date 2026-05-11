import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Play, Eye, ChevronRight, RotateCcw, Trash2, TrendingUp, AlertTriangle, Settings, Download, Upload } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as assetSvc from '@/services/assets.service';
import { listPeriods } from '@/services/periods.service';
import { listAccounts, Account } from '@/services/accounts.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AccountSelect } from '@/components/ui/account-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';


const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  FULLY_DEPRECIATED: 'secondary',
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
    code: '', name: '', category: '', categoryId: '',
    serialNumber: '', location: '',
    acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: '', residualValue: '0',
    usefulLifeMonths: '60', depreciationMethod: 'STRAIGHT_LINE',
    unitsOfProductionTotal: '', acquisitionCreditAccountId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: categories = [] } = useQuery({
    queryKey: ['asset-categories', organisationId],
    queryFn: () => assetSvc.listCategories(organisationId),
    enabled: !!organisationId,
  });

  const { data: bankAccountsData } = useQuery({
    queryKey: ['accounts-bank', organisationId],
    queryFn: () => listAccounts(organisationId, { pageSize: 200 } as Parameters<typeof listAccounts>[1]),
    enabled: open,
  });
  const bankAccounts = (bankAccountsData?.accounts ?? []).filter(
    (a: Account) => (a.type === 'BANK' || a.type === 'CASH' || a.type === 'PAYABLE') && a.isActive && !a.isControlAccount,
  );

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
      acquisitionCreditAccountId: form.acquisitionCreditAccountId || undefined,
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
              <Select value={form.categoryId} onChange={(e) => onCategoryChange(e.target.value)} className="h-8 text-xs" disabled={categories.length === 0}>
                <option value="">{categories.length === 0 ? '— Create a category first —' : '— Select category —'}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </Select>
              {categories.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">No categories defined. Go to the Categories tab to create one with GL accounts before adding assets.</p>
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
          <div>
            <label className="text-xs font-medium mb-1 block">Paid From / Source of Funds <span className="text-muted-foreground font-normal">(optional — auto-posts acquisition journal)</span></label>
            <AccountSelect
              value={form.acquisitionCreditAccountId}
              onChange={(id) => set('acquisitionCreditAccountId', id)}
              accounts={bankAccounts}
              placeholder="— Select to auto-post GL entry —"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">If selected, posts: Dr Asset Cost Account / Cr this account for the acquisition amount.</p>
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
  const [preview, setPreview] = useState<{
    entries: Array<{ assetCode: string; assetName: string; amount: string }>;
    skipped?: Array<{ assetCode: string; assetName: string; reason: string }>;
    totalAmount: string;
  } | null>(null);
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
            <p className="text-xs text-muted-foreground">{preview?.entries.length ?? 0} assets will be depreciated · Total <strong>{fmt(preview?.totalAmount ?? 0)}</strong></p>
            <div className="max-h-48 overflow-y-auto border rounded text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0"><tr><th className="px-3 py-1.5 text-left">Code</th><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-right">Amount</th></tr></thead>
                <tbody>
                  {(preview?.entries ?? []).length === 0
                    ? <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">No assets to depreciate</td></tr>
                    : (preview?.entries ?? []).map((e, i) => (
                        <tr key={i} className="border-t"><td className="px-3 py-1.5 font-mono">{e.assetCode}</td><td className="px-3 py-1.5">{e.assetName}</td><td className="px-3 py-1.5 text-right">{fmt(e.amount)}</td></tr>
                      ))}
                </tbody>
              </table>
            </div>
            {(preview?.skipped ?? []).length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded p-2 space-y-1">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={12} /> {preview!.skipped!.length} asset(s) skipped — GL accounts not configured
                </p>
                {preview!.skipped!.map((s, i) => (
                  <p key={i} className="text-[11px] text-amber-600">
                    <span className="font-mono">{s.assetCode}</span> · {s.assetName}: {s.reason}
                  </p>
                ))}
                <p className="text-[10px] text-amber-500 mt-1">
                  Fix: Set the Depreciation Expense and Accumulated Depreciation accounts on the asset or its category, then re-run.
                </p>
              </div>
            )}
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
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { postingOnly: true }),
  });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');
  const bankAccounts = (accounts?.accounts ?? []).filter((a) => a.type === 'BANK' || a.type === 'CASH');

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

  // Status toggle
  const statusMutation = useMutation({
    mutationFn: (newStatus: 'ACTIVE' | 'INACTIVE') => assetSvc.setAssetStatus(organisationId, assetId, { status: newStatus }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset', assetId] }); void qc.invalidateQueries({ queryKey: ['assets'] }); },
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

            {/* Status toggle — only for ACTIVE / INACTIVE assets */}
            {(asset.status === 'ACTIVE' || asset.status === 'INACTIVE') && (
              <div className={`rounded-lg border p-3 text-xs space-y-2 ${asset.status === 'INACTIVE' ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{asset.status === 'ACTIVE' ? 'Mark as Inactive' : 'Reactivate Asset'}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {asset.status === 'ACTIVE'
                        ? 'Suspends depreciation. Use when asset is damaged, under repair, or temporarily out of service.'
                        : 'Resumes depreciation on the next run. Use when the asset is returned to service.'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={asset.status === 'ACTIVE' ? 'outline' : 'default'}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate(asset.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                  >
                    {statusMutation.isPending ? '…' : asset.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
                {statusMutation.isError && <p className="text-destructive">{errMsg(statusMutation.error)}</p>}
              </div>
            )}
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
              <AccountSelect
                value={disposeForm.bankAccountId}
                onChange={(id) => setDisposeForm((f) => ({ ...f, bankAccountId: id }))}
                accounts={bankAccounts}
                placeholder="None"
              /></div>
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
  const [form, setForm] = useState({
    code: '', name: '', description: '',
    defaultDepreciationMethod: 'STRAIGHT_LINE', defaultUsefulLifeMonths: '60', capitalisationThreshold: '',
    assetCostAccountId: '', depreciationExpenseAccountId: '', accumulatedDepreciationAccountId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['asset-categories', organisationId],
    queryFn: () => assetSvc.listCategories(organisationId),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { postingOnly: true }),
    enabled: open,
  });
  const allAccounts = accountsData?.accounts ?? [];

  const fixedAssetAccounts  = allAccounts.filter((a: Account) => a.type === 'FIXED_ASSET' && !a.isControlAccount && a.isActive);
  const expenseAccounts     = allAccounts.filter((a: Account) => a.class === 'EXPENSE' && !a.isControlAccount && a.isActive);

  const mutation = useMutation({
    mutationFn: () => assetSvc.createCategory(organisationId, {
      code: form.code, name: form.name,
      description: form.description || undefined,
      defaultDepreciationMethod: form.defaultDepreciationMethod,
      defaultUsefulLifeMonths: form.defaultUsefulLifeMonths ? Number(form.defaultUsefulLifeMonths) : undefined,
      capitalisationThreshold: form.capitalisationThreshold ? Number(form.capitalisationThreshold) : undefined,
      assetCostAccountId:               form.assetCostAccountId               || null,
      depreciationExpenseAccountId:     form.depreciationExpenseAccountId     || null,
      accumulatedDepreciationAccountId: form.accumulatedDepreciationAccountId || null,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['asset-categories'] }); setOpen(false); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{categories.length} categories defined</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Category</Button></DialogTrigger>
          <DialogContent title="Add Asset Category" description="Define a category with default depreciation settings and GL accounts.">
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
                <div><label className="text-xs font-medium mb-1 block">Cap. Threshold</label>
                  <Input type="number" value={form.capitalisationThreshold} onChange={(e) => set('capitalisationThreshold', e.target.value)} placeholder="0.00" className="h-8 text-xs" /></div>
              </div>

              {/* GL Accounts — inherited by all assets in this category */}
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                GL Accounts (inherited by all assets in this category)
              </p>
              <div className="border border-amber-200 bg-amber-50 rounded p-2 text-[10px] text-amber-700 mb-1">
                These accounts are used automatically when depreciation runs. Leaving them blank will cause the depreciation run to skip assets in this category.
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Asset Cost Account (FIXED_ASSET type) *</label>
                <AccountSelect
                  value={form.assetCostAccountId}
                  onChange={(id) => set('assetCostAccountId', id)}
                  accounts={fixedAssetAccounts}
                  placeholder="— Select account —"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Accumulated Depreciation Account (FIXED_ASSET contra) *</label>
                <AccountSelect
                  value={form.accumulatedDepreciationAccountId}
                  onChange={(id) => set('accumulatedDepreciationAccountId', id)}
                  accounts={fixedAssetAccounts}
                  placeholder="— Select account —"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Depreciation Expense Account (EXPENSE type) *</label>
                <AccountSelect
                  value={form.depreciationExpenseAccountId}
                  onChange={(id) => set('depreciationExpenseAccountId', id)}
                  accounts={expenseAccounts}
                  placeholder="— Select account —"
                />
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
            <TableHead>Default Method</TableHead><TableHead>Default Life</TableHead>
            <TableHead>GL Accounts</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No categories yet.</TableCell></TableRow>
            ) : categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="text-sm font-medium">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.defaultDepreciationMethod.replace(/_/g, ' ')}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.defaultUsefulLifeMonths ? `${c.defaultUsefulLifeMonths} mo.` : '—'}</TableCell>
                <TableCell className="text-xs">
                  {c.depreciationExpenseAccountId && c.accumulatedDepreciationAccountId
                    ? <span className="text-green-600">✓ Configured</span>
                    : <span className="text-amber-500 flex items-center gap-1"><AlertTriangle size={11} /> Missing GL accounts</span>}
                </TableCell>
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
        </CardContent></Card>
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

// ─── CSV helpers ─────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'Code', 'Name', 'Category', 'Serial Number', 'Location',
  'Acquisition Date', 'Cost', 'Residual Value', 'Useful Life (months)',
  'Depreciation Method', 'Total Production Units',
  'Accumulated Deprn', 'Carrying Value', 'Status',
];

function downloadCSV(assets: assetSvc.FixedAsset[]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = assets.map((a) => [
    a.code, a.name, a.category,
    a.serialNumber ?? '', a.location ?? '',
    new Date(a.acquisitionDate).toISOString().split('T')[0],
    a.acquisitionCost, a.residualValue, a.usefulLifeMonths,
    a.depreciationMethod, a.unitsOfProductionTotal ?? '',
    a.accumulatedDeprn, a.carryingValue, a.status,
  ]);
  const csv = [CSV_HEADERS, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fixed-assets-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (line[i] === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += line[i];
  }
  result.push(cur);
  return result;
}

type ImportRow = {
  code: string; name: string; category: string;
  serialNumber?: string; location?: string;
  acquisitionDate: string; acquisitionCost: number;
  residualValue: number; usefulLifeMonths: number;
  depreciationMethod: string; unitsOfProductionTotal?: number;
  _rowError?: string;
};

const VALID_METHODS = ['STRAIGHT_LINE', 'REDUCING_BALANCE', 'SUM_OF_YEARS_DIGITS', 'UNITS_OF_PRODUCTION'];

function parseAssetsCSV(text: string): { rows: ImportRow[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], errors: ['File has no data rows'] };
  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const get = (vals: string[], header: string) => {
    const idx = headers.indexOf(header);
    return idx >= 0 ? (vals[idx] ?? '').trim() : '';
  };

  const rows: ImportRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const rowErrors: string[] = [];

    const code = get(vals, 'code');
    const name = get(vals, 'name');
    const category = get(vals, 'category');
    const acqDate = get(vals, 'acquisition date');
    const costStr = get(vals, 'cost');
    const residualStr = get(vals, 'residual value') || '0';
    const lifeStr = get(vals, 'useful life (months)');
    const methodRaw = get(vals, 'depreciation method').toUpperCase().replace(/ /g, '_') || 'STRAIGHT_LINE';
    const unitsStr = get(vals, 'total production units');

    if (!code) rowErrors.push('Code required');
    if (!name) rowErrors.push('Name required');
    if (!category) rowErrors.push('Category required');
    if (!acqDate || !/^\d{4}-\d{2}-\d{2}$/.test(acqDate)) rowErrors.push('Acquisition Date must be YYYY-MM-DD');
    const cost = Number(costStr);
    if (!costStr || isNaN(cost) || cost <= 0) rowErrors.push('Cost must be a positive number');
    const life = parseInt(lifeStr);
    if (!lifeStr || isNaN(life) || life <= 0) rowErrors.push('Useful Life must be a positive integer');
    const method = VALID_METHODS.includes(methodRaw) ? methodRaw : null;
    if (!method) rowErrors.push(`Unknown method "${methodRaw}"`);

    const row: ImportRow = {
      code, name, category,
      serialNumber: get(vals, 'serial number') || undefined,
      location: get(vals, 'location') || undefined,
      acquisitionDate: acqDate,
      acquisitionCost: cost,
      residualValue: Number(residualStr) || 0,
      usefulLifeMonths: life,
      depreciationMethod: method ?? 'STRAIGHT_LINE',
      unitsOfProductionTotal: unitsStr ? Number(unitsStr) : undefined,
      _rowError: rowErrors.length > 0 ? rowErrors.join('; ') : undefined,
    };
    rows.push(row);
    if (rowErrors.length > 0) errors.push(`Row ${i}: ${rowErrors.join(', ')}`);
  }
  return { rows, errors };
}

// ─── Import Dialog ───────────────────────────────────────────────────────────

function ImportAssetsDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const reset = () => { setStep('upload'); setRows([]); setParseErrors([]); };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows: r, errors: errs } = parseAssetsCSV(e.target?.result as string);
      setRows(r);
      setParseErrors(errs);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const mutation = useMutation({
    mutationFn: () => assetSvc.bulkCreateAssets(organisationId, rows.filter((r) => !r._rowError)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assets'] }); setOpen(false); reset(); },
  });

  const hasErrors = parseErrors.length > 0;
  const validCount = rows.filter((r) => !r._rowError).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Upload size={14} /> Import</Button></DialogTrigger>
      <DialogContent title="Import Fixed Assets" description="Upload a CSV to bulk-import assets. Use Export to download a template.">
        {step === 'upload' ? (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Required columns: <strong>Code, Name, Category, Acquisition Date (YYYY-MM-DD), Cost, Useful Life (months)</strong></p>
              <p>Optional: Serial Number, Location, Residual Value, Depreciation Method, Total Production Units</p>
              <p>Methods: STRAIGHT_LINE · REDUCING_BALANCE · SUM_OF_YEARS_DIGITS · UNITS_OF_PRODUCTION</p>
            </div>
            <input type="file" accept=".csv"
              className="text-xs block w-full border rounded p-2 cursor-pointer"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs">
              {rows.length} rows parsed ·{' '}
              <span className="text-green-600 font-medium">{validCount} valid</span> ·{' '}
              <span className={hasErrors ? 'text-destructive font-medium' : ''}>{parseErrors.length} errors</span>
            </p>
            {hasErrors && (
              <div className="text-xs text-destructive bg-destructive/10 rounded p-2 max-h-20 overflow-y-auto space-y-0.5">
                {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <div className="max-h-52 overflow-y-auto border rounded text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr><th className="px-2 py-1.5 text-left">Code</th><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Category</th><th className="px-2 py-1.5 text-right">Cost</th><th className="px-2 py-1.5 text-left">Result</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r._rowError ? 'bg-destructive/5' : ''}`}>
                      <td className="px-2 py-1.5 font-mono">{r.code}</td>
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.category}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(r.acquisitionCost)}</td>
                      <td className="px-2 py-1.5">{r._rowError ? <span className="text-destructive">{r._rowError}</span> : <span className="text-green-600">OK</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('upload')}>Back</Button>
              <Button size="sm" disabled={hasErrors || validCount === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Importing…' : `Import ${validCount} Assets`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
          <Button variant="outline" size="sm" onClick={() => downloadCSV(assets)} disabled={assets.length === 0}>
            <Download size={14} /> Export
          </Button>
          {activeOrganisationId && <ImportAssetsDialog organisationId={activeOrganisationId} />}
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
                    <TableHead>Location</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{a.location ?? '—'}</TableCell>
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
