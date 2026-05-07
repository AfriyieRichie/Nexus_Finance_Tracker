import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, Download, Printer, ChevronRight, X,
  Loader2, TrendingDown, Minus, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  getIncomeStatement, getIncomeStatementDrilldown,
} from '@/services/reports.service';
import type {
  ISSection, ISSubtotalLine, IncomeStatementResult, ISDrilldownResult,
} from '@/services/reports.service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (n < 0) return `(${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))})`;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function numClass(v: string | null | undefined): string {
  if (v == null) return '';
  const n = Number(v);
  if (n < 0) return 'text-red-500';
  return '';
}

// ─── Quick-select date helpers ────────────────────────────────────────────────

function toIso(d: Date) { return d.toISOString().slice(0, 10); }

const QUICK_SELECTS = [
  { label: 'This Month', key: 'month' },
  { label: 'Last Month', key: 'last_month' },
  { label: 'QTD',        key: 'qtd' },
  { label: 'YTD',        key: 'ytd' },
  { label: 'Last Year',  key: 'last_year' },
] as const;

function resolveQuick(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (key) {
    case 'month': return {
      from: toIso(new Date(y, m, 1)),
      to:   toIso(new Date(y, m + 1, 0)),
    };
    case 'last_month': return {
      from: toIso(new Date(y, m - 1, 1)),
      to:   toIso(new Date(y, m, 0)),
    };
    case 'qtd': {
      const q = Math.floor(m / 3);
      return { from: toIso(new Date(y, q * 3, 1)), to: toIso(new Date(y, m + 1, 0)) };
    }
    case 'ytd': return { from: `${y}-01-01`, to: toIso(new Date(y, m + 1, 0)) };
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:    return { from: `${y}-01-01`, to: toIso(now) };
  }
}

// ─── Column config ────────────────────────────────────────────────────────────

interface ColConfig {
  hasPP: boolean;
  hasPY: boolean;
  showPct: boolean;
  fromDate: string;
  toDate: string;
  ppFrom: string | null;
  ppTo: string | null;
  pyFrom: string | null;
  pyTo: string | null;
}

// ─── Drill-down modal ─────────────────────────────────────────────────────────

