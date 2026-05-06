import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Plus, Globe, FileText, TrendingUp, TrendingDown,
  ChevronDown, ChevronRight, CheckCircle, RotateCcw, Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as taxSvc from '@/services/tax.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR'];

const TREATMENT_LABELS: Record<taxSvc.TaxTreatment, string> = {
  STANDARD: 'Standard Rate',
  ZERO_RATED: 'Zero Rated',
  EXEMPT: 'Exempt',
  REVERSE_CHARGE: 'Reverse Charge',
  IMPORT_VAT: 'Import VAT',
  WITHHOLDING: 'Withholding',
};

const TREATMENT_COLORS: Record<taxSvc.TaxTreatment, string> = {
  STANDARD: 'default',
  ZERO_RATED: 'secondary',
  EXEMPT: 'secondary',
  REVERSE_CHARGE: 'warning',
  IMPORT_VAT: 'warning',
  WITHHOLDING: 'destructive',
};

const RATE_TYPE_LABELS: Record<taxSvc.ExchangeRateType, string> = {
  SPOT: 'Spot',
  MONTHLY_AVERAGE: 'Monthly Avg',
  PERIOD_CLOSING: 'Period Closing',
};

const VAT_STATUS_COLORS: Record<taxSvc.VatReturnStatus, string> = {
  DRAFT: 'secondary',
  SUBMITTED: 'warning',
  FILED: 'success',
};

const BOX_LABELS: Record<number, string> = {
  1: 'Box 1 — Output VAT (standard rate)',
  2: 'Box 2 — Acquisition / import VAT',
  3: 'Box 3 — Total output tax',
  4: 'Box 4 — Input VAT',
  5: 'Box 5 — Net VAT payable',
  6: 'Box 6 — Total supplies (net)',
  7: 'Box 7 — Total purchases (net)',
};

