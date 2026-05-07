import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, CheckCircle, AlertCircle, Download, Printer,
  ChevronRight, X, TrendingUp, TrendingDown, Minus, Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  getBalanceSheet, getBalanceSheetDrilldown,
} from '@/services/reports.service';
import type { BSLine, BSGroup, BSSection, BalanceSheetResult, DrilldownResult } from '@/services/reports.service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(v: string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function ChangeCell({ change, pct }: { change: string | null; pct: string | null }) {
  if (change == null) return <span className="text-muted-foreground">—</span>;
  const n = Number(change);
  const color = n > 0 ? 'text-green-600' : n < 0 ? 'text-red-500' : 'text-muted-foreground';
  const Icon = n > 0 ? TrendingUp : n < 0 ? TrendingDown : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-mono', color)}>
      <Icon size={10} />
      {fmt(change)}
      {pct != null && <span className="text-[10px] ml-1 opacity-70">{fmtPct(pct)}</span>}
    </span>
  );
}

// ─── Quick date helpers ───────────────────────────────────────────────────────

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), (q + 1) * 3, 0);
}

function endOfYear(d: Date) {
  return new Date(d.getFullYear(), 11, 31);
}

// ─── Drill-down modal ─────────────────────────────────────────────────────────

function DrilldownModal({
  organisationId,
  accountId,
  asOfDate,
  onClose,
}: {
  organisationId: string;
  accountId: string;
  asOfDate: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<DrilldownResult>({
    queryKey: ['bs-drilldown', organisationId, accountId, asOfDate],
    queryFn: () => getBalanceSheetDrilldown(organisationId, accountId, asOfDate),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            {data && (
              <>
                <p className="font-semibold text-sm">{data.account.code} · {data.account.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Transactions up to {data.asOfDate} · Closing balance: <span className="font-mono font-semibold">{fmt(data.closingBalance)}</span>
                </p>
              </>
            )}
            {isLoading && <Skeleton className="h-5 w-48" />}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="overflow-auto flex-1 p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No transactions found</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Reference</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-right px-3 py-2 font-medium">Debit</th>
                  <th className="text-right px-3 py-2 font-medium">Credit</th>
                  <th className="text-right px-3 py-2 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-blue-50/50 border-b">
                  <td colSpan={5} className="px-3 py-2 text-muted-foreground italic">Opening balance</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(data.openingBalance)}</td>
                </tr>
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

// ─── Line row ─────────────────────────────────────────────────────────────────

function LineRow({
  line,
  hasComparison,
  onDrilldown,
}: {
  line: BSLine;
  hasComparison: boolean;
  onDrilldown: (accountId: string) => void;
}) {
  return (
    <tr
      className="group border-b border-dashed border-border/40 hover:bg-accent/30 cursor-pointer"
      onClick={() => onDrilldown(line.accountId)}
    >
      <td className="py-1 pr-2 text-[11px] text-muted-foreground font-mono w-16">{line.code}</td>
      <td className="py-1 pr-4 text-[12px] flex-1">
        <span className="group-hover:text-primary transition-colors flex items-center gap-1">
          {line.name}
          <ChevronRight size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
        </span>
      </td>
      <td className="py-1 text-right font-mono text-[12px] tabular-nums w-28">{fmt(line.current)}</td>
      {hasComparison && (
        <>
          <td className="py-1 text-right font-mono text-[12px] tabular-nums text-muted-foreground w-28">{fmt(line.prior)}</td>
          <td className="py-1 text-right text-[11px] w-32">
            <ChangeCell change={line.change} pct={line.changePct} />
          </td>
        </>
      )}
    </tr>
  );
}

// ─── Group block ──────────────────────────────────────────────────────────────

function GroupBlock({
  group,
  hasComparison,
  onDrilldown,
}: {
  group: BSGroup;
  hasComparison: boolean;
  onDrilldown: (id: string) => void;
}) {
  if (group.lines.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 pl-1">
        {group.label}
      </p>
      <table className="w-full">
        <tbody>
          {group.lines.map((line) => (
            <LineRow key={line.accountId} line={line} hasComparison={hasComparison} onDrilldown={onDrilldown} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border/60">
            <td className="py-1.5 pr-2 w-16" />
            <td className="py-1.5 pr-4 text-[11px] font-semibold text-muted-foreground">
              {group.label}
            </td>
            <td className="py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums w-28">
              {fmt(group.subtotal)}
            </td>
            {hasComparison && (
              <>
                <td className="py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums text-muted-foreground w-28">
                  {fmt(group.priorSubtotal)}
                </td>
                <td className="py-1.5 text-right text-[11px] w-32">
                  <ChangeCell change={group.change} pct={group.changePct} />
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  hasComparison,
  onDrilldown,
}: {
  section: BSSection;
  hasComparison: boolean;
  onDrilldown: (id: string) => void;
}) {
  const hasContent = section.groups.some((g) => g.lines.length > 0);
  if (!hasContent) return null;
  return (
    <div className="mb-2">
      <p className="text-xs font-bold uppercase tracking-wide text-foreground mb-2 border-b pb-1">
        {section.label}
      </p>
      {section.groups.map((g) => (
        <GroupBlock key={g.label} group={g} hasComparison={hasComparison} onDrilldown={onDrilldown} />
      ))}
      <div className="flex border-t-2 border-foreground/20 pt-2 mt-1 mb-4">
        <span className="text-xs font-bold text-muted-foreground w-16 shrink-0" />
        <span className="flex-1 text-xs font-bold">Total {section.label}</span>
        <span className="font-mono text-sm font-bold tabular-nums w-28 text-right">{fmt(section.subtotal)}</span>
        {hasComparison && (
          <>
            <span className="font-mono text-sm font-bold tabular-nums text-muted-foreground w-28 text-right">{fmt(section.priorSubtotal)}</span>
            <span className="text-[11px] w-32 text-right">
              <ChangeCell change={section.change} pct={section.changePct} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Column header ────────────────────────────────────────────────────────────

function ColHeaders({ asOfDate, priorDate, compareTo }: { asOfDate: string; priorDate: string | null; compareTo: string | null }) {
  const hasComparison = !!priorDate;
  return (
    <div className="flex mb-3 border-b pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="w-16 shrink-0" />
      <span className="flex-1" />
      <span className="w-28 text-right">{asOfDate}</span>
      {hasComparison && (
        <>
          <span className="w-28 text-right text-muted-foreground/60">{priorDate}</span>
          <span className="w-32 text-right">
            {compareTo === 'prior_year' ? 'YoY' : 'MoM'} Change
          </span>
        </>
      )}
    </div>
  );
}

// ─── Grand total row ──────────────────────────────────────────────────────────

function GrandTotal({
  label,
  current,
  prior,
  hasComparison,
  highlight = false,
}: {
  label: string;
  current: string;
  prior: string | null;
  hasComparison: boolean;
  highlight?: boolean;
}) {
  const change = hasComparison && prior != null
    ? String(Number(current) - Number(prior))
    : null;
  const pct = change != null && prior != null && Number(prior) !== 0
    ? String((Number(change) / Math.abs(Number(prior))) * 100)
    : null;

  return (
    <div className={cn(
      'flex items-center py-2.5 px-3 rounded mt-1',
      highlight ? 'bg-primary/5 border border-primary/20' : 'border-t-2 border-foreground/20',
    )}>
      <span className="w-16 shrink-0" />
      <span className={cn('flex-1 font-bold text-sm', highlight && 'text-primary')}>{label}</span>
      <span className={cn('font-mono font-bold text-sm tabular-nums w-28 text-right', highlight && 'text-primary')}>
        {fmt(current)}
      </span>
      {hasComparison && (
        <>
          <span className="font-mono font-bold text-sm tabular-nums text-muted-foreground w-28 text-right">
            {fmt(prior)}
          </span>
          <span className="text-[11px] w-32 text-right">
            <ChangeCell change={change} pct={pct} />
          </span>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BalanceSheetPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const today = toIso(new Date());
  const [asOfDate, setAsOfDate]       = useState(today);
  const [compareTo, setCompareTo]     = useState<'prior_period' | 'prior_year' | ''>('');
  const [showZero, setShowZero]       = useState(false);
  const [drillAccount, setDrillAccount] = useState<string | null>(null);

  const params = {
    asOfDate,
    compareTo: compareTo || undefined,
    showZero,
  };

  const { data, isLoading, isFetching } = useQuery<BalanceSheetResult>({
    queryKey: ['balance-sheet', activeOrganisationId, params],
    queryFn: () => getBalanceSheet(activeOrganisationId!, params),
    enabled: !!activeOrganisationId,
  });

  const hasComparison = !!(data?.priorDate);

  const handleDrilldown = useCallback((accountId: string) => {
    setDrillAccount(accountId);
  }, []);

  function quickSelect(label: string) {
    const now = new Date();
    let d: Date;
    switch (label) {
      case 'today':   d = now;               break;
      case 'eom':     d = endOfMonth(now);   break;
      case 'eoq':     d = endOfQuarter(now); break;
      case 'eoy':     d = endOfYear(now);    break;
      default:        d = now;
    }
    setAsOfDate(toIso(d));
  }

  function buildCsvRows(): string {
    if (!data) return '';
    const rows: string[] = [];
    const cols = hasComparison
      ? ['Code', 'Account', `Current (${data.asOfDate})`, `Prior (${data.priorDate})`, 'Change', '% Change']
      : ['Code', 'Account', `Balance (${data.asOfDate})`];

    rows.push(cols.join(','));

    function sectionRows(section: BSSection) {
      rows.push(`,,${section.label}`);
      for (const group of section.groups) {
        if (!group.lines.length) continue;
        rows.push(`,,${group.label}`);
        for (const line of group.lines) {
          const base = [line.code, `"${line.name}"`, line.current];
          if (hasComparison) base.push(line.prior ?? '', line.change ?? '', line.changePct ?? '');
          rows.push(base.join(','));
        }
        const gSub = ['' , `"Total ${group.label}"`, group.subtotal];
        if (hasComparison) gSub.push(group.priorSubtotal ?? '', group.change ?? '', group.changePct ?? '');
        rows.push(gSub.join(','));
      }
      const sSub = ['', `"TOTAL ${section.label.toUpperCase()}"`, section.subtotal];
      if (hasComparison) sSub.push(section.priorSubtotal ?? '', section.change ?? '', section.changePct ?? '');
      rows.push(sSub.join(','));
      rows.push('');
    }

    rows.push(',ASSETS');
    sectionRows(data.assets.nonCurrent);
    sectionRows(data.assets.current);
    rows.push(['', 'TOTAL ASSETS', data.assets.total, ...(hasComparison ? [data.assets.priorTotal ?? '', '', ''] : [])].join(','));
    rows.push('');
    rows.push(',LIABILITIES');
    sectionRows(data.liabilities.current);
    sectionRows(data.liabilities.nonCurrent);
    rows.push(['', 'TOTAL LIABILITIES', data.liabilities.total, ...(hasComparison ? [data.liabilities.priorTotal ?? '', '', ''] : [])].join(','));
    rows.push('');
    rows.push(',EQUITY');
    sectionRows(data.equity.section);
    const re = data.equity.retainedEarnings;
    rows.push(['', re.label, re.current, ...(hasComparison ? [re.prior ?? '', re.change ?? '', re.changePct ?? ''] : [])].join(','));
    rows.push(['', 'TOTAL EQUITY', data.equity.total, ...(hasComparison ? [data.equity.priorTotal ?? '', '', ''] : [])].join(','));
    rows.push('');
    rows.push(['', 'TOTAL LIABILITIES & EQUITY', data.totalLiabilitiesAndEquity, ...(hasComparison ? [data.priorTotalLiabilitiesAndEquity ?? '', '', ''] : [])].join(','));

    return rows.join('\n');
  }

  function downloadCsv() {
    const csv = buildCsvRows();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-sheet-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl print:p-0">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Building2 size={18} /> Balance Sheet
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Statement of Financial Position · IAS 1 · {currency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          {data && (
            <Badge variant={data.isBalanced ? 'success' : 'destructive'} className="gap-1 text-xs">
              {data.isBalanced ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
              {data.isBalanced ? 'Balanced' : 'Out of balance'}
            </Badge>
          )}
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
        {/* Date picker */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">As at date</label>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </div>

        {/* Quick selects */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Quick select</label>
          <div className="flex gap-1">
            {[
              { label: 'Today',     key: 'today' },
              { label: 'End Month', key: 'eom'   },
              { label: 'End Qtr',   key: 'eoq'   },
              { label: 'End Year',  key: 'eoy'   },
            ].map(({ label, key }) => (
              <Button key={key} variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => quickSelect(key)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Compare toggle */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Compare to</label>
          <select
            className="h-8 text-xs w-36 rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
            value={compareTo}
            onChange={(e) => setCompareTo(e.target.value as 'prior_period' | 'prior_year' | '')}
          >
            <option value="">None</option>
            <option value="prior_period">Prior Period (−1M)</option>
            <option value="prior_year">Prior Year (−12M)</option>
          </select>
        </div>

        {/* Show zero balances */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Zero balances</label>
          <Button
            variant={showZero ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowZero((v) => !v)}
          >
            {showZero ? 'Shown' : 'Hidden'}
          </Button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block text-center mb-6">
        <p className="text-lg font-bold">{data?.organisation.name}</p>
        <p className="text-base font-semibold mt-1">Statement of Financial Position</p>
        <p className="text-sm text-muted-foreground mt-0.5">As at {data?.asOfDate} · {currency}</p>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !data ? null : (
        <Card className="print:shadow-none print:border-none">
          <CardContent className="p-6 space-y-0">
            <ColHeaders
              asOfDate={data.asOfDate}
              priorDate={data.priorDate}
              compareTo={data.compareTo}
            />

            {/* ── ASSETS ── */}
            <p className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-3 mt-2">Assets</p>

            <SectionBlock
              section={data.assets.nonCurrent}
              hasComparison={hasComparison}
              onDrilldown={handleDrilldown}
            />
            <SectionBlock
              section={data.assets.current}
              hasComparison={hasComparison}
              onDrilldown={handleDrilldown}
            />

            <GrandTotal
              label="TOTAL ASSETS"
              current={data.assets.total}
              prior={data.assets.priorTotal}
              hasComparison={hasComparison}
            />

            <div className="my-6 border-t border-dashed border-border/60" />

            {/* ── LIABILITIES ── */}
            <p className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-3">Liabilities</p>

            <SectionBlock
              section={data.liabilities.current}
              hasComparison={hasComparison}
              onDrilldown={handleDrilldown}
            />
            <SectionBlock
              section={data.liabilities.nonCurrent}
              hasComparison={hasComparison}
              onDrilldown={handleDrilldown}
            />

            <GrandTotal
              label="TOTAL LIABILITIES"
              current={data.liabilities.total}
              prior={data.liabilities.priorTotal}
              hasComparison={hasComparison}
            />

            <div className="my-6 border-t border-dashed border-border/60" />

            {/* ── EQUITY ── */}
            <p className="text-sm font-extrabold uppercase tracking-widest text-foreground mb-3">Equity</p>

            <SectionBlock
              section={data.equity.section}
              hasComparison={hasComparison}
              onDrilldown={handleDrilldown}
            />

            {/* Retained earnings / current-period P&L line */}
            {(() => {
              const re = data.equity.retainedEarnings;
              return (
                <div className="flex items-center border-b border-dashed border-border/40 py-1 mb-1">
                  <span className="w-16 shrink-0 text-[11px] text-muted-foreground font-mono" />
                  <span className="flex-1 text-[12px] text-muted-foreground italic">{re.label}</span>
                  <span className={cn('font-mono text-[12px] tabular-nums w-28 text-right', Number(re.current) < 0 && 'text-red-500')}>
                    {fmt(re.current)}
                  </span>
                  {hasComparison && (
                    <>
                      <span className={cn('font-mono text-[12px] tabular-nums text-muted-foreground w-28 text-right', Number(re.prior ?? 0) < 0 && 'text-red-400')}>
                        {fmt(re.prior)}
                      </span>
                      <span className="text-[11px] w-32 text-right">
                        <ChangeCell change={re.change} pct={re.changePct} />
                      </span>
                    </>
                  )}
                </div>
              );
            })()}

            <GrandTotal
              label="TOTAL EQUITY"
              current={data.equity.total}
              prior={data.equity.priorTotal}
              hasComparison={hasComparison}
            />

            <div className="my-4" />

            {/* ── GRAND TOTAL ── */}
            <GrandTotal
              label="TOTAL LIABILITIES & EQUITY"
              current={data.totalLiabilitiesAndEquity}
              prior={data.priorTotalLiabilitiesAndEquity}
              hasComparison={hasComparison}
              highlight
            />

            {!data.isBalanced && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertCircle size={13} />
                Assets do not equal Liabilities + Equity — check for unposted journals or data integrity issues.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Drill-down modal */}
      {drillAccount && activeOrganisationId && (
        <DrilldownModal
          organisationId={activeOrganisationId}
          accountId={drillAccount}
          asOfDate={asOfDate}
          onClose={() => setDrillAccount(null)}
        />
      )}
    </div>
  );
}
