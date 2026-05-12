import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Download, Printer, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getChangesInEquity, ChangesInEquityResult } from '@/services/reports.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv } from '@/utils/export';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  const abs = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return n < 0 ? `(${abs})` : abs;
}

function toIso(d: Date) { return d.toISOString().slice(0, 10); }
function endOfMonth(d: Date) { return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return toIso(new Date(d.getFullYear(), (q + 1) * 3, 0));
}

const QUICK_SELECTS = [
  { label: 'This Month',   resolve: (n: Date) => ({ from: toIso(new Date(n.getFullYear(), n.getMonth(), 1)), to: endOfMonth(n) }) },
  { label: 'Last Month',   resolve: (n: Date) => { const d = new Date(n.getFullYear(), n.getMonth() - 1, 1); return { from: toIso(d), to: endOfMonth(d) }; } },
  { label: 'This Quarter', resolve: (n: Date) => { const q = Math.floor(n.getMonth() / 3); return { from: toIso(new Date(n.getFullYear(), q * 3, 1)), to: endOfQuarter(n) }; } },
  { label: 'Last Quarter', resolve: (n: Date) => { const q = Math.floor(n.getMonth() / 3); const pq = q === 0 ? 3 : q - 1; const yr = q === 0 ? n.getFullYear() - 1 : n.getFullYear(); const d = new Date(yr, pq * 3, 1); return { from: toIso(d), to: endOfQuarter(d) }; } },
  { label: 'YTD',          resolve: (n: Date) => ({ from: `${n.getFullYear()}-01-01`, to: toIso(n) }) },
  { label: 'Last Year',    resolve: (n: Date) => ({ from: `${n.getFullYear() - 1}-01-01`, to: `${n.getFullYear() - 1}-12-31` }) },
];

// ─── Equity column classification ─────────────────────────────────────────────

function classifyComponent(name: string): 'shareCapital' | 'retainedEarnings' | 'otherReserves' {
  const lower = name.toLowerCase();
  if (lower.includes('share capital') || lower.includes('paid-in') || lower.includes('paid in') ||
      lower.includes('common stock') || lower.includes('ordinary share') || lower.includes('stated capital')) {
    return 'shareCapital';
  }
  if (lower.includes('retain') || lower.includes('accumulated') || lower.includes('profit') || lower.includes('loss')) {
    return 'retainedEarnings';
  }
  return 'otherReserves';
}

// ─── Matrix ───────────────────────────────────────────────────────────────────

interface MatrixRow {
  label: string;
  shareCapital: number;
  retainedEarnings: number;
  otherReserves: number;
  total: number;
  isBold?: boolean;
  isSubtle?: boolean;
}

function buildMatrix(data: ChangesInEquityResult): MatrixRow[] {
  const opening     = { shareCapital: 0, retainedEarnings: 0, otherReserves: 0 };
  const glMovements = { shareCapital: 0, retainedEarnings: 0, otherReserves: 0 };

  for (const c of data.components ?? []) {
    const col = classifyComponent(c.name);
    opening[col]     += Number(c.openingBalance);
    glMovements[col] += Number(c.movements);
  }

  // Add accumulated prior-period P&L to opening retained earnings (not yet closed to equity GL)
  opening.retainedEarnings += Number(data.priorNetPnL ?? 0);

  const profit          = Number(data.profitForPeriod ?? 0);
  const dividends       = glMovements.retainedEarnings; // RE GL movements = dividends/direct adjustments
  const issueOfCapital  = glMovements.shareCapital;
  const otherMovements  = glMovements.otherReserves;

  const openingTotal = opening.shareCapital + opening.retainedEarnings + opening.otherReserves;
  const closingTotal = Number(data.totals.closingEquity);

  return [
    {
      label: 'Opening Balance',
      shareCapital:     opening.shareCapital,
      retainedEarnings: opening.retainedEarnings,
      otherReserves:    opening.otherReserves,
      total:            openingTotal,
      isBold:           true,
    },
    {
      label: 'Net Profit for the Period',
      shareCapital: 0, retainedEarnings: profit, otherReserves: 0, total: profit,
    },
    {
      label: 'Dividends',
      shareCapital: 0, retainedEarnings: dividends, otherReserves: 0, total: dividends,
      isSubtle: dividends === 0,
    },
    {
      label: 'Issue of Capital',
      shareCapital: issueOfCapital, retainedEarnings: 0, otherReserves: 0, total: issueOfCapital,
      isSubtle: issueOfCapital === 0,
    },
    {
      label: 'Other Movements',
      shareCapital: 0, retainedEarnings: 0, otherReserves: otherMovements, total: otherMovements,
      isSubtle: otherMovements === 0,
    },
    {
      label: 'Closing Balance',
      shareCapital:     opening.shareCapital + issueOfCapital,
      retainedEarnings: opening.retainedEarnings + profit + dividends,
      otherReserves:    opening.otherReserves + otherMovements,
      total:            closingTotal,
      isBold:           true,
    },
  ];
}