function DrilldownModal({
  organisationId, accountId, fromDate, toDate, onClose,
}: { organisationId: string; accountId: string; fromDate: string; toDate: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<ISDrilldownResult>({
    queryKey: ['is-drilldown', organisationId, accountId, fromDate, toDate],
    queryFn: () => getIncomeStatementDrilldown(organisationId, accountId, fromDate, toDate),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background border rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col m-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            {data ? (
              <>
                <p className="font-semibold text-sm">{data.account.code} · {data.account.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.fromDate} → {data.toDate} · Total: <span className="font-mono font-semibold">{fmt(data.total)}</span>
                </p>
              </>
            ) : <Skeleton className="h-5 w-48" />}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X size={14} /></Button>
        </div>
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : !data || data.entries.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No transactions in this period</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Ref</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-right px-3 py-2 font-medium">Debit</th>
                  <th className="text-right px-3 py-2 font-medium">Credit</th>
                  <th className="text-right px-3 py-2 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-accent/30">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap">{e.date}</td>
                    <td className="px-3 py-1.5 font-mono text-[10px]">{e.journalRef}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[240px] truncate">{e.journalDescription}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(e.debit) > 0 ? fmt(e.debit) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{Number(e.credit) > 0 ? fmt(e.credit) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums font-medium">{fmt(e.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Variance cell ────────────────────────────────────────────────────────────

function VarCell({ current, prior }: { current: string; prior: string | null }) {
  if (prior == null) return null;
  const variance = Number(current) - Number(prior);
  const color = variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-500' : 'text-muted-foreground';
  const Icon  = variance > 0 ? TrendingUp : variance < 0 ? TrendingDown : Minus;
  return (
    <td className={cn('text-right px-2 font-mono text-[11px] tabular-nums', color)}>
      <span className="inline-flex items-center gap-0.5">
        <Icon size={9} />
        {fmt(String(variance))}
      </span>
    </td>
  );
}

// ─── IS section renderer ──────────────────────────────────────────────────────

function ISSectionBlock({
  section, col, onDrilldown,
}: { section: ISSection; col: ColConfig; onDrilldown: (id: string) => void }) {
  if (!section.groups.some((g) => g.lines.length > 0)) return null;

  return (
    <div className="mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 border-b pb-1">
        {section.label}
      </p>
      {section.groups.map((group) => (
        group.lines.length === 0 ? null : (
          <div key={group.label} className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5 pl-1">
              {group.label}
            </p>
            <table className="w-full">
              <tbody>
                {group.lines.map((line) => (
                  <tr
                    key={line.accountId}
                    className="group/row border-b border-dashed border-border/40 hover:bg-accent/30 cursor-pointer"
                    onClick={() => onDrilldown(line.accountId)}
                  >
                    <td className="py-1 pr-2 text-[11px] text-muted-foreground font-mono w-14">{line.code}</td>
                    <td className="py-1 pr-4 text-[12px]">
                      <span className="group-hover/row:text-primary transition-colors flex items-center gap-1">
                        {line.name}
                        <ChevronRight size={10} className="opacity-0 group-hover/row:opacity-60 transition-opacity" />
                      </span>
                    </td>
                    <td className={cn('py-1 text-right font-mono text-[12px] tabular-nums w-24', numClass(line.current))}>{fmt(line.current)}</td>
                    <td className={cn('py-1 text-right font-mono text-[12px] tabular-nums text-muted-foreground w-24', numClass(line.ytd))}>{fmt(line.ytd)}</td>
                    {col.hasPP && <td className={cn('py-1 text-right font-mono text-[12px] tabular-nums text-muted-foreground/60 w-24', numClass(line.priorPeriod))}>{fmt(line.priorPeriod)}</td>}
                    {col.hasPP && <VarCell current={line.current} prior={line.priorPeriod} />}
                    {col.hasPY && <td className={cn('py-1 text-right font-mono text-[12px] tabular-nums text-muted-foreground/60 w-24', numClass(line.priorYear))}>{fmt(line.priorYear)}</td>}
                    {col.hasPY && <VarCell current={line.current} prior={line.priorYear} />}
                    {col.showPct && <td className="py-1 text-right text-[10px] text-muted-foreground/70 w-14">{line.pctOfRevenue != null ? `${line.pctOfRevenue}%` : ''}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 w-14" />
                  <td className="py-1.5 pr-4 text-[11px] font-semibold text-muted-foreground">{group.label}</td>
                  <td className={cn('py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums w-24', numClass(group.subtotal))}>{fmt(group.subtotal)}</td>
                  <td className={cn('py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums text-muted-foreground w-24', numClass(group.ytdSubtotal))}>{fmt(group.ytdSubtotal)}</td>
                  {col.hasPP && <td className={cn('py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums text-muted-foreground/60 w-24', numClass(group.priorPeriodSubtotal))}>{fmt(group.priorPeriodSubtotal)}</td>}
                  {col.hasPP && <VarCell current={group.subtotal} prior={group.priorPeriodSubtotal} />}
                  {col.hasPY && <td className={cn('py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums text-muted-foreground/60 w-24', numClass(group.priorYearSubtotal))}>{fmt(group.priorYearSubtotal)}</td>}
                  {col.hasPY && <VarCell current={group.subtotal} prior={group.priorYearSubtotal} />}
                  {col.showPct && <td className="py-1.5 text-right text-[10px] text-muted-foreground/70 w-14">{group.pctOfRevenue != null ? `${group.pctOfRevenue}%` : ''}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )
      ))}
      {/* Section subtotal */}
      <div className="flex border-t-2 border-foreground/20 pt-1.5 pb-3 mt-1">
        <span className="w-14 shrink-0" />
        <span className="flex-1 text-xs font-bold text-muted-foreground">Total {section.label}</span>
        <span className={cn('font-mono text-[13px] font-bold tabular-nums w-24 text-right', numClass(section.subtotal))}>{fmt(section.subtotal)}</span>
        <span className={cn('font-mono text-[13px] font-bold tabular-nums text-muted-foreground w-24 text-right', numClass(section.ytdSubtotal))}>{fmt(section.ytdSubtotal)}</span>
        {col.hasPP && <span className={cn('font-mono text-[13px] font-bold tabular-nums text-muted-foreground/60 w-24 text-right', numClass(section.priorPeriodSubtotal))}>{fmt(section.priorPeriodSubtotal)}</span>}
        {col.hasPP && <span className="w-20" />}
        {col.hasPY && <span className={cn('font-mono text-[13px] font-bold tabular-nums text-muted-foreground/60 w-24 text-right', numClass(section.priorYearSubtotal))}>{fmt(section.priorYearSubtotal)}</span>}
        {col.hasPY && <span className="w-20" />}
        {col.showPct && <span className="text-[10px] text-muted-foreground/70 w-14 text-right">{section.pctOfRevenue != null ? `${section.pctOfRevenue}%` : ''}</span>}
      </div>
    </div>
  );
}

// ─── Key metric row ───────────────────────────────────────────────────────────

type MetricTier = 'primary' | 'secondary' | 'highlight';

function MetricRow({
  line, col, tier = 'secondary', marginPct,
}: { line: ISSubtotalLine; col: ColConfig; tier?: MetricTier; marginPct?: string }) {
  const bg = tier === 'highlight'
    ? 'bg-primary/5 border border-primary/20 rounded'
    : tier === 'primary'
    ? 'bg-muted/50 rounded'
    : '';
  const textSize = tier === 'highlight' ? 'text-sm font-bold' : 'text-[13px] font-bold';
  const color = tier === 'highlight' ? 'text-primary' : '';

  return (
    <div className={cn('flex items-center py-2 px-3 mt-1 mb-1', bg)}>
      <span className="w-14 shrink-0" />
      <span className={cn('flex-1', textSize, color)}>
        {line.label}
        {marginPct != null && (
          <span className="ml-2 text-[10px] font-normal text-muted-foreground opacity-80">
            ({marginPct}% margin)
          </span>
        )}
      </span>
      <span className={cn('font-mono tabular-nums w-24 text-right', textSize, color, numClass(line.current))}>{fmt(line.current)}</span>
      <span className={cn('font-mono tabular-nums text-muted-foreground w-24 text-right', textSize, numClass(line.ytd))}>{fmt(line.ytd)}</span>
      {col.hasPP && <span className={cn('font-mono tabular-nums text-muted-foreground/60 w-24 text-right', textSize, numClass(line.priorPeriod))}>{fmt(line.priorPeriod)}</span>}
      {col.hasPP && (line.priorPeriod != null ? (
        <span className={cn('text-[11px] font-mono tabular-nums w-20 text-right', Number(line.current) - Number(line.priorPeriod) >= 0 ? 'text-green-600' : 'text-red-500')}>
          {fmt(String(Number(line.current) - Number(line.priorPeriod)))}
        </span>
      ) : <span className="w-20" />)}
      {col.hasPY && <span className={cn('font-mono tabular-nums text-muted-foreground/60 w-24 text-right', textSize, numClass(line.priorYear))}>{fmt(line.priorYear)}</span>}
      {col.hasPY && (line.priorYear != null ? (
        <span className={cn('text-[11px] font-mono tabular-nums w-20 text-right', Number(line.current) - Number(line.priorYear) >= 0 ? 'text-green-600' : 'text-red-500')}>
          {fmt(String(Number(line.current) - Number(line.priorYear)))}
        </span>
      ) : <span className="w-20" />)}
      {col.showPct && <span className="text-[10px] text-muted-foreground/70 w-14 text-right">{line.pctOfRevenue != null ? `${line.pctOfRevenue}%` : ''}</span>}
    </div>
  );
}

// ─── Column header bar ────────────────────────────────────────────────────────

function ColHeaders({ data, col }: { data: IncomeStatementResult; col: ColConfig }) {
  const short = (s: string) => s.slice(0, 10);
  return (
    <div className="flex items-end mb-3 border-b pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="w-14 shrink-0" />
      <span className="flex-1" />
      <span className="w-24 text-right">Current<br /><span className="font-normal normal-case">{short(data.period.fromDate)}→{short(data.period.toDate)}</span></span>
      <span className="w-24 text-right text-muted-foreground/70">YTD<br /><span className="font-normal normal-case">{short(data.period.ytdFromDate)}→</span></span>
      {col.hasPP && (
        <>
          <span className="w-24 text-right text-muted-foreground/50">Prior Period<br /><span className="font-normal normal-case">{short(col.ppFrom ?? '')}→</span></span>
          <span className="w-20 text-right text-muted-foreground/50">PP Var</span>
        </>
      )}
      {col.hasPY && (
        <>
          <span className="w-24 text-right text-muted-foreground/50">Prior Year<br /><span className="font-normal normal-case">{short(col.pyFrom ?? '')}→</span></span>
          <span className="w-20 text-right text-muted-foreground/50">PY Var</span>
        </>
      )}
      {col.showPct && <span className="w-14 text-right text-muted-foreground/50">% Rev</span>}
    </div>
  );
}

// ─── Separator ────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="my-5 border-t border-dashed border-border/60" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function IncomeStatementPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const now = new Date();
  const [fromDate, setFromDate]       = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate]           = useState(now.toISOString().slice(0, 10));
  const [comparePP, setComparePP]     = useState(false);
  const [comparePY, setComparePY]     = useState(false);
  const [showZero, setShowZero]       = useState(false);
  const [showPct, setShowPct]         = useState(true);
  const [drillAccount, setDrillAccount] = useState<string | null>(null);

  const comparisons = [
    ...(comparePP ? ['prior_period'] : []),
    ...(comparePY ? ['prior_year'] : []),
  ].join(',') || undefined;

  const params = { fromDate, toDate, comparisons, showZero };

  const { data, isLoading, isFetching } = useQuery<IncomeStatementResult>({
    queryKey: ['income-statement', activeOrganisationId, params],
    queryFn: () => getIncomeStatement(activeOrganisationId!, params),
    enabled: !!activeOrganisationId,
  });

  const col: ColConfig = {
    hasPP: comparePP && !!data?.period.priorPeriodFromDate,
    hasPY: comparePY && !!data?.period.priorYearFromDate,
    showPct,
    fromDate, toDate,
    ppFrom: data?.period.priorPeriodFromDate ?? null,
    ppTo: data?.period.priorPeriodToDate ?? null,
    pyFrom: data?.period.priorYearFromDate ?? null,
    pyTo: data?.period.priorYearToDate ?? null,
  };

  const handleDrilldown = useCallback((id: string) => setDrillAccount(id), []);

  function applyQuick(key: string) {
    const { from, to } = resolveQuick(key);
    setFromDate(from);
    setToDate(to);
  }

  function buildCsv(): string {
    if (!data) return '';
    const hasPP = col.hasPP, hasPY = col.hasPY;
    const hdrs = ['Account Code', 'Account Name', `Current (${fromDate}→${toDate})`, `YTD (${data.period.ytdFromDate}→${toDate})`];
    if (hasPP) hdrs.push(`Prior Period (${data.period.priorPeriodFromDate})`, 'PP Variance');
    if (hasPY) hdrs.push(`Prior Year (${data.period.priorYearFromDate})`, 'PY Variance');
    if (showPct) hdrs.push('% of Revenue');
    const rows: string[] = [hdrs.join(',')];

    function addSection(s: ISSection) {
      rows.push(`,,${s.label}`);
      for (const g of s.groups) {
        rows.push(`,,${g.label}`);
        for (const l of g.lines) {
          const r = [l.code, `"${l.name}"`, l.current, l.ytd];
          if (hasPP) r.push(l.priorPeriod ?? '', l.priorPeriod != null ? String(Number(l.current) - Number(l.priorPeriod)) : '');
          if (hasPY) r.push(l.priorYear ?? '', l.priorYear != null ? String(Number(l.current) - Number(l.priorYear)) : '');
          if (showPct) r.push(l.pctOfRevenue ?? '');
          rows.push(r.join(','));
        }
      }
    }

    function addMetric(m: ISSubtotalLine) {
      const r = ['', `"${m.label}"`, m.current, m.ytd];
      if (hasPP) r.push(m.priorPeriod ?? '', m.priorPeriod != null ? String(Number(m.current) - Number(m.priorPeriod)) : '');
      if (hasPY) r.push(m.priorYear ?? '', m.priorYear != null ? String(Number(m.current) - Number(m.priorYear)) : '');
      if (showPct) r.push(m.pctOfRevenue ?? '');
      rows.push(r.join(','));
      rows.push('');
    }

    addSection(data.revenue);
    addSection(data.costOfSales);
    addMetric(data.grossProfit);
    addSection(data.operatingExpenses);
    addMetric(data.ebitda);
    addMetric(data.operatingProfit);
    if (data.exceptionalItems) { addSection(data.exceptionalItems); }
    if (data.financeIncome)    { addSection(data.financeIncome); }
    if (data.financeCosts)     { addSection(data.financeCosts); }
    addMetric(data.profitBeforeTax);
    if (data.taxExpense) { addSection(data.taxExpense); }
    addMetric(data.profitForPeriodLine);
    return rows.join('\n');
  }

  function downloadCsv() {
    const csv = buildCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `income-statement-${fromDate}-${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl print:p-0">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp size={18} /> Income Statement
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Statement of Profit or Loss · IAS 1 · {currency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={downloadCsv} disabled={!data}>
            <Download size={13} /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input type="date" className="h-8 text-xs w-36" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input type="date" className="h-8 text-xs w-36" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Quick select</label>
          <div className="flex gap-1">
            {QUICK_SELECTS.map(({ label, key }) => (
              <Button key={key} variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => applyQuick(key)}>{label}</Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Compare</label>
          <div className="flex gap-1">
            <Button variant={comparePP ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setComparePP((v) => !v)}>
              Prior Period
            </Button>
            <Button variant={comparePY ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setComparePY((v) => !v)}>
              Prior Year
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Options</label>
          <div className="flex gap-1">
            <Button variant={showPct ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setShowPct((v) => !v)}>
              % Rev
            </Button>
            <Button variant={showZero ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setShowZero((v) => !v)}>
              Show zeros
            </Button>
          </div>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block text-center mb-6">
        <p className="text-lg font-bold">{data?.organisation.name}</p>
        <p className="text-base font-semibold mt-1">Statement of Profit or Loss</p>
        <p className="text-sm text-muted-foreground mt-0.5">{data?.period.fromDate} to {data?.period.toDate} · {currency}</p>
      </div>

      {/* Margin summary badges */}
      {data && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {[
            { label: 'Gross Margin', value: `${data.grossMarginPct.current}%` },
            { label: 'EBITDA Margin', value: `${data.ebitdaMarginPct.current}%` },
            { label: 'Operating Margin', value: `${data.operatingMarginPct.current}%` },
            { label: 'Net Margin', value: `${data.netMarginPct.current}%` },
          ].map(({ label, value }) => {
            const n = parseFloat(value);
            return (
              <Badge key={label} variant={n >= 0 ? 'success' : 'destructive'} className="gap-1 text-xs">
                {n >= 0 ? <TrendingUp size={10} /> : <AlertCircle size={10} />}
                {label}: {value}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(12)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : !data ? null : (
        <Card className="print:shadow-none print:border-none">
          <CardContent className="p-6 space-y-0">
            <ColHeaders data={data} col={col} />

            {/* ── REVENUE ── */}
            <p className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-2">Revenue</p>
            <ISSectionBlock section={data.revenue} col={col} onDrilldown={handleDrilldown} />

            {/* ── COST OF SALES ── */}
            <ISSectionBlock section={data.costOfSales} col={col} onDrilldown={handleDrilldown} />

            {/* ── GROSS PROFIT ── */}
            <MetricRow line={data.grossProfit} col={col} tier="primary" marginPct={data.grossMarginPct.current} />

            <Divider />

            {/* ── OPERATING EXPENSES ── */}
            <p className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-2">Operating Expenses</p>
            <ISSectionBlock section={data.operatingExpenses} col={col} onDrilldown={handleDrilldown} />

            {/* ── EBITDA (non-IFRS highlight) ── */}
            <div className="flex items-center gap-2 mb-0.5">
              <MetricRow line={data.ebitda} col={col} tier="secondary" marginPct={data.ebitdaMarginPct.current} />
            </div>
            <div className="flex pl-3 mb-1 text-[10px] text-muted-foreground/60 italic">
              <span className="w-14" />
              <span className="flex-1">of which D&A: {fmt(data.depreciationAmortisation.current)} current / {fmt(data.depreciationAmortisation.ytd)} YTD</span>
            </div>

            {/* ── OPERATING PROFIT (EBIT) ── */}
            <MetricRow line={data.operatingProfit} col={col} tier="primary" marginPct={data.operatingMarginPct.current} />

            <Divider />

            {/* ── EXCEPTIONAL ITEMS (if any) ── */}
            {data.exceptionalItems && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1">Exceptional Items</p>
                <ISSectionBlock section={data.exceptionalItems} col={col} onDrilldown={handleDrilldown} />
              </>
            )}

            {/* ── FINANCE ITEMS ── */}
            {(data.financeIncome || data.financeCosts) && (
              <>
                <p className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-2">Finance Items</p>
                {data.financeIncome && <ISSectionBlock section={data.financeIncome} col={col} onDrilldown={handleDrilldown} />}
                {data.financeCosts  && <ISSectionBlock section={data.financeCosts}  col={col} onDrilldown={handleDrilldown} />}
                <MetricRow line={data.netFinanceItems} col={col} tier="secondary" />
                <Divider />
              </>
            )}

            {/* ── PROFIT BEFORE TAX ── */}
            <MetricRow line={data.profitBeforeTax} col={col} tier="primary" />

            {/* ── TAX ── */}
            {data.taxExpense && (
              <>
                <ISSectionBlock section={data.taxExpense} col={col} onDrilldown={handleDrilldown} />
              </>
            )}

            <div className="my-3" />

            {/* ── PROFIT FOR THE PERIOD ── */}
            <MetricRow line={data.profitForPeriodLine} col={col} tier="highlight" marginPct={data.netMarginPct.current} />

            {/* IFRS note */}
            <p className="text-[10px] text-muted-foreground/50 mt-4 pl-3">
              * EBITDA is a non-IFRS measure presented for analytical purposes. All other line items comply with IAS 1.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Drill-down modal */}
      {drillAccount && activeOrganisationId && (
        <DrilldownModal
          organisationId={activeOrganisationId}
          accountId={drillAccount}
          fromDate={fromDate}
          toDate={toDate}
          onClose={() => setDrillAccount(null)}
        />
      )}
    </div>
  );
}