const fmt = (v: string | number, decimals = 2) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function ErrorMsg({ error }: { error: unknown }) {
  const msg = (error as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message ?? 'An error occurred';
  return <p className="text-xs text-destructive">{msg}</p>;
}

// ── Tax Code Dialog ───────────────────────────────────────────────────────────

function TaxCodeDialog({
  organisationId,
  existing,
}: {
  organisationId: string;
  existing?: taxSvc.TaxCode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(existing?.code ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [treatment, setTreatment] = useState<taxSvc.TaxTreatment>(existing?.treatment ?? 'STANDARD');
  const [rate, setRate] = useState(existing ? String(existing.rate) : '');
  const [isInclusive, setIsInclusive] = useState(existing?.isInclusive ?? false);
  const [glAccountId, setGlAccountId] = useState(existing?.glAccountId ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');

  const { data: accounts } = useQuery({
    queryKey: ['accounts-simple', organisationId],
    queryFn: () =>
      fetch(`/api/v1/organisations/${organisationId}/accounts?isActive=true`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      }).then((r) => r.json()).then((d) => d.data as Array<{ id: string; code: string; name: string; class: string }>),
    enabled: open,
  });

  const isEdit = !!existing;

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? taxSvc.updateTaxCode(organisationId, existing!.id, {
            name, treatment, rate: Number(rate), isInclusive,
            glAccountId: glAccountId || null, description: description || undefined,
          })
        : taxSvc.createTaxCode(organisationId, {
            code, name, treatment, rate: Number(rate), isInclusive,
            glAccountId: glAccountId || undefined, description: description || undefined,
          }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tax-codes'] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit
          ? <button className="text-xs text-muted-foreground hover:text-foreground hover:underline">Edit</button>
          : <Button size="sm"><Plus size={14} /> New Tax Code</Button>}
      </DialogTrigger>
      <DialogContent title={isEdit ? 'Edit Tax Code' : 'New Tax Code'} description="Configure VAT, GST, withholding or reverse charge code.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VAT20" className="h-8 text-xs" disabled={isEdit} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Rate (%) *</label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="20.00" className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard VAT" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Treatment</label>
              <Select value={treatment} onChange={(e) => setTreatment(e.target.value as taxSvc.TaxTreatment)} className="h-8 text-xs">
                {Object.entries(TREATMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={isInclusive} onChange={(e) => setIsInclusive(e.target.checked)} className="rounded" />
                Tax-inclusive pricing
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">GL Account (Output / Input Tax)</label>
            <Select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} className="h-8 text-xs">
              <option value="">— None —</option>
              {(accounts ?? [])
                .filter((a) => a.class === 'LIABILITY' || a.class === 'ASSET')
                .map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          {mutation.isError && <ErrorMsg error={mutation.error} />}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!name || !rate || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Exchange Rate Dialog ──────────────────────────────────────────────────────

function ExchangeRateDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('GHS');
  const [rate, setRate] = useState('');
  const [rateType, setRateType] = useState<taxSvc.ExchangeRateType>('SPOT');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

  const mutation = useMutation({
    mutationFn: () => taxSvc.upsertExchangeRate(organisationId, { fromCurrency, toCurrency, rate: Number(rate), rateType, effectiveDate }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['exchange-rates'] }); setOpen(false); setRate(''); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus size={14} /> Add Rate</Button>
      </DialogTrigger>
      <DialogContent title="Add Exchange Rate" description="Record a spot, monthly average, or period closing rate (IAS 21).">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">From</label>
              <Select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} className="h-8 text-xs">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">To</label>
              <Select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} className="h-8 text-xs">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Rate *</label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="14.5000" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Type</label>
              <Select value={rateType} onChange={(e) => setRateType(e.target.value as taxSvc.ExchangeRateType)} className="h-8 text-xs">
                {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Effective Date</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="h-8 text-xs" />
          </div>
          {mutation.isError && <ErrorMsg error={mutation.error} />}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!rate || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save Rate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── VAT Return Section ────────────────────────────────────────────────────────

function GenerateVatReturnDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  const [periodStart, setPeriodStart] = useState(firstDay);
  const [periodEnd, setPeriodEnd] = useState(lastDay);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => taxSvc.generateVatReturn(organisationId, { periodStart, periodEnd, notes: notes || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['vat-returns'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> Generate Return</Button>
      </DialogTrigger>
      <DialogContent title="Generate VAT Return" description="Aggregates all posted transactions with tax codes in the period.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Period Start *</label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Period End *</label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          {mutation.isError && <ErrorMsg error={mutation.error} />}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VatReturnDrilldown({ organisationId, returnId, onClose }: { organisationId: string; returnId: string; onClose: () => void }) {
  const [expandedBox, setExpandedBox] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: vr, isLoading } = useQuery({
    queryKey: ['vat-return-detail', organisationId, returnId],
    queryFn: () => taxSvc.getVatReturn(organisationId, returnId),
  });

  const updateStatus = useMutation({
    mutationFn: (status: taxSvc.VatReturnStatus) => taxSvc.updateVatReturnStatus(organisationId, returnId, status),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['vat-returns'] }); void qc.invalidateQueries({ queryKey: ['vat-return-detail', organisationId, returnId] }); },
  });

  const deleteReturn = useMutation({
    mutationFn: () => taxSvc.deleteVatReturn(organisationId, returnId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['vat-returns'] }); onClose(); },
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!vr) return null;

  const boxGroups = [1, 2, 4].map((box) => ({
    box,
    label: BOX_LABELS[box],
    lines: vr.lines.filter((l) => l.boxNumber === box),
  }));

  const summaryBoxes = [
    { box: 3, label: 'Box 3 — Total output tax', value: vr.box3TotalOutput },
    { box: 4, label: 'Box 4 — Input VAT', value: vr.box4InputTax },
    { box: 5, label: 'Box 5 — Net VAT payable / (refundable)', value: vr.box5NetVat },
    { box: 6, label: 'Box 6 — Total supplies (excl. VAT)', value: vr.box6TotalSupplies },
    { box: 7, label: 'Box 7 — Total purchases (excl. VAT)', value: vr.box7TotalPurchases },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">
            {new Date(vr.periodStart).toLocaleDateString()} — {new Date(vr.periodEnd).toLocaleDateString()}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{vr.lines.length} transaction lines</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={VAT_STATUS_COLORS[vr.status] as 'default'}>{vr.status}</Badge>
          {vr.status === 'DRAFT' && (
            <>
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate('SUBMITTED')} disabled={updateStatus.isPending}>
                <CheckCircle size={13} /> Submit
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm('Delete this VAT return?')) deleteReturn.mutate(); }} disabled={deleteReturn.isPending}>
                <Trash2 size={13} />
              </Button>
            </>
          )}
          {vr.status === 'SUBMITTED' && (
            <Button size="sm" onClick={() => updateStatus.mutate('FILED')} disabled={updateStatus.isPending}>
              <CheckCircle size={13} /> Mark Filed
            </Button>
          )}
        </div>
      </div>

      {/* Box drilldown for boxes 1, 2, 4 */}
      <div className="space-y-2">
        {boxGroups.map(({ box, label, lines }) => (
          <div key={box} className="border rounded-md overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
              onClick={() => setExpandedBox(expandedBox === box ? null : box)}
            >
              <span>{label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold">{fmt(box === 1 ? vr.box1OutputTax : box === 2 ? vr.box2AcquisitionTax : vr.box4InputTax)}</span>
                <span className="text-muted-foreground text-[10px]">({lines.length} lines)</span>
                {expandedBox === box ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </div>
            </button>
            {expandedBox === box && lines.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="py-1.5">Date</TableHead>
                    <TableHead className="py-1.5">Reference</TableHead>
                    <TableHead className="py-1.5">Account</TableHead>
                    <TableHead className="py-1.5">Code</TableHead>
                    <TableHead className="py-1.5 text-right">Net</TableHead>
                    <TableHead className="py-1.5 text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id} className="text-[11px]">
                      <TableCell className="py-1.5">{new Date(l.entryDate).toLocaleDateString()}</TableCell>
                      <TableCell className="py-1.5 font-mono text-[10px]">{l.reference ?? '—'}</TableCell>
                      <TableCell className="py-1.5">{l.journalLine?.account.name ?? l.description ?? '—'}</TableCell>
                      <TableCell className="py-1.5"><Badge variant="outline" className="text-[9px] h-4 px-1">{l.taxCode}</Badge></TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{fmt(l.netAmount)}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{fmt(l.taxAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ))}
      </div>

      {/* Summary boxes */}
      <div className="bg-muted/30 rounded-md p-4 space-y-2">
        {summaryBoxes.map(({ box, label, value }) => (
          <div key={box} className={cn('flex justify-between text-xs', box === 5 && 'font-semibold text-sm border-t pt-2 mt-2')}>
            <span className={box === 5 ? '' : 'text-muted-foreground'}>{label}</span>
            <span className={cn('font-mono', box === 5 && Number(value) > 0 ? 'text-destructive' : box === 5 ? 'text-success' : '')}>
              {fmt(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VatReturnView({ organisationId }: { organisationId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: returns, isLoading } = useQuery({
    queryKey: ['vat-returns', organisationId],
    queryFn: () => taxSvc.listVatReturns(organisationId),
    enabled: !!organisationId,
  });

  if (selectedId) {
    return (
      <Card>
        <CardContent className="p-4">
          <button onClick={() => setSelectedId(null)} className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1">
            ← Back to returns
          </button>
          <VatReturnDrilldown organisationId={organisationId} returnId={selectedId} onClose={() => setSelectedId(null)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (returns ?? []).length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No VAT returns generated yet.</p>
            <p className="text-xs text-muted-foreground">Generate a return to see box-by-box totals with full source drilldown.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Box 1</TableHead>
                <TableHead className="text-right">Box 4</TableHead>
                <TableHead className="text-right">Box 5 (Net VAT)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(returns ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">
                    {new Date(r.periodStart).toLocaleDateString()} — {new Date(r.periodEnd).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmt(r.box1OutputTax)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmt(r.box4InputTax)}</TableCell>
                  <TableCell className={cn('text-right font-mono text-xs font-semibold', Number(r.box5NetVat) > 0 ? 'text-destructive' : 'text-green-600')}>
                    {fmt(r.box5NetVat)}
                  </TableCell>
                  <TableCell><Badge variant={VAT_STATUS_COLORS[r.status] as 'default'}>{r.status}</Badge></TableCell>
                  <TableCell>
                    <button onClick={() => setSelectedId(r.id)} className="text-xs text-primary hover:underline">View</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── FX Revaluation Section ────────────────────────────────────────────────────

function RunRevaluationDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [periodEndDate, setPeriodEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => taxSvc.runFxRevaluation(organisationId, { periodEndDate, notes: notes || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fx-revaluations'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> Run Revaluation</Button>
      </DialogTrigger>
      <DialogContent title="FX Revaluation Run" description="Revalues all open foreign currency balances to the period closing rate (IAS 21).">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Period End Date *</label>
            <Input type="date" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} className="h-8 text-xs" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Uses PERIOD_CLOSING rate on or before this date. Falls back to the most recent available rate.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          {mutation.isError && <ErrorMsg error={mutation.error} />}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Running…' : 'Run'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FxRevaluationView({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: revs, isLoading } = useQuery({
    queryKey: ['fx-revaluations', organisationId],
    queryFn: () => taxSvc.listFxRevaluations(organisationId),
    enabled: !!organisationId,
  });

  const { data: detail } = useQuery({
    queryKey: ['fx-revaluation-detail', organisationId, expandedId],
    queryFn: () => taxSvc.getFxRevaluation(organisationId, expandedId!),
    enabled: !!expandedId,
  });

  const reverseReval = useMutation({
    mutationFn: (id: string) => taxSvc.reverseFxRevaluation(organisationId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fx-revaluations'] }),
  });

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (revs ?? []).length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No FX revaluations run yet.</p>
            <p className="text-xs text-muted-foreground">Run a period-end revaluation to compute unrealised FX gains and losses (IAS 21).</p>
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period End</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(revs ?? []).map((r) => (
                  <>
                    <TableRow key={r.id} className={cn(expandedId === r.id && 'bg-muted/30')}>
                      <TableCell className="text-sm font-medium">{new Date(r.periodEndDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-xs">{r._count?.lines ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'POSTED' ? 'success' : 'secondary'}>
                          {r.status === 'REVERSED' && <RotateCcw size={10} className="mr-1" />}
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                            className="text-xs text-primary hover:underline">
                            {expandedId === r.id ? 'Hide' : 'View'}
                          </button>
                          {r.status === 'POSTED' && (
                            <button
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => { if (confirm('Reverse this revaluation?')) reverseReval.mutate(r.id); }}>
                              Reverse
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === r.id && detail && (
                      <TableRow key={`${r.id}-detail`}>
                        <TableCell colSpan={4} className="p-0">
                          <div className="bg-muted/20 border-t">
                            <Table>
                              <TableHeader>
                                <TableRow className="text-[10px]">
                                  <TableHead className="py-1.5">Account</TableHead>
                                  <TableHead className="py-1.5">CCY</TableHead>
                                  <TableHead className="py-1.5 text-right">FC Balance</TableHead>
                                  <TableHead className="py-1.5 text-right">Orig Rate</TableHead>
                                  <TableHead className="py-1.5 text-right">Closing Rate</TableHead>
                                  <TableHead className="py-1.5 text-right">Base Before</TableHead>
                                  <TableHead className="py-1.5 text-right">Base After</TableHead>
                                  <TableHead className="py-1.5 text-right">Gain / (Loss)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detail.lines.map((l) => (
                                  <TableRow key={l.id} className="text-[11px]">
                                    <TableCell className="py-1.5">{l.account?.code} — {l.account?.name}</TableCell>
                                    <TableCell className="py-1.5 font-mono">{l.currency}</TableCell>
                                    <TableCell className="py-1.5 text-right font-mono">{fmt(l.openingBalance)}</TableCell>
                                    <TableCell className="py-1.5 text-right font-mono">{fmt(l.originalRate, 4)}</TableCell>
                                    <TableCell className="py-1.5 text-right font-mono">{fmt(l.closingRate, 4)}</TableCell>
                                    <TableCell className="py-1.5 text-right font-mono">{fmt(l.baseBefore)}</TableCell>
                                    <TableCell className="py-1.5 text-right font-mono">{fmt(l.baseAfter)}</TableCell>
                                    <TableCell className={cn('py-1.5 text-right font-mono font-semibold', Number(l.gainLoss) >= 0 ? 'text-green-600' : 'text-destructive')}>
                                      {Number(l.gainLoss) >= 0 ? <TrendingUp size={10} className="inline mr-0.5" /> : <TrendingDown size={10} className="inline mr-0.5" />}
                                      {fmt(Math.abs(Number(l.gainLoss)))}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'tax-codes' | 'exchange-rates' | 'vat-returns' | 'fx-revaluation';

export function TaxPage() {
  const organisationId = useAuthStore((s) => s.activeOrganisationId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('tax-codes');

  const { data: taxCodes, isLoading: taxLoading } = useQuery({
    queryKey: ['tax-codes', organisationId],
    queryFn: () => taxSvc.listTaxCodes(organisationId!),
    enabled: !!organisationId && tab === 'tax-codes',
  });

  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ['exchange-rates', organisationId],
    queryFn: () => taxSvc.listExchangeRates(organisationId!),
    enabled: !!organisationId && tab === 'exchange-rates',
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      taxSvc.updateTaxCode(organisationId!, id, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tax-codes'] }),
  });

  const tabs = [
    { id: 'tax-codes' as Tab, label: 'Tax Codes', icon: Receipt },
    { id: 'exchange-rates' as Tab, label: 'Exchange Rates', icon: Globe },
    { id: 'vat-returns' as Tab, label: 'VAT Returns', icon: FileText },
    { id: 'fx-revaluation' as Tab, label: 'FX Revaluation', icon: TrendingUp },
  ];

  if (!organisationId) return null;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Receipt size={18} /> Tax & Multi-Currency
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">VAT codes, exchange rates, VAT returns, and FX revaluation (IAS 21)</p>
        </div>
        <div className="flex gap-2">
          {tab === 'tax-codes' && <TaxCodeDialog organisationId={organisationId} />}
          {tab === 'exchange-rates' && <ExchangeRateDialog organisationId={organisationId} />}
          {tab === 'vat-returns' && <GenerateVatReturnDialog organisationId={organisationId} />}
          {tab === 'fx-revaluation' && <RunRevaluationDialog organisationId={organisationId} />}
        </div>
      </div>

      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tax Codes */}
      {tab === 'tax-codes' && (
        <Card>
          <CardContent className="p-0">
            {taxLoading ? (
              <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (taxCodes ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No tax codes yet.</p>
                <p className="text-xs text-muted-foreground">Add standard rate, zero rated, exempt, or reverse charge codes.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Treatment</TableHead>
                    <TableHead className="text-right">Rate (%)</TableHead>
                    <TableHead>Inclusive</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(taxCodes ?? []).map((tc) => (
                    <TableRow key={tc.id}>
                      <TableCell className="font-mono text-xs font-medium text-primary">{tc.code}</TableCell>
                      <TableCell className="text-sm font-medium">{tc.name}</TableCell>
                      <TableCell>
                        <Badge variant={TREATMENT_COLORS[tc.treatment] as 'default'} className="text-[10px]">
                          {TREATMENT_LABELS[tc.treatment]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold font-mono">{Number(tc.rate).toFixed(2)}%</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tc.isInclusive ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tc.glAccount ? <span className="font-mono">{tc.glAccount.code}</span> : '—'}
                      </TableCell>
                      <TableCell><Badge variant={tc.isActive ? 'success' : 'secondary'}>{tc.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TaxCodeDialog organisationId={organisationId} existing={tc} />
                          <button onClick={() => toggleActive.mutate({ id: tc.id, isActive: !tc.isActive })}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                            {tc.isActive ? 'Deactivate' : 'Activate'}
                          </button>
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

      {/* Exchange Rates */}
      {tab === 'exchange-rates' && (
        <Card>
          <CardContent className="p-0">
            {ratesLoading ? (
              <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (rates ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No exchange rates recorded.</p>
                <p className="text-xs text-muted-foreground">Add spot, monthly average, or period closing rates for IAS 21 compliance.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Effective Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rates ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-semibold">{r.fromCurrency}</TableCell>
                      <TableCell className="text-sm font-semibold">{r.toCurrency}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{Number(r.rate).toFixed(6)}</TableCell>
                      <TableCell>
                        <Badge variant={r.rateType === 'PERIOD_CLOSING' ? 'default' : 'secondary'} className="text-[10px]">
                          {RATE_TYPE_LABELS[r.rateType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.effectiveDate).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* VAT Returns */}
      {tab === 'vat-returns' && <VatReturnView organisationId={organisationId} />}

      {/* FX Revaluation */}
      {tab === 'fx-revaluation' && <FxRevaluationView organisationId={organisationId} />}
    </div>
  );
}