// ─── Amount cell ──────────────────────────────────────────────────────────────

function Amt({ value, bold, dim }: { value: number; bold?: boolean; dim?: boolean }) {
  const n = value;
  return (
    <td className={cn(
      'text-right font-mono text-xs tabular-nums px-3 py-2 w-36',
      bold && 'font-semibold',
      dim && 'text-muted-foreground',
      !dim && n < 0 && 'text-red-600',
    )}>
      {fmt(n)}
    </td>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ChangesInEquityPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user  = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency  = activeOrg?.baseCurrency ?? 'GHS';

  const now = new Date();
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate]     = useState(toIso(now));

  const { data, isLoading } = useQuery<ChangesInEquityResult>({
    queryKey: ['changes-in-equity', activeOrganisationId, fromDate, toDate],
    queryFn:  () => getChangesInEquity(activeOrganisationId!, { fromDate, toDate }),
    enabled:  !!activeOrganisationId,
  });

  const matrix = data ? buildMatrix(data) : null;

  function exportCsv() {
    if (!matrix || !data) return;
    const rows: (string | number)[][] = [
      ['Statement of Changes in Equity', '', '', '', ''],
      [`Period: ${data.period.fromDate ?? ''} to ${data.period.toDate ?? ''}`, '', '', '', ''],
      ['', 'Share Capital', 'Retained Earnings', 'Other Reserves', 'Total'],
      ...matrix.map((r) => [r.label, r.shareCapital, r.retainedEarnings, r.otherReserves, r.total]),
    ];
    downloadCsv(`changes-in-equity-${fromDate}-to-${toDate}.csv`, rows);
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp size={18} /> Statement of Changes in Equity
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">IAS 1 · Equity movements · {currency}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download size={14} className="mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} className="mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-7 w-36 text-xs" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-7 w-36 text-xs" />
        </div>
        <div className="flex gap-1">
          {QUICK_SELECTS.map((q) => (
            <button
              key={q.label}
              onClick={() => { const r = q.resolve(now); setFromDate(r.from); setToDate(r.to); }}
              className="px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Statement */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : !data ? null : (
        <div className="border rounded-lg p-5 bg-card text-sm print:border-0 print:p-0">

          {/* Org + period header (shows on screen and print) */}
          <div className="text-center mb-5 print:mb-6">
            <p className="font-bold text-base">{data.organisation.name}</p>
            <p className="text-xs text-muted-foreground">Statement of Changes in Equity</p>
            <p className="text-xs text-muted-foreground">
              For the period {data.period.fromDate ?? fromDate} to {data.period.toDate ?? toDate} · {currency}
            </p>
          </div>

          {/* Matrix table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b text-right text-[10px] font-semibold text-muted-foreground">
                  <th className="text-left font-semibold text-foreground px-3 py-2 w-48">Movement</th>
                  <th className="px-3 py-2 w-36">Share Capital</th>
                  <th className="px-3 py-2 w-36">Retained Earnings</th>
                  <th className="px-3 py-2 w-36">Other Reserves</th>
                  <th className="px-3 py-2 w-36 text-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {(matrix ?? []).map((row) => (
                  <tr
                    key={row.label}
                    className={cn(
                      'border-b border-border/40',
                      row.isBold && 'bg-muted/40',
                      row.isSubtle && 'opacity-40',
                    )}
                  >
                    <td className={cn('px-3 py-2 text-xs', row.isBold ? 'font-semibold' : 'text-muted-foreground')}>
                      {row.label}
                    </td>
                    <Amt value={row.shareCapital}     bold={row.isBold} dim={row.isSubtle} />
                    <Amt value={row.retainedEarnings} bold={row.isBold} dim={row.isSubtle} />
                    <Amt value={row.otherReserves}    bold={row.isBold} dim={row.isSubtle} />
                    <Amt value={row.total}            bold={row.isBold} dim={row.isSubtle} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Balance-sheet tie-out */}
          <div className={cn(
            'mt-4 flex items-center gap-2 rounded p-2 text-xs border',
            data.isReconciled
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700',
          )}>
            {data.isReconciled ? (
              <>
                <CheckCircle size={13} className="shrink-0" />
                <span>Reconciled — closing equity matches Balance Sheet ({fmt(data.closingEquityFromBS)} {currency})</span>
              </>
            ) : (
              <>
                <AlertTriangle size={13} className="shrink-0" />
                <span>
                  Unreconciled — SOCE closing equity {fmt(data.totals.closingEquity)} vs Balance Sheet equity {fmt(data.closingEquityFromBS)} {currency}.
                  Investigate before finalising accounts.
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4 print:hidden">
          {[
            { label: 'Opening Equity',          value: data.totals.openingEquity },
            { label: 'Movements During Period',  value: data.totals.movementsDuringPeriod },
            { label: 'Closing Equity',           value: data.totals.closingEquity },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={cn('text-lg font-semibold font-mono', Number(value) < 0 && 'text-red-600')}>
                {fmt(value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
