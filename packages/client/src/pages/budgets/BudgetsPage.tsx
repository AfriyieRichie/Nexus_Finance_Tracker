import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PiggyBank, Plus, CheckCircle, BarChart3, Building2, ChevronRight, ChevronDown,
  GitBranch, Layers, Users, User, Pencil, Trash2, X, Copy, Upload, Globe,
  AlertTriangle, ShieldCheck, FileText,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as budgets from '@/services/budgets.service';
import { listAccounts } from '@/services/accounts.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const BUDGET_TYPE_LABELS: Record<budgets.BudgetType, string> = {
  ORIGINAL: 'Original', REVISED: 'Revised', ROLLING_FORECAST: 'Rolling Forecast',
};
const BUDGET_TYPE_VARIANT: Record<budgets.BudgetType, string> = {
  ORIGINAL: 'default', REVISED: 'warning', ROLLING_FORECAST: 'secondary',
};
const LEVEL_LABELS: Record<budgets.CostCentreLevel, string> = {
  COMPANY: 'Company', DIVISION: 'Division', DEPARTMENT: 'Department', TEAM: 'Team',
};
const LEVEL_ORDER: budgets.CostCentreLevel[] = ['COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM'];
const LEVEL_ICON: Record<budgets.CostCentreLevel, React.ElementType> = {
  COMPANY: Building2, DIVISION: Layers, DEPARTMENT: Users, TEAM: User,
};
const COMMIT_TYPE_LABELS: Record<budgets.CommitmentType, string> = {
  PURCHASE_ORDER: 'PO', REQUISITION: 'Requisition', CONTRACT: 'Contract',
};
const COMMIT_STATUS_VARIANT: Record<budgets.CommitmentStatus, string> = {
  OPEN: 'warning', PARTIALLY_INVOICED: 'default', FULLY_INVOICED: 'success', CANCELLED: 'secondary',
};
const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── NewBudgetDialog ──────────────────────────────────────────────────────────

