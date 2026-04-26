import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, CheckCircle, AlertCircle, Download, Printer } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getTrialBalance, getAccountLedger } from '@/services/ledger.service';
import type { TrialBalanceLine } from '@/services/ledger.service';
import { listPeriods } from '@/services/periods.service';
import type { AccountingPeriod } from '@/services/periods.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const CLASS_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const CLASS_COLORS: Record<string, string> = {
  ASSET: 'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY: 'text-amber-600 dark:text-amber-400',
  REVENUE: 'text-green-600 dark:text-green-400',
  EXPENSE: 'text-orange-600 dark:text-orange-400',
};

type Mode = 'period' | 'fiscalYear' | 'periodRange' | 'asOf' | 'allTime';

interface CommittedParams {
  periodId?: string;
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  includeZeroBalances: boolean;
  label: string;
}

function fmt(v: string | number) {
  const n = Number(v);
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Extract distinct fiscal years from periods, sorted descending
function fiscalYears(periods: AccountingPeriod[]): number[] {
  return [...new Set(periods.map((p) => p.fiscalYear))].sort((a, b) => b - a);
}

// Get all periods in a fiscal year sorted by period number
function periodsForYear(periods: AccountingPeriod[], year: number): AccountingPeriod[] {
  return periods.filter((p) => p.fiscalYear === year).sort((a, b) => a.periodNumber - b.periodNumber);
}

export function TrialBalancePage() {
  const { activeOrganisationId, user } = useAuthStore((s) => ({
    activeOrganisationId: s.activeOrganisationId,
    user: s.user,
  }));
  const orgName =
    user?.organisations.find((o) => o.organisationId === activeOrganisationId)
      ?.organisationName ?? 'Organisation';

  // Form state
  const [mode, setMode] = useState<Mode>('period');
  const [periodId, setPeriodId] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [fromPeriodId, setFromPeriodId] = useState('');
  const [toPeriodId, setToPeriodId] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [includeZeros, setIncludeZeros] = useState(false);
  const [classFilter, setClassFilter] = useState('');

  // Committed (generated) state
  const [committed, setCommitted] = useState<CommittedParams | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  // Drill-down
  const [drillDown, setDrillDown] = useState<TrialBalanceLine | null>(null);

  // Periods list
  const { data: periods = [] } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const years = fiscalYears(periods);
  const periodsSortedDesc = [...periods].sort(
    (a, b) => b.fiscalYear * 100 + b.periodNumber - (a.fiscalYear * 100 + a.periodNumber),
  );

  // Trial balance query — only fires after Generate is clicked
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['trial-balance', activeOrganisationId, committed],
    queryFn: () =>
      getTrialBalance(activeOrganisationId!, {
        periodId: committed!.periodId,
        fromDate: committed!.fromDate,
        toDate: committed!.toDate,
        asOfDate: committed!.asOfDate,
        includeZeroBalances: committed!.includeZeroBalances,
      }),
    enabled: !!activeOrganisationId && !!committed,
  });

  // Account ledger drill-down
  const drillParams = committed
    ? {
        periodId: committed.periodId,
        fromDate: committed.fromDate,
        toDate: committed.toDate,
        pageSize: 100,
      }
    : undefined;

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['account-ledger', activeOrganisationId, drillDown?.accountId, drillParams],
    queryFn: () =>
      getAccountLedger(activeOrganisationId!, drillDown!.accountId, drillParams),
    enabled: !!drillDown && !!activeOrganisationId,
  });

  function buildCommitted(): CommittedParams | null {
    const base = { includeZeroBalances: includeZeros };

    if (mode === 'period') {
      if (!periodId) return null;
      const p = periods.find((x) => x.id === periodId);
      return { ...base, periodId, label: p ? `${p.name} (FY${p.fiscalYear})` : 'Period' };
    }

    if (mode === 'fiscalYear') {
      const year = Number(selectedYear);
      if (!year) return null;
      const yPeriods = periodsForYear(periods, year);
      if (yPeriods.length === 0) return null;
      const fromDate = yPeriods[0].startDate.slice(0, 10);
      const toDate = yPeriods[yPeriods.length - 1].endDate.slice(0, 10);
      return { ...base, fromDate, toDate, label: `Fiscal Year ${year} (${fmtDate(fromDate)} – ${fmtDate(toDate)})` };
    }

    if (mode === 'periodRange') {
      if (!fromPeriodId || !toPeriodId) return null;
      const fp = periods.find((x) => x.id === fromPeriodId);
      const tp = periods.find((x) => x.id === toPeriodId);
      if (!fp || !tp) return null;
      const fromDate = fp.startDate.slice(0, 10);
      const toDate = tp.endDate.slice(0, 10);
      return {
        ...base,
        fromDate,
        toDate,
        label: `${fp.name} – ${tp.name} (FY${fp.fiscalYear}${fp.fiscalYear !== tp.fiscalYear ? `–FY${tp.fiscalYear}` : ''})`,
      };
    }

    if (mode === 'asOf') {
      if (!asOfDate) return null;
      return { ...base, asOfDate, label: `As of ${fmtDate(asOfDate)}` };
    }

    // allTime
    return { ...base, label: 'All Time (Cumulative)' };
  }

  function handleGenerate() {
    const params = buildCommitted();
    if (!params) return;
    setCommitted(params);
    setGeneratedAt(new Date());
  }

  const canGenerate = !!buildCommitted();

  // Filter table lines by class
  const filteredLines = useMemo(() => {
    const lines = data?.lines ?? [];
    if (!classFilter) return lines;
    return lines.filter((l) => l.class === classFilter);
  }, [data?.lines, classFilter]);

  const grouped = CLASS_ORDER.filter((cls) => !classFilter || cls === classFilter)
    .map((cls) => ({ class: cls, lines: filteredLines.filter((l) => l.class === cls) }))
    .filter((g) => g.lines.length > 0);

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      ['Trial Balance', orgName],
      ['Period', committed?.label ?? ''],
      ['Generated', generatedAt?.toISOString() ?? ''],
      [],
      ['Code', 'Account', 'Class', 'Type', 'Debit', 'Credit', 'Balance'],
      ...filteredLines.map((l) => [
        l.code,
        l.name,
        l.class,
        l.type,
        l.totalDebit,
        l.totalCredit,
        l.balance,
      ]),
      [],
      ['', '', '', 'TOTALS', data.totalDebit, data.totalCredit, ''],
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-${(committed?.label ?? 'export')
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Determine if to-period list should be constrained to same FY as fromPeriod
  const fromPeriod = periods.find((p) => p.id === fromPeriodId);
  const toPeriodOptions = fromPeriod
    ? periodsSortedDesc.filter(
        (p) =>
          p.fiscalYear * 100 + p.periodNumber >=
          fromPeriod.fiscalYear * 100 + fromPeriod.periodNumber,
      )
    : periodsSortedDesc;

  return (
    <div className="p-6 space-y-5 print:p-4">
      {/* Page header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Scale size={18} /> Trial Balance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            On-demand snapshot of all account balances
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Mode */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">View Mode</label>
              <Select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as Mode);
                  setPeriodId('');
                  setSelectedYear('');
                  setFromPeriodId('');
                  setToPeriodId('');
                  setAsOfDate('');
                }}
                className="w-44"
              >
                <option value="period">Single Period</option>
                <option value="fiscalYear">Full Fiscal Year</option>
                <option value="periodRange">Period Range</option>
                <option value="asOf">As-of Date</option>
                <option value="allTime">All Time</option>
              </Select>
            </div>

            {/* Single period */}
            {mode === 'period' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Period</label>
                <Select
                  value={periodId}
                  onChange={(e) => setPeriodId(e.target.value)}
                  className="w-56"
                >
                  <option value="">Select period…</option>
                  {periodsSortedDesc.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · FY{p.fiscalYear} · {p.status}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Full fiscal year */}
            {mode === 'fiscalYear' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fiscal Year</label>
                <Select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-36"
                >
                  <option value="">Select year…</option>
                  {years.map((y) => {
                    const yp = periodsForYear(periods, y);
                    const label =
                      yp.length > 0
                        ? `FY${y} (${yp.length} periods)`
                        : `FY${y}`;
                    return (
                      <option key={y} value={y}>
                        {label}
                      </option>
                    );
                  })}
                </Select>
              </div>
            )}

            {/* Period range */}
            {mode === 'periodRange' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">From Period</label>
                  <Select
                    value={fromPeriodId}
                    onChange={(e) => {
                      setFromPeriodId(e.target.value);
                      setToPeriodId('');
                    }}
                    className="w-52"
                  >
                    <option value="">Select start period…</option>
                    {periodsSortedDesc.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · FY{p.fiscalYear}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">To Period</label>
                  <Select
                    value={toPeriodId}
                    onChange={(e) => setToPeriodId(e.target.value)}
                    className="w-52"
                    disabled={!fromPeriodId}
                  >
                    <option value="">Select end period…</option>
                    {toPeriodOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · FY{p.fiscalYear}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            {/* As-of date */}
            {mode === 'asOf' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">As of Date</label>
                <Input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="w-44"
                />
              </div>
            )}

            {/* Include zeros */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground invisible">opt</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer h-9 px-1">
                <input
                  type="checkbox"
                  checked={includeZeros}
                  onChange={(e) => setIncludeZeros(e.target.checked)}
                  className="rounded border-input"
                />
                Include zero balances
              </label>
            </div>

            {/* Generate */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground invisible">go</label>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || isFetching}
                className="h-9"
              >
                {isFetching ? 'Generating…' : 'Generate Report'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Out-of-balance alert */}
      {data && !data.isBalanced && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Trial Balance is Out of Balance</p>
            <p className="text-xs mt-0.5">
              Total Debits (
              {Number(data.totalDebit).toLocaleString('en-US', { minimumFractionDigits: 2 })}) ≠
              Total Credits (
              {Number(data.totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              ). Review recent journal entries for posting errors.
            </p>
          </div>
        </div>
      )}

      {/* Empty prompt */}
      {!committed && !isLoading && (
        <Card>
          <CardContent className="py-20 text-center">
            <Scale size={40} className="mx-auto text-muted-foreground/25 mb-4" />
            <p className="text-sm text-muted-foreground">
              Select a period or date range above, then click <strong>Generate Report</strong>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report */}
      {committed && (
        <Card>
          <CardContent className="p-0">
            {/* Report header */}
            <div className="px-6 pt-5 pb-4 border-b">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Trial Balance
                  </p>
                  <h2 className="text-lg font-semibold mt-0.5">{orgName}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{committed.label}</p>
                  {data && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 text-sm font-medium mt-2',
                        data.isBalanced ? 'text-green-600' : 'text-red-600',
                      )}
                    >
                      {data.isBalanced ? (
                        <CheckCircle size={14} />
                      ) : (
                        <AlertCircle size={14} />
                      )}
                      {data.isBalanced ? 'Balanced' : 'Out of balance — review required'}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 print:hidden shrink-0">
                  <div className="flex items-center gap-2">
                    <Select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                      className="w-36 h-8 text-xs"
                    >
                      <option value="">All Classes</option>
                      {CLASS_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportCsv}
                      disabled={!data}
                      className="h-8 gap-1.5"
                    >
                      <Download size={13} /> CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      disabled={!data}
                      className="h-8 gap-1.5"
                    >
                      <Printer size={13} /> Print
                    </Button>
                  </div>
                  {generatedAt && (
                    <p className="text-xs text-muted-foreground">
                      Generated {generatedAt.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[...Array(12)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !data?.lines.length ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No posted ledger entries found for the selected period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="w-24 text-center print:hidden">Class</TableHead>
                    <TableHead className="text-right w-36">Debit</TableHead>
                    <TableHead className="text-right w-36">Credit</TableHead>
                    <TableHead className="text-right w-36">Balance</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {grouped.map((group) => (
                    <>
                      <TableRow
                        key={`heading-${group.class}`}
                        className="bg-muted/40 hover:bg-muted/40"
                      >
                        <TableCell
                          colSpan={6}
                          className={cn(
                            'text-xs font-semibold uppercase tracking-widest py-2',
                            CLASS_COLORS[group.class],
                          )}
                        >
                          {group.class}
                        </TableCell>
                      </TableRow>
                      {group.lines.map((line) => (
                        <TableRow
                          key={line.accountId}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => setDrillDown(line)}
                          title="Click to view ledger entries for this account"
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {line.code}
                          </TableCell>
                          <TableCell className="text-sm">{line.name}</TableCell>
                          <TableCell className="text-center print:hidden">
                            <span
                              className={cn(
                                'text-[11px] font-medium',
                                CLASS_COLORS[line.class],
                              )}
                            >
                              {line.class}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-blue-600 dark:text-blue-400">
                            {Number(line.totalDebit) > 0 ? fmt(line.totalDebit) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-red-600 dark:text-red-400">
                            {Number(line.totalCredit) > 0 ? fmt(line.totalCredit) : '—'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-mono text-xs tabular-nums font-semibold',
                              Number(line.balance) < 0 && 'text-red-600',
                            )}
                          >
                            {Number(line.balance) < 0
                              ? `(${fmt(line.balance)})`
                              : fmt(line.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>

                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold text-sm">
                      Grand Totals
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm text-blue-600 dark:text-blue-400">
                      {Number(data.totalDebit).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm text-red-600 dark:text-red-400">
                      {Number(data.totalCredit).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {data.isBalanced ? (
                        <Badge variant="success">Balanced</Badge>
                      ) : (
                        <Badge variant="destructive">Unbalanced</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Account Ledger Drill-down Dialog */}
      <Dialog open={!!drillDown} onOpenChange={(open) => !open && setDrillDown(null)}>
        <DialogContent
          title={drillDown ? `${drillDown.code} · ${drillDown.name}` : ''}
          description={`${drillDown?.class ?? ''} · ${committed?.label ?? ''}`}
          className="max-w-4xl"
        >
          {ledgerLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !ledgerData ? null : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-[11px] text-muted-foreground">Opening Balance</p>
                  <p className="font-semibold font-mono text-sm mt-1">
                    {Number(ledgerData.openingBalance) === 0
                      ? '0.00'
                      : fmt(ledgerData.openingBalance)}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-[11px] text-muted-foreground">Total Entries</p>
                  <p className="font-semibold text-sm mt-1">{ledgerData.pagination.total}</p>
                </div>
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-[11px] text-muted-foreground">Closing Balance</p>
                  <p
                    className={cn(
                      'font-semibold font-mono text-sm mt-1',
                      drillDown && Number(drillDown.balance) < 0 && 'text-red-600',
                    )}
                  >
                    {drillDown
                      ? Number(drillDown.balance) < 0
                        ? `(${fmt(drillDown.balance)})`
                        : fmt(drillDown.balance)
                      : '—'}
                  </p>
                </div>
              </div>

              {ledgerData.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No ledger entries for this account in the selected period.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left">
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                          Date
                        </th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                          Journal #
                        </th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                          Description
                        </th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">
                          Debit
                        </th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">
                          Credit
                        </th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">
                          Running Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let running = Number(ledgerData.openingBalance);
                        const isDebitNormal = drillDown?.normalBalance === 'DEBIT';
                        return ledgerData.entries.map((entry) => {
                          const dr = Number(entry.debitAmount);
                          const cr = Number(entry.creditAmount);
                          running += isDebitNormal ? dr - cr : cr - dr;
                          return (
                            <tr
                              key={entry.id}
                              className="border-b last:border-0 hover:bg-accent/30 transition-colors"
                            >
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(entry.transactionDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs font-medium">
                                {entry.journalEntry.journalNumber}
                              </td>
                              <td
                                className="px-3 py-2 text-xs max-w-[200px] truncate"
                                title={
                                  entry.journalEntry.description ??
                                  entry.journalEntry.reference ??
                                  ''
                                }
                              >
                                {entry.journalEntry.description ??
                                  entry.journalEntry.reference ??
                                  '—'}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-right text-blue-600 dark:text-blue-400">
                                {dr > 0 ? fmt(dr) : '—'}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-right text-red-600 dark:text-red-400">
                                {cr > 0 ? fmt(cr) : '—'}
                              </td>
                              <td
                                className={cn(
                                  'px-3 py-2 font-mono text-xs text-right font-medium',
                                  running < 0 && 'text-red-600',
                                )}
                              >
                                {running < 0
                                  ? `(${new Intl.NumberFormat('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }).format(Math.abs(running))})`
                                  : new Intl.NumberFormat('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }).format(running)}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

              {ledgerData.pagination.hasNext && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing first {ledgerData.entries.length} of {ledgerData.pagination.total}{' '}
                  entries
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
