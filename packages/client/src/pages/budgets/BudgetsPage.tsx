import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PiggyBank, Plus, CheckCircle, BarChart3, Building2, ChevronRight,
  ChevronDown, GitBranch, Layers, Users, User, Pencil, Trash2, X,
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
  ORIGINAL: 'Original',
  REVISED: 'Revised',
  ROLLING_FORECAST: 'Rolling Forecast',
};

const BUDGET_TYPE_VARIANT: Record<budgets.BudgetType, string> = {
  ORIGINAL: 'default',
  REVISED: 'warning',
  ROLLING_FORECAST: 'secondary',
};

const LEVEL_LABELS: Record<budgets.CostCentreLevel, string> = {
  COMPANY: 'Company', DIVISION: 'Division', DEPARTMENT: 'Department', TEAM: 'Team',
};

const LEVEL_ORDER: budgets.CostCentreLevel[] = ['COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM'];

const LEVEL_ICON: Record<budgets.CostCentreLevel, React.ElementType> = {
  COMPANY: Building2, DIVISION: Layers, DEPARTMENT: Users, TEAM: User,
};

const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── NewBudgetDialog ─────────────────────────────────────────────────────────

function NewBudgetDialog({
  organisationId,
  existingBudgets,
}: {
  organisationId: string;
  existingBudgets: budgets.Budget[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    fiscalYear: String(new Date().getFullYear()),
    budgetType: 'ORIGINAL' as budgets.BudgetType,
    parentBudgetId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const approvedBudgets = existingBudgets.filter((b) => b.isApproved);

  const mutation = useMutation({
    mutationFn: () =>
      budgets.createBudget(organisationId, {
        name: form.budgetType === 'REVISED' && form.parentBudgetId ? '' : form.name,
        fiscalYear: Number(form.fiscalYear),
        budgetType: form.budgetType,
        parentBudgetId: form.parentBudgetId || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budgets', organisationId] });
      setOpen(false);
      setForm({ name: '', fiscalYear: String(new Date().getFullYear()), budgetType: 'ORIGINAL', parentBudgetId: '' });
    },
  });

  const isRevision = form.budgetType === 'REVISED';
  const canSubmit = isRevision
    ? !!form.parentBudgetId
    : !!form.name && !!form.fiscalYear;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Budget</Button>
      </DialogTrigger>
      <DialogContent title="New Budget" description="Create an annual budget or revision.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Type *</label>
            <Select value={form.budgetType} onChange={(e) => set('budgetType', e.target.value)} className="h-8 text-xs">
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
                {approvedBudgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — FY{b.fiscalYear} v{b.version}
                  </option>
                ))}
              </Select>
              {approvedBudgets.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No approved budgets available to revise.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Budget Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Annual Budget"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Fiscal Year *</label>
                <Input
                  type="number"
                  value={form.fiscalYear}
                  onChange={(e) => set('fiscalYear', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message ?? 'Failed to create budget'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── BudgetLineEditor ─────────────────────────────────────────────────────────

interface LineRow {
  key: number;
  accountId: string;
  costCentreId: string;
  amounts: Record<number, string>; // periodNumber → amount string
}

function BudgetLineEditor({
  organisationId,
  budget,
  onBack,
}: {
  organisationId: string;
  budget: budgets.BudgetDetail;
  onBack: () => void;
}) {
  const qc = useQueryClient();

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId],
    queryFn: () => listAccounts(organisationId, { pageSize: 500, isActive: true }),
  });

  const { data: costCentresData } = useQuery({
    queryKey: ['cost-centres', organisationId],
    queryFn: () => budgets.listCostCentres(organisationId),
  });

  // Build initial rows from existing lines
  const initialRows = useMemo((): LineRow[] => {
    if (!budget.lines.length) {
      return [{ key: 0, accountId: '', costCentreId: '', amounts: {} }];
    }
    // Group by accountId + costCentreId
    const map = new Map<string, LineRow>();
    budget.lines.forEach((l) => {
      const k = `${l.accountId}::${l.costCentreId ?? ''}`;
      if (!map.has(k)) {
        map.set(k, {
          key: map.size,
          accountId: l.accountId,
          costCentreId: l.costCentreId ?? '',
          amounts: {},
        });
      }
      map.get(k)!.amounts[l.periodNumber] = l.amount;
    });
    return Array.from(map.values());
  }, [budget.lines]);

  const [rows, setRows] = useState<LineRow[]>(initialRows);
  const nextKey = rows.length ? Math.max(...rows.map((r) => r.key)) + 1 : 0;

  const updateRow = (key: number, field: 'accountId' | 'costCentreId', value: string) =>
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const updateAmount = (key: number, period: number, value: string) =>
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, amounts: { ...r.amounts, [period]: value } } : r,
      ),
    );

  const addRow = () =>
    setRows((prev) => [...prev, { key: nextKey, accountId: '', costCentreId: '', amounts: {} }]);

  const removeRow = (key: number) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const mutation = useMutation({
    mutationFn: () => {
      const lines: budgets.BudgetLineInput[] = [];
      for (const row of rows) {
        if (!row.accountId) continue;
        for (const period of PERIODS) {
          const rawAmt = row.amounts[period];
          const amt = parseFloat(rawAmt ?? '0') || 0;
          if (amt !== 0) {
            lines.push({
              accountId: row.accountId,
              costCentreId: row.costCentreId || null,
              periodNumber: period,
              amount: amt,
            });
          }
        }
      }
      return budgets.updateBudgetLines(organisationId, budget.id, lines);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budget', organisationId, budget.id] });
      void qc.invalidateQueries({ queryKey: ['budgets', organisationId] });
      onBack();
    },
  });

  const accounts = (accountsData?.accounts ?? []).filter(
    (a) => !a.isLocked && !a.isControlAccount && (a.class === 'EXPENSE' || a.class === 'REVENUE' || a.class === 'ASSET'),
  );
  const centres = costCentresData ?? [];

  const rowTotal = (row: LineRow) =>
    PERIODS.reduce((s, p) => s + (parseFloat(row.amounts[p] ?? '0') || 0), 0);

  const periodTotal = (period: number) =>
    rows.reduce((s, r) => s + (parseFloat(r.amounts[period] ?? '0') || 0), 0);

  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
          <div>
            <p className="text-sm font-semibold">{budget.name}</p>
            <p className="text-xs text-muted-foreground">
              FY{budget.fiscalYear} · {BUDGET_TYPE_LABELS[budget.budgetType]} v{budget.version} · Enter amounts by period
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={mutation.isPending || budget.isApproved}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Saving…' : 'Save Lines'}
        </Button>
      </div>

      {budget.isApproved && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This budget is approved and cannot be edited. Create a Revised version to make changes.
        </p>
      )}

      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? 'Failed to save'}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs w-full min-w-[1200px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-52">Account</th>
              <th className="text-left px-3 py-2 font-medium w-36">Cost Centre</th>
              {PERIODS.map((p) => (
                <th key={p} className="text-right px-2 py-2 font-medium w-20">P{p}</th>
              ))}
              <th className="text-right px-3 py-2 font-medium w-24">Annual</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t hover:bg-muted/20">
                <td className="px-2 py-1">
                  <select
                    value={row.accountId}
                    onChange={(e) => updateRow(row.key, 'accountId', e.target.value)}
                    disabled={budget.isApproved}
                    className="w-full h-7 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">— Select account —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={row.costCentreId}
                    onChange={(e) => updateRow(row.key, 'costCentreId', e.target.value)}
                    disabled={budget.isApproved}
                    className="w-full h-7 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">No CC</option>
                    {centres.filter((c) => c.isActive).map((c) => (
                      <option key={c.id} value={c.id}>{c.code} {c.name}</option>
                    ))}
                  </select>
                </td>
                {PERIODS.map((p) => (
                  <td key={p} className="px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amounts[p] ?? ''}
                      onChange={(e) => updateAmount(row.key, p, e.target.value)}
                      disabled={budget.isApproved}
                      placeholder="0"
                      className="w-full h-7 text-right text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                  </td>
                ))}
                <td className="px-3 py-1 text-right font-medium tabular-nums">
                  {fmt(rowTotal(row))}
                </td>
                <td className="px-1 py-1">
                  {!budget.isApproved && rows.length > 1 && (
                    <button onClick={() => removeRow(row.key)} className="text-muted-foreground hover:text-destructive p-1">
                      <X size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* Totals row */}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2 text-xs">Total</td>
              <td />
              {PERIODS.map((p) => (
                <td key={p} className="px-2 py-2 text-right text-xs tabular-nums">
                  {periodTotal(p) !== 0 ? fmt(periodTotal(p)) : ''}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs tabular-nums">{fmt(grandTotal)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {!budget.isApproved && (
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus size={12} /> Add Row
        </Button>
      )}
    </div>
  );
}

// ─── VarianceView ─────────────────────────────────────────────────────────────

function VarianceView({
  organisationId,
  budget,
  costCentres,
}: {
  organisationId: string;
  budget: budgets.Budget;
  costCentres: budgets.CostCentre[];
}) {
  const [ccFilter, setCcFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['budget-variance', organisationId, budget.id, ccFilter],
    queryFn: () => budgets.getBudgetVariance(organisationId, budget.id, ccFilter || undefined),
  });

  const lines = data ?? [];
  const hasCostCentres = lines.some((l) => l.costCentreId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Budget vs Actual — {budget.name}</p>
          <p className="text-xs text-muted-foreground">
            FY{budget.fiscalYear} · {BUDGET_TYPE_LABELS[budget.budgetType]} v{budget.version}
          </p>
        </div>
        <Select value={ccFilter} onChange={(e) => setCcFilter(e.target.value)} className="h-7 text-xs w-48">
          <option value="">All cost centres</option>
          {costCentres.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>{c.code} {c.name}</option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : lines.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No budget lines to display.</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  {hasCostCentres && <TableHead>Cost Centre</TableHead>}
                  <TableHead className="text-right">Budgeted</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Var %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => {
                  const varNum = parseFloat(line.variance);
                  const varPct = line.variancePct ? parseFloat(line.variancePct) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{line.accountCode} — {line.accountName}</TableCell>
                      {hasCostCentres && (
                        <TableCell className="text-xs text-muted-foreground">
                          {line.costCentreCode ? `${line.costCentreCode} ${line.costCentreName}` : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right text-xs tabular-nums">{fmt(line.budgeted)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmt(line.actual)}</TableCell>
                      <TableCell className={cn('text-right text-xs font-semibold tabular-nums', varNum < 0 ? 'text-destructive' : 'text-green-600')}>
                        {fmt(varNum)}
                      </TableCell>
                      <TableCell className={cn('text-right text-xs tabular-nums', varPct !== null && varPct < 0 ? 'text-destructive' : 'text-green-600')}>
                        {varPct !== null ? `${varPct.toFixed(1)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── NewCostCentreDialog ──────────────────────────────────────────────────────

function NewCostCentreDialog({
  organisationId,
  centres,
}: {
  organisationId: string;
  centres: budgets.CostCentre[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', level: 'DEPARTMENT' as budgets.CostCentreLevel, parentId: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validParents = centres.filter((c) => {
    const parentLevelIdx = LEVEL_ORDER.indexOf(c.level);
    const childLevelIdx = LEVEL_ORDER.indexOf(form.level);
    return parentLevelIdx < childLevelIdx && c.isActive;
  });

  const mutation = useMutation({
    mutationFn: () => budgets.createCostCentre(organisationId, {
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      level: form.level,
      parentId: form.parentId || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cost-centres', organisationId] });
      setOpen(false);
      setForm({ code: '', name: '', description: '', level: 'DEPARTMENT', parentId: '' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Cost Centre</Button>
      </DialogTrigger>
      <DialogContent title="New Cost Centre" description="Add a node to the cost centre hierarchy.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="CC001" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Name *</label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Finance" className="h-8 text-xs" />
            </div>
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
                <option value="">No parent (top level)</option>
                {validParents.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message ?? 'Error'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.code || !form.name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditCostCentreDialog ─────────────────────────────────────────────────────

function EditCostCentreDialog({
  organisationId,
  cc,
  centres,
}: {
  organisationId: string;
  cc: budgets.CostCentre;
  centres: budgets.CostCentre[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: cc.name,
    description: cc.description ?? '',
    parentId: cc.parentId ?? '',
    isActive: cc.isActive,
  });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const validParents = centres.filter((c) => {
    if (c.id === cc.id) return false;
    const parentLevelIdx = LEVEL_ORDER.indexOf(c.level);
    const childLevelIdx = LEVEL_ORDER.indexOf(cc.level);
    return parentLevelIdx < childLevelIdx && c.isActive;
  });

  const mutation = useMutation({
    mutationFn: () => budgets.updateCostCentre(organisationId, cc.id, {
      name: form.name,
      description: form.description || undefined,
      parentId: form.parentId || null,
      isActive: form.isActive,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cost-centres', organisationId] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
      </DialogTrigger>
      <DialogContent title={`Edit — ${cc.code}`} description="">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Parent</label>
            <Select value={form.parentId} onChange={(e) => set('parentId', e.target.value)} className="h-8 text-xs">
              <option value="">No parent</option>
              {validParents.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active
          </label>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message ?? 'Error'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CostCentreTree ───────────────────────────────────────────────────────────

function CostCentreTree({
  organisationId,
  centres,
}: {
  organisationId: string;
  centres: budgets.CostCentre[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Build parent→children map
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, budgets.CostCentre[]>();
    for (const c of centres) {
      const key = c.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [centres]);

  function renderNodes(parentId: string | null, depth: number): React.ReactNode {
    const nodes = childrenOf.get(parentId) ?? [];
    if (!nodes.length) return null;

    return nodes.map((cc) => {
      const hasChildren = (childrenOf.get(cc.id)?.length ?? 0) > 0;
      const isExpanded = expanded.has(cc.id);
      const Icon = LEVEL_ICON[cc.level];

      return (
        <div key={cc.id}>
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-sm border-b border-border/40 group',
              !cc.isActive && 'opacity-50',
            )}
            style={{ paddingLeft: `${12 + depth * 20}px` }}
          >
            {hasChildren ? (
              <button onClick={() => toggle(cc.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-[13px] flex-shrink-0" />
            )}
            <Icon size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-xs text-muted-foreground w-20 flex-shrink-0">{cc.code}</span>
            <span className="font-medium flex-1">{cc.name}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
              {LEVEL_LABELS[cc.level]}
            </Badge>
            {cc.parent && (
              <span className="text-xs text-muted-foreground hidden group-hover:inline flex-shrink-0">
                ↑ {cc.parent.code}
              </span>
            )}
            <Badge variant={cc.isActive ? 'success' : 'secondary'} className="text-[10px] h-4 px-1.5 flex-shrink-0">
              {cc.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <EditCostCentreDialog organisationId={organisationId} cc={cc} centres={centres} />
            </div>
          </div>
          {isExpanded && renderNodes(cc.id, depth + 1)}
        </div>
      );
    });
  }

  if (!centres.length) {
    return (
      <div className="py-16 text-center space-y-1">
        <p className="text-sm text-muted-foreground">No cost centres yet.</p>
        <p className="text-xs text-muted-foreground">Click <strong>New Cost Centre</strong> to build the hierarchy.</p>
      </div>
    );
  }

  return <div>{renderNodes(null, 0)}</div>;
}

// ─── BudgetsPage ──────────────────────────────────────────────────────────────

type Tab = 'budgets' | 'cost-centres' | 'departments';
type BudgetView = { kind: 'list' } | { kind: 'lines'; budget: budgets.BudgetDetail } | { kind: 'variance'; budget: budgets.Budget };

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
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PiggyBank size={18} /> Budgets & Cost Centres
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Annual budgets, variance analysis, and organisational hierarchy
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'budgets' && budgetView.kind === 'list' && (
            <NewBudgetDialog organisationId={organisationId} existingBudgets={budgetList} />
          )}
          {tab === 'cost-centres' && (
            <NewCostCentreDialog organisationId={organisationId} centres={costCentres} />
          )}
          {tab === 'departments' && (
            <NewDeptDialog organisationId={organisationId} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setBudgetView({ kind: 'list' }); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Budgets tab ── */}
      {tab === 'budgets' && budgetView.kind === 'list' && (
        <Card>
          <CardContent className="p-0">
            {budgetsLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : budgetList.length === 0 ? (
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
                      <TableCell>
                        <Badge variant={BUDGET_TYPE_VARIANT[b.budgetType] as any} className="text-[10px]">
                          {BUDGET_TYPE_LABELS[b.budgetType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs tabular-nums">{b.fiscalYear}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">v{b.version}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{b.lineCount}</TableCell>
                      <TableCell>
                        <Badge variant={b.isApproved ? 'success' : 'secondary'}>
                          {b.isApproved ? 'Approved' : 'Draft'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.parentBudget ? (
                          <span className="flex items-center gap-1">
                            <GitBranch size={10} /> {b.parentBudget.name} v{b.parentBudget.version}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openLines(b)}
                            className="text-xs text-primary hover:underline"
                          >
                            Lines
                          </button>
                          <button
                            onClick={() => setBudgetView({ kind: 'variance', budget: b })}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <BarChart3 size={11} /> Variance
                          </button>
                          {!b.isApproved && (
                            <button
                              onClick={() => approveMutation.mutate(b.id)}
                              disabled={approveMutation.isPending}
                              className="text-xs text-green-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                              <CheckCircle size={11} /> Approve
                            </button>
                          )}
                          {!b.isApproved && (
                            <button
                              onClick={() => { if (confirm('Delete this draft budget?')) deleteMutation.mutate(b.id); }}
                              className="text-xs text-destructive hover:underline flex items-center gap-1"
                            >
                              <Trash2 size={11} />
                            </button>
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

      {tab === 'budgets' && budgetView.kind === 'lines' && (
        <BudgetLineEditor
          organisationId={organisationId}
          budget={budgetView.budget}
          onBack={() => setBudgetView({ kind: 'list' })}
        />
      )}

      {tab === 'budgets' && budgetView.kind === 'variance' && (
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setBudgetView({ kind: 'list' })}>
            ← Back to Budgets
          </Button>
          <VarianceView
            organisationId={organisationId}
            budget={budgetView.budget}
            costCentres={costCentres}
          />
        </div>
      )}

      {/* ── Cost Centres tab ── */}
      {tab === 'cost-centres' && (
        <Card>
          <CardContent className="p-0">
            {ccLoading ? (
              <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <CostCentreTree organisationId={organisationId} centres={costCentres} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Departments tab ── */}
      {tab === 'departments' && (
        <Card>
          <CardContent className="p-0">
            {deptLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : departments.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No departments yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{d.code}</TableCell>
                      <TableCell className="text-sm font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Badge variant={d.isActive ? 'success' : 'secondary'}>{d.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['departments', organisationId] });
      setOpen(false);
      setCode('');
      setName('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Department</Button>
      </DialogTrigger>
      <DialogContent title="New Department" description="">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DEPT01" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance" className="h-8 text-xs" />
            </div>
          </div>
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