function NewBudgetDialog({ organisationId, existingBudgets }: { organisationId: string; existingBudgets: budgets.Budget[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', fiscalYear: String(new Date().getFullYear()), budgetType: 'ORIGINAL' as budgets.BudgetType, parentBudgetId: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const approvedBudgets = existingBudgets.filter((b) => b.isApproved);
  const isRevision = form.budgetType === 'REVISED';

  const mutation = useMutation({
    mutationFn: () => budgets.createBudget(organisationId, {
      name: form.name, fiscalYear: Number(form.fiscalYear),
      budgetType: form.budgetType, parentBudgetId: form.parentBudgetId || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['budgets', organisationId] }); setOpen(false); setForm({ name: '', fiscalYear: String(new Date().getFullYear()), budgetType: 'ORIGINAL', parentBudgetId: '' }); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Budget</Button></DialogTrigger>
      <DialogContent title="New Budget" description="Create an annual budget or revision.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Type *</label>
            <Select value={form.budgetType} onChange={(e) => { set('budgetType', e.target.value); set('parentBudgetId', ''); }} className="h-8 text-xs">
              <option value="ORIGINAL">Original</option>
              <option value="REVISED">Revised (from approved original)</option>
              <option value="ROLLING_FORECAST">Rolling 12-Month Forecast</option>
            </Select>
          </div>
          {isRevision ? (
            <div>
              <label className="text-xs font-medium mb-1 block">Revise Which Budget? *</label>
              <Select value={form.parentBudgetId} onChange={(e) => set('parentBudgetId', e.target.value)} className="h-8 text-xs">
                <option value="">Select approved budget…</option>
                {approvedBudgets.map((b) => <option key={b.id} value={b.id}>{b.name} — FY{b.fiscalYear} v{b.version}</option>)}
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Budget Name *</label>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Annual Budget" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Fiscal Year *</label>
                <Input type="number" value={form.fiscalYear} onChange={(e) => set('fiscalYear', e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          )}
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.error?.message ?? 'Failed'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={(!isRevision && (!form.name || !form.fiscalYear)) || (isRevision && !form.parentBudgetId) || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CopyBudgetDialog ─────────────────────────────────────────────────────────

function CopyBudgetDialog({ organisationId, budget }: { organisationId: string; budget: budgets.Budget }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ targetFiscalYear: String(budget.fiscalYear + 1), targetName: budget.name, upliftPct: '0' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => budgets.copyBudget(organisationId, budget.id, {
      targetFiscalYear: Number(form.targetFiscalYear),
      targetName: form.targetName,
      upliftPct: Number(form.upliftPct),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['budgets', organisationId] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-primary hover:underline flex items-center gap-1"><Copy size={11} /> Copy</button>
      </DialogTrigger>
      <DialogContent title="Copy Budget with Uplift" description={`Copy all lines from '${budget.name}' v${budget.version} to a new budget, optionally scaling amounts.`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Target Fiscal Year *</label>
              <Input type="number" value={form.targetFiscalYear} onChange={(e) => set('targetFiscalYear', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Uplift % (e.g. 5 = +5%)</label>
              <Input type="number" step="0.1" value={form.upliftPct} onChange={(e) => set('upliftPct', e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">New Budget Name *</label>
            <Input value={form.targetName} onChange={(e) => set('targetName', e.target.value)} className="h-8 text-xs" />
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.error?.message ?? 'Failed'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.targetName || !form.targetFiscalYear || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Copying…' : 'Copy Budget'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ThresholdDialog ──────────────────────────────────────────────────────────

function ThresholdDialog({ organisationId, budget }: { organisationId: string; budget: budgets.Budget }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(budget.alertThresholdPct ?? '');

  const mutation = useMutation({
    mutationFn: () => budgets.updateBudget(organisationId, budget.id, {
      alertThresholdPct: pct !== '' ? Number(pct) : null,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['budgets', organisationId] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <AlertTriangle size={11} /> Alert
        </button>
      </DialogTrigger>
      <DialogContent title="Variance Alert Threshold" description="Lines where |variance %| exceeds this threshold will be flagged in red. Leave blank to disable.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Threshold % (e.g. 10 = flag when variance &gt; ±10%)</label>
            <Input type="number" min="0" step="1" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="e.g. 10" className="h-8 text-xs" />
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.error?.message ?? 'Failed'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── BudgetLineEditor ─────────────────────────────────────────────────────────

interface LineRow { key: number; accountId: string; costCentreId: string; amounts: Record<number, string> }

function BudgetLineEditor({ organisationId, budget, onBack }: { organisationId: string; budget: budgets.BudgetDetail; onBack: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId], queryFn: () => listAccounts(organisationId, { pageSize: 500, isActive: true }) });
  const { data: centres = [] } = useQuery({ queryKey: ['cost-centres', organisationId], queryFn: () => budgets.listCostCentres(organisationId) });

  const buildInitialRows = (): LineRow[] => {
    if (!budget.lines.length) return [{ key: 0, accountId: '', costCentreId: '', amounts: {} }];
    const map = new Map<string, LineRow>();
    budget.lines.forEach((l) => {
      const k = `${l.accountId}::${l.costCentreId ?? ''}`;
      if (!map.has(k)) map.set(k, { key: map.size, accountId: l.accountId, costCentreId: l.costCentreId ?? '', amounts: {} });
      map.get(k)!.amounts[l.periodNumber] = l.amount;
    });
    return Array.from(map.values());
  };

  const [rows, setRows] = useState<LineRow[]>(buildInitialRows);
  const nextKey = rows.length ? Math.max(...rows.map((r) => r.key)) + 1 : 0;

  const updateRow = (key: number, field: 'accountId' | 'costCentreId', value: string) =>
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, [field]: value } : r));
  const updateAmount = (key: number, period: number, value: string) =>
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, amounts: { ...r.amounts, [period]: value } } : r));

  const saveMutation = useMutation({
    mutationFn: () => {
      const lines: budgets.BudgetLineInput[] = [];
      for (const row of rows) {
        if (!row.accountId) continue;
        for (const p of PERIODS) {
          const amt = parseFloat(row.amounts[p] ?? '0') || 0;
          if (amt !== 0) lines.push({ accountId: row.accountId, costCentreId: row.costCentreId || null, periodNumber: p, amount: amt });
        }
      }
      return budgets.updateBudgetLines(organisationId, budget.id, lines);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['budget', organisationId, budget.id] }); onBack(); },
  });

  const importMutation = useMutation({
    mutationFn: (parsed: Array<{ accountCode: string; costCentreCode?: string; amounts: Record<number, number> }>) =>
      budgets.importBudgetLines(organisationId, budget.id, parsed),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['budget', organisationId, budget.id] }); onBack(); },
  });

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const parsed: Array<{ accountCode: string; costCentreCode?: string; amounts: Record<number, number> }> = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (!cols[0]) continue;
        const row: { accountCode: string; costCentreCode?: string; amounts: Record<number, number> } = {
          accountCode: cols[headers.indexOf('account_code')] ?? cols[0],
          amounts: {},
        };
        const ccIdx = headers.indexOf('cost_centre_code');
        if (ccIdx >= 0 && cols[ccIdx]) row.costCentreCode = cols[ccIdx];
        for (let p = 1; p <= 12; p++) {
          const idx = headers.indexOf(`p${p}`);
          const val = parseFloat(idx >= 0 ? cols[idx] : '');
          if (!isNaN(val) && val !== 0) row.amounts[p] = val;
        }
        parsed.push(row);
      }
      importMutation.mutate(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const accounts = (accountsData?.accounts ?? []).filter((a) => !a.isLocked && !a.isControlAccount);
  const rowTotal = (r: LineRow) => PERIODS.reduce((s, p) => s + (parseFloat(r.amounts[p] ?? '0') || 0), 0);
  const periodTotal = (p: number) => rows.reduce((s, r) => s + (parseFloat(r.amounts[p] ?? '0') || 0), 0);
  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
          <div>
            <p className="text-sm font-semibold">{budget.name}</p>
            <p className="text-xs text-muted-foreground">FY{budget.fiscalYear} · {BUDGET_TYPE_LABELS[budget.budgetType]} v{budget.version}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!budget.isApproved && (
            <>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileImport} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
                <Upload size={13} /> {importMutation.isPending ? 'Importing…' : 'Import CSV'}
              </Button>
              <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving…' : 'Save Lines'}
              </Button>
            </>
          )}
        </div>
      </div>

      {budget.isApproved && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This budget is approved and locked. Create a Revised version to make changes.
        </p>
      )}
      {(saveMutation.isError || importMutation.isError) && (
        <p className="text-xs text-destructive">{(saveMutation.error as any)?.response?.data?.error?.message ?? (importMutation.error as any)?.response?.data?.error?.message ?? 'Failed'}</p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs w-full min-w-[1200px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-52">Account</th>
              <th className="text-left px-3 py-2 font-medium w-36">Cost Centre</th>
              {PERIODS.map((p) => <th key={p} className="text-right px-2 py-2 font-medium w-20">P{p}</th>)}
              <th className="text-right px-3 py-2 font-medium w-24">Annual</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t hover:bg-muted/20">
                <td className="px-2 py-1">
                  <select value={row.accountId} onChange={(e) => updateRow(row.key, 'accountId', e.target.value)} disabled={budget.isApproved}
                    className="w-full h-7 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50">
                    <option value="">— Select account —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select value={row.costCentreId} onChange={(e) => updateRow(row.key, 'costCentreId', e.target.value)} disabled={budget.isApproved}
                    className="w-full h-7 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50">
                    <option value="">No CC</option>
                    {centres.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                  </select>
                </td>
                {PERIODS.map((p) => (
                  <td key={p} className="px-1 py-1">
                    <input type="number" min="0" step="0.01" value={row.amounts[p] ?? ''} onChange={(e) => updateAmount(row.key, p, e.target.value)}
                      disabled={budget.isApproved} placeholder="0"
                      className="w-full h-7 text-right text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50" />
                  </td>
                ))}
                <td className="px-3 py-1 text-right font-medium tabular-nums">{fmt(rowTotal(row))}</td>
                <td className="px-1 py-1">
                  {!budget.isApproved && rows.length > 1 && (
                    <button onClick={() => setRows((p) => p.filter((r) => r.key !== row.key))} className="text-muted-foreground hover:text-destructive p-1"><X size={12} /></button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2 text-xs">Total</td><td />
              {PERIODS.map((p) => <td key={p} className="px-2 py-2 text-right text-xs tabular-nums">{periodTotal(p) !== 0 ? fmt(periodTotal(p)) : ''}</td>)}
              <td className="px-3 py-2 text-right text-xs tabular-nums">{fmt(grandTotal)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      {!budget.isApproved && (
        <Button variant="outline" size="sm" onClick={() => setRows((p) => [...p, { key: nextKey, accountId: '', costCentreId: '', amounts: {} }])}>
          <Plus size={12} /> Add Row
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        CSV format: <code>account_code,cost_centre_code,p1,p2,...,p12</code> — cost_centre_code is optional.
      </p>
    </div>
  );
}

// ─── VarianceView ─────────────────────────────────────────────────────────────

function VarianceView({ organisationId, budget, costCentres }: { organisationId: string; budget: budgets.Budget; costCentres: budgets.CostCentre[] }) {
  const [ccFilter, setCcFilter] = useState('');
  const [rollup, setRollup] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['budget-variance', organisationId, budget.id, ccFilter, rollup],
    queryFn: () => budgets.getBudgetVariance(organisationId, budget.id, { costCentreId: ccFilter || undefined, rollup }),
  });

  const lines = data ?? [];
  const hasCostCentres = lines.some((l) => l.costCentreId);
  const hasCommitted = lines.some((l) => parseFloat(l.committed) !== 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold">Budget vs Actual — {budget.name}</p>
          <p className="text-xs text-muted-foreground">FY{budget.fiscalYear} · {BUDGET_TYPE_LABELS[budget.budgetType]} v{budget.version}
            {budget.alertThresholdPct && <span className="ml-2 text-amber-600">· Alert threshold: {budget.alertThresholdPct}%</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ccFilter && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={rollup} onChange={(e) => setRollup(e.target.checked)} />
              Rollup children
            </label>
          )}
          <Select value={ccFilter} onChange={(e) => { setCcFilter(e.target.value); setRollup(false); }} className="h-7 text-xs w-48">
            <option value="">All cost centres</option>
            {costCentres.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
          </Select>
        </div>
      </div>

      {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        : lines.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No budget lines to display.</div>
        : (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  {hasCostCentres && <TableHead>Cost Centre</TableHead>}
                  <TableHead className="text-right">Budgeted</TableHead>
                  {hasCommitted && <TableHead className="text-right">Committed</TableHead>}
                  <TableHead className="text-right">Actual</TableHead>
                  {hasCommitted && <TableHead className="text-right">Available</TableHead>}
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Var %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => {
                  const varNum = parseFloat(line.variance);
                  const varPct = line.variancePct ? parseFloat(line.variancePct) : null;
                  const avail = parseFloat(line.available);
                  return (
                    <TableRow key={i} className={line.isFlagged ? 'bg-red-50' : undefined}>
                      <TableCell className="text-xs">
                        {line.isFlagged && <AlertTriangle size={10} className="inline text-destructive mr-1" />}
                        {line.accountCode} — {line.accountName}
                      </TableCell>
                      {hasCostCentres && <TableCell className="text-xs text-muted-foreground">{line.costCentreCode ? `${line.costCentreCode} ${line.costCentreName}` : '—'}</TableCell>}
                      <TableCell className="text-right text-xs tabular-nums">{fmt(line.budgeted)}</TableCell>
                      {hasCommitted && <TableCell className="text-right text-xs tabular-nums text-amber-600">{parseFloat(line.committed) !== 0 ? fmt(line.committed) : '—'}</TableCell>}
                      <TableCell className="text-right text-xs tabular-nums">{fmt(line.actual)}</TableCell>
                      {hasCommitted && <TableCell className={cn('text-right text-xs font-semibold tabular-nums', avail < 0 ? 'text-destructive' : 'text-green-600')}>{fmt(avail)}</TableCell>}
                      <TableCell className={cn('text-right text-xs font-semibold tabular-nums', varNum < 0 ? 'text-destructive' : 'text-green-600')}>{fmt(varNum)}</TableCell>
                      <TableCell className={cn('text-right text-xs tabular-nums', varPct !== null && varPct < 0 ? 'text-destructive' : 'text-green-600')}>
                        {varPct !== null ? `${varPct.toFixed(1)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
    </div>
  );
}

// ─── CommitmentsView ──────────────────────────────────────────────────────────

function CommitmentsView({ organisationId, budget, costCentres }: { organisationId: string; budget: budgets.Budget; costCentres: budgets.CostCentre[] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    accountId: '', costCentreId: '', periodNumber: '1',
    amount: '', referenceType: 'PURCHASE_ORDER' as budgets.CommitmentType,
    reference: '', description: '', raisedDate: new Date().toISOString().slice(0, 10),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId], queryFn: () => listAccounts(organisationId, { pageSize: 500, isActive: true }) });
  const { data: commitments = [], isLoading } = useQuery({
    queryKey: ['commitments', organisationId, budget.id],
    queryFn: () => budgets.listCommitments(organisationId, budget.id),
  });

  const addMutation = useMutation({
    mutationFn: () => budgets.createCommitment(organisationId, budget.id, {
      accountId: form.accountId, costCentreId: form.costCentreId || undefined,
      periodNumber: Number(form.periodNumber), amount: Number(form.amount),
      referenceType: form.referenceType, reference: form.reference || undefined,
      description: form.description || undefined, raisedDate: form.raisedDate,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['commitments', organisationId, budget.id] }); setAddOpen(false); setForm({ accountId: '', costCentreId: '', periodNumber: '1', amount: '', referenceType: 'PURCHASE_ORDER', reference: '', description: '', raisedDate: new Date().toISOString().slice(0, 10) }); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => budgets.updateCommitment(organisationId, budget.id, id, { status: 'CANCELLED' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['commitments', organisationId, budget.id] }),
  });

  const accounts = accountsData?.accounts ?? [];
  const openTotal = commitments.filter((c) => c.status === 'OPEN' || c.status === 'PARTIALLY_INVOICED')
    .reduce((s, c) => s + parseFloat(c.amount) - parseFloat(c.invoicedAmount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Commitments — {budget.name}</p>
          <p className="text-xs text-muted-foreground">FY{budget.fiscalYear} · Open committed: <strong>{fmt(openTotal)}</strong></p>
        </div>
        {budget.isApproved && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Commitment</Button></DialogTrigger>
            <DialogContent title="Raise Commitment" description="Record a purchase order, requisition, or contract commitment against this budget.">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Type *</label>
                    <Select value={form.referenceType} onChange={(e) => set('referenceType', e.target.value)} className="h-8 text-xs">
                      <option value="PURCHASE_ORDER">Purchase Order</option>
                      <option value="REQUISITION">Requisition</option>
                      <option value="CONTRACT">Contract</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Reference</label>
                    <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="PO-2026-001" className="h-8 text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Account *</label>
                  <Select value={form.accountId} onChange={(e) => set('accountId', e.target.value)} className="h-8 text-xs">
                    <option value="">Select account…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Cost Centre</label>
                    <Select value={form.costCentreId} onChange={(e) => set('costCentreId', e.target.value)} className="h-8 text-xs">
                      <option value="">None</option>
                      {costCentres.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Period *</label>
                    <Select value={form.periodNumber} onChange={(e) => set('periodNumber', e.target.value)} className="h-8 text-xs">
                      {PERIODS.map((p) => <option key={p} value={p}>P{p}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Amount *</label>
                    <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Date *</label>
                    <Input type="date" value={form.raisedDate} onChange={(e) => set('raisedDate', e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Description</label>
                    <Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                {addMutation.isError && <p className="text-xs text-destructive">{(addMutation.error as any)?.response?.data?.error?.message ?? 'Failed'}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
                  <Button size="sm" disabled={!form.accountId || !form.amount || addMutation.isPending} onClick={() => addMutation.mutate()}>
                    {addMutation.isPending ? 'Raising…' : 'Raise Commitment'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!budget.isApproved && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Commitments can only be raised against approved budgets.
        </p>
      )}

      {isLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        : commitments.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No commitments raised yet.</div>
        : (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>CC</TableHead>
                  <TableHead className="text-center">Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitments.map((c) => {
                  const openAmt = parseFloat(c.amount) - parseFloat(c.invoicedAmount);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{COMMIT_TYPE_LABELS[c.referenceType]}</TableCell>
                      <TableCell className="text-xs font-mono">{c.reference ?? '—'}</TableCell>
                      <TableCell className="text-xs">{c.account?.code} {c.account?.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.costCentre?.code ?? '—'}</TableCell>
                      <TableCell className="text-center text-xs">P{c.periodNumber}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmt(c.amount)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{parseFloat(c.invoicedAmount) !== 0 ? fmt(c.invoicedAmount) : '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums font-medium">{fmt(openAmt)}</TableCell>
                      <TableCell><Badge variant={COMMIT_STATUS_VARIANT[c.status] as any} className="text-[10px]">{c.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell>
                        {(c.status === 'OPEN' || c.status === 'PARTIALLY_INVOICED') && (
                          <button onClick={() => { if (confirm('Cancel this commitment?')) cancelMutation.mutate(c.id); }}
                            className="p-1 text-muted-foreground hover:text-destructive"><X size={12} /></button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
    </div>
  );
}

// ─── IFRS8View ─────────────────────────────────────────────────────────────────

function IFRS8View({ organisationId }: { organisationId: string }) {
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const { data, isLoading } = useQuery({
    queryKey: ['segment-report', organisationId, fiscalYear],
    queryFn: () => budgets.getSegmentReport(organisationId, fiscalYear ? Number(fiscalYear) : undefined),
    enabled: !!organisationId,
  });

  const segments = data ?? [];
  const grandRevenue = segments.reduce((s, l) => s + parseFloat(l.revenue), 0);
  const grandExpenses = segments.reduce((s, l) => s + parseFloat(l.expenses), 0);
  const grandResult = segments.reduce((s, l) => s + parseFloat(l.segmentResult), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2"><Globe size={14} /> IFRS 8 Operating Segment Disclosure</p>
          <p className="text-xs text-muted-foreground">Only cost centres marked as Reportable Segment appear here.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Fiscal Year</label>
          <Input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className="h-7 text-xs w-24" />
        </div>
      </div>

      {isLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        : segments.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No reportable segments defined.</p>
            <p className="text-xs text-muted-foreground">Mark cost centres as <strong>Reportable Segment</strong> in the Cost Centres tab.</p>
          </div>
        ) : (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Segment Result</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((seg) => {
                  const result = parseFloat(seg.segmentResult);
                  const rev = parseFloat(seg.revenue);
                  const margin = rev !== 0 ? (result / rev * 100).toFixed(1) : null;
                  return (
                    <TableRow key={seg.costCentreId}>
                      <TableCell className="text-sm font-medium">{seg.costCentreCode} — {seg.costCentreName}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmt(seg.revenue)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmt(seg.expenses)}</TableCell>
                      <TableCell className={cn('text-right text-xs font-semibold tabular-nums', result < 0 ? 'text-destructive' : 'text-green-600')}>{fmt(seg.segmentResult)}</TableCell>
                      <TableCell className={cn('text-right text-xs tabular-nums', margin !== null && parseFloat(margin) < 0 ? 'text-destructive' : 'text-green-600')}>
                        {margin !== null ? `${margin}%` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-semibold bg-muted/30">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmt(grandRevenue)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmt(grandExpenses)}</TableCell>
                  <TableCell className={cn('text-right text-xs tabular-nums', grandResult < 0 ? 'text-destructive' : 'text-green-600')}>{fmt(grandResult)}</TableCell>
                  <TableCell className={cn('text-right text-xs tabular-nums', grandRevenue !== 0 && grandResult / grandRevenue < 0 ? 'text-destructive' : 'text-green-600')}>
                    {grandRevenue !== 0 ? `${(grandResult / grandRevenue * 100).toFixed(1)}%` : '—'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
    </div>
  );
}

// ─── CostCentreTree ───────────────────────────────────────────────────────────

function EditCCDialog({ organisationId, cc, centres }: { organisationId: string; cc: budgets.CostCentre; centres: budgets.CostCentre[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: cc.name, description: cc.description ?? '', parentId: cc.parentId ?? '', isReportableSegment: cc.isReportableSegment, isActive: cc.isActive });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const validParents = centres.filter((c) => c.id !== cc.id && LEVEL_ORDER.indexOf(c.level) < LEVEL_ORDER.indexOf(cc.level) && c.isActive);

  const mutation = useMutation({
    mutationFn: () => budgets.updateCostCentre(organisationId, cc.id, { name: form.name, description: form.description || undefined, parentId: form.parentId || null, isReportableSegment: form.isReportableSegment, isActive: form.isActive }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cost-centres', organisationId] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button></DialogTrigger>
      <DialogContent title={`Edit — ${cc.code}`} description="">
        <div className="space-y-3">
          <div><label className="text-xs font-medium mb-1 block">Name *</label><Input value={form.name} onChange={(e) => set('name', e.target.value)} className="h-8 text-xs" /></div>
          <div><label className="text-xs font-medium mb-1 block">Description</label><Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" /></div>
          <div><label className="text-xs font-medium mb-1 block">Parent</label>
            <Select value={form.parentId} onChange={(e) => set('parentId', e.target.value)} className="h-8 text-xs">
              <option value="">No parent</option>
              {validParents.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
            <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={form.isReportableSegment} onChange={(e) => set('isReportableSegment', e.target.checked)} /> <Globe size={11} /> IFRS 8 Segment</label>
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.error?.message ?? 'Error'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCCDialog({ organisationId, centres }: { organisationId: string; centres: budgets.CostCentre[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', level: 'DEPARTMENT' as budgets.CostCentreLevel, parentId: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validParents = centres.filter((c) => LEVEL_ORDER.indexOf(c.level) < LEVEL_ORDER.indexOf(form.level) && c.isActive);

  const mutation = useMutation({
    mutationFn: () => budgets.createCostCentre(organisationId, { code: form.code, name: form.name, description: form.description || undefined, level: form.level, parentId: form.parentId || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cost-centres', organisationId] }); setOpen(false); setForm({ code: '', name: '', description: '', level: 'DEPARTMENT', parentId: '' }); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Cost Centre</Button></DialogTrigger>
      <DialogContent title="New Cost Centre" description="Add a node to the cost centre hierarchy.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Code *</label><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="CC001" className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Name *</label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Finance" className="h-8 text-xs" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Level *</label>
              <Select value={form.level} onChange={(e) => { set('level', e.target.value); set('parentId', ''); }} className="h-8 text-xs">
                {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Parent</label>
              <Select value={form.parentId} onChange={(e) => set('parentId', e.target.value)} className="h-8 text-xs">
                <option value="">No parent</option>
                {validParents.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </Select>
            </div>
          </div>
          <div><label className="text-xs font-medium mb-1 block">Description</label><Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" /></div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.error?.message ?? 'Error'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.code || !form.name || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CostCentreTree({ organisationId, centres }: { organisationId: string; centres: budgets.CostCentre[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, budgets.CostCentre[]>();
    for (const c of centres) { const k = c.parentId; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c); }
    return map;
  }, [centres]);

  function renderNodes(parentId: string | null, depth: number): React.ReactNode {
    return (childrenOf.get(parentId) ?? []).map((cc) => {
      const hasChildren = (childrenOf.get(cc.id)?.length ?? 0) > 0;
      const isExpanded = expanded.has(cc.id);
      const Icon = LEVEL_ICON[cc.level];
      return (
        <div key={cc.id}>
          <div className={cn('flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-sm border-b border-border/40 group', !cc.isActive && 'opacity-50')} style={{ paddingLeft: `${12 + depth * 20}px` }}>
            {hasChildren ? <button onClick={() => toggle(cc.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0">{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
              : <span className="w-[13px] flex-shrink-0" />}
            <Icon size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-xs text-muted-foreground w-20 flex-shrink-0">{cc.code}</span>
            <span className="font-medium flex-1">{cc.name}</span>
            {cc.isReportableSegment && <span title="IFRS 8 Segment"><Globe size={11} className="text-blue-500 flex-shrink-0" /></span>}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">{LEVEL_LABELS[cc.level]}</Badge>
            <Badge variant={cc.isActive ? 'success' : 'secondary'} className="text-[10px] h-4 px-1.5 flex-shrink-0">{cc.isActive ? 'Active' : 'Inactive'}</Badge>
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <EditCCDialog organisationId={organisationId} cc={cc} centres={centres} />
            </div>
          </div>
          {isExpanded && renderNodes(cc.id, depth + 1)}
        </div>
      );
    });
  }

  if (!centres.length) return <div className="py-16 text-center"><p className="text-sm text-muted-foreground">No cost centres yet. Click <strong>New Cost Centre</strong> to build the hierarchy.</p></div>;
  return <div>{renderNodes(null, 0)}</div>;
}

// ─── BudgetsPage ──────────────────────────────────────────────────────────────

type Tab = 'budgets' | 'cost-centres' | 'departments' | 'ifrs8';
type BudgetView = { kind: 'list' } | { kind: 'lines'; budget: budgets.BudgetDetail } | { kind: 'variance'; budget: budgets.Budget } | { kind: 'commitments'; budget: budgets.Budget };

export function BudgetsPage() {
  const organisationId = useAuthStore((s) => s.activeOrganisationId)!;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('budgets');
  const [budgetView, setBudgetView] = useState<BudgetView>({ kind: 'list' });

  const { data: budgetList = [], isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', organisationId],
    queryFn: () => budgets.listBudgets(organisationId),
    enabled: !!organisationId,
  });

  const { data: costCentres = [], isLoading: ccLoading } = useQuery({
    queryKey: ['cost-centres', organisationId],
    queryFn: () => budgets.listCostCentres(organisationId),
    enabled: !!organisationId,
  });

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ['departments', organisationId],
    queryFn: () => budgets.listDepartments(organisationId),
    enabled: !!organisationId && tab === 'departments',
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => budgets.approveBudget(organisationId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets', organisationId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => budgets.deleteBudget(organisationId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets', organisationId] }),
  });

  async function openLines(b: budgets.Budget) {
    const detail = await budgets.getBudget(organisationId, b.id);
    setBudgetView({ kind: 'lines', budget: detail });
  }

  const tabs = [
    { id: 'budgets' as Tab, label: 'Budgets', icon: PiggyBank },
    { id: 'cost-centres' as Tab, label: 'Cost Centres', icon: Building2 },
    { id: 'departments' as Tab, label: 'Departments', icon: Users },
    { id: 'ifrs8' as Tab, label: 'IFRS 8 Segments', icon: Globe },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><PiggyBank size={18} /> Budgets & Cost Centres</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Annual budgets, commitment accounting, variance analysis, and IFRS 8 segment disclosures</p>
        </div>
        <div className="flex gap-2">
          {tab === 'budgets' && budgetView.kind === 'list' && <NewBudgetDialog organisationId={organisationId} existingBudgets={budgetList} />}
          {tab === 'cost-centres' && <NewCCDialog organisationId={organisationId} centres={costCentres} />}
          {tab === 'departments' && <NewDeptDialog organisationId={organisationId} />}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setBudgetView({ kind: 'list' }); }}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors', tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Budgets tab ── */}
      {tab === 'budgets' && budgetView.kind === 'list' && (
        <Card><CardContent className="p-0">
          {budgetsLoading ? <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : budgetList.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No budgets yet.</p>
                <p className="text-xs text-muted-foreground">Click <strong>New Budget</strong> to create one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">FY</TableHead>
                    <TableHead className="text-center">Ver</TableHead>
                    <TableHead className="text-center">Lines</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Based On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetList.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm font-medium">{b.name}</TableCell>
                      <TableCell><Badge variant={BUDGET_TYPE_VARIANT[b.budgetType] as any} className="text-[10px]">{BUDGET_TYPE_LABELS[b.budgetType]}</Badge></TableCell>
                      <TableCell className="text-center text-xs tabular-nums">{b.fiscalYear}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">v{b.version}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{b.lineCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant={b.isApproved ? 'success' : 'secondary'}>{b.isApproved ? 'Approved' : 'Draft'}</Badge>
                          {b.alertThresholdPct && <span title={`Alert at ${b.alertThresholdPct}%`}><AlertTriangle size={11} className="text-amber-500" /></span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.parentBudget ? <span className="flex items-center gap-1"><GitBranch size={10} /> {b.parentBudget.name} v{b.parentBudget.version}</span> : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => openLines(b)} className="text-xs text-primary hover:underline"><FileText size={11} /> Lines</button>
                          <button onClick={() => setBudgetView({ kind: 'variance', budget: b })} className="text-xs text-primary hover:underline flex items-center gap-1"><BarChart3 size={11} /> Variance</button>
                          {b.isApproved && <button onClick={() => setBudgetView({ kind: 'commitments', budget: b })} className="text-xs text-primary hover:underline flex items-center gap-1"><ShieldCheck size={11} /> Commitments</button>}
                          <CopyBudgetDialog organisationId={organisationId} budget={b} />
                          <ThresholdDialog organisationId={organisationId} budget={b} />
                          {!b.isApproved && (
                            <button onClick={() => approveMutation.mutate(b.id)} disabled={approveMutation.isPending} className="text-xs text-green-600 hover:underline flex items-center gap-1 disabled:opacity-50"><CheckCircle size={11} /> Approve</button>
                          )}
                          {!b.isApproved && (
                            <button onClick={() => { if (confirm('Delete this draft budget?')) deleteMutation.mutate(b.id); }} className="text-xs text-destructive hover:underline"><Trash2 size={11} /></button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent></Card>
      )}

      {tab === 'budgets' && budgetView.kind === 'lines' && (
        <BudgetLineEditor organisationId={organisationId} budget={budgetView.budget} onBack={() => setBudgetView({ kind: 'list' })} />
      )}
      {tab === 'budgets' && budgetView.kind === 'variance' && (
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setBudgetView({ kind: 'list' })}>← Back to Budgets</Button>
          <VarianceView organisationId={organisationId} budget={budgetView.budget} costCentres={costCentres} />
        </div>
      )}
      {tab === 'budgets' && budgetView.kind === 'commitments' && (
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setBudgetView({ kind: 'list' })}>← Back to Budgets</Button>
          <CommitmentsView organisationId={organisationId} budget={budgetView.budget} costCentres={costCentres} />
        </div>
      )}

      {/* ── Cost Centres tab ── */}
      {tab === 'cost-centres' && (
        <Card><CardContent className="p-0">
          {ccLoading ? <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : <CostCentreTree organisationId={organisationId} centres={costCentres} />}
        </CardContent></Card>
      )}

      {/* ── Departments tab ── */}
      {tab === 'departments' && (
        <Card><CardContent className="p-0">
          {deptLoading ? <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : departments.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No departments yet.</div>
            : (
              <Table>
                <TableHeader><TableRow><TableHead className="w-24">Code</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {departments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{d.code}</TableCell>
                      <TableCell className="text-sm font-medium">{d.name}</TableCell>
                      <TableCell><Badge variant={d.isActive ? 'success' : 'secondary'}>{d.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent></Card>
      )}

      {/* ── IFRS 8 tab ── */}
      {tab === 'ifrs8' && <IFRS8View organisationId={organisationId} />}
    </div>
  );
}

// ─── NewDeptDialog ────────────────────────────────────────────────────────────

function NewDeptDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const mutation = useMutation({
    mutationFn: () => budgets.createDepartment(organisationId, { code, name }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['departments', organisationId] }); setOpen(false); setCode(''); setName(''); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Department</Button></DialogTrigger>
      <DialogContent title="New Department" description="">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Code *</label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DEPT01" className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Name *</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance" className="h-8 text-xs" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!code || !name || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
