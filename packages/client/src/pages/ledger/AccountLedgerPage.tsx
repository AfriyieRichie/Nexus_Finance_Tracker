import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getAccountLedger } from '@/services/ledger.service';
import type { LedgerEntry } from '@/services/ledger.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CLASS_COLORS: Record<string, string> = {
  ASSET: 'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY: 'text-amber-600 dark:text-amber-400',
  REVENUE: 'text-green-600 dark:text-green-400',
  EXPENSE: 'text-orange-600 dark:text-orange-400',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function fmtBal(n: number) {
  if (n === 0) return '0.00';
  return n < 0 ? `(${fmt(n)})` : fmt(n);
}

export function AccountLedgerPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  // Context passed from Trial Balance
  const periodId = searchParams.get('periodId') ?? undefined;
  const fromDate = searchParams.get('fromDate') ?? undefined;
  const toDate = searchParams.get('toDate') ?? undefined;
  const tbLabel = searchParams.get('tbLabel') ?? 'Trial Balance';
  const accountCode = searchParams.get('code') ?? '';
  const accountName = searchParams.get('name') ?? '';
  const accountClass = searchParams.get('accountClass') ?? '';
  const normalBalance = (searchParams.get('normalBalance') ?? 'DEBIT') as 'DEBIT' | 'CREDIT';

  const { data, isLoading } = useQuery({
    queryKey: ['account-ledger', activeOrganisationId, accountId, { periodId, fromDate, toDate }],
    queryFn: () =>
      getAccountLedger(activeOrganisationId!, accountId!, {
        periodId,
        fromDate,
        toDate,
        pageSize: 500,
      }),
    enabled: !!activeOrganisationId && !!accountId,
  });

  function handleEntryClick(entry: LedgerEntry) {
    const from = window.location.pathname + window.location.search;
    const p = new URLSearchParams({
      from,
      fromLabel: `${accountCode} · ${accountName}`,
      tbLabel,
    });
    navigate(`/journals/${entry.journalEntryId}?${p.toString()}`);
  }

  const openingBalance = Number(data?.openingBalance ?? 0);
  const isDebitNormal = normalBalance === 'DEBIT';

  // Build running balance rows
  const rows = (() => {
    let running = openingBalance;
    return (data?.entries ?? []).map((entry) => {
      const dr = Number(entry.debitAmount);
      const cr = Number(entry.creditAmount);
      running += isDebitNormal ? dr - cr : cr - dr;
      return { entry, runningBalance: running };
    });
  })();

  const closingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance;

  return (
    <div className="p-6 max-w-6xl space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link
          to="/ledger/trial-balance"
          className="hover:text-foreground transition-colors"
        >
          Trial Balance
        </Link>
        <ChevronRight size={13} className="shrink-0" />
        <span className="text-foreground font-medium">
          {accountCode} · {accountName}
        </span>
      </nav>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Back">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">
            <span className="font-mono text-muted-foreground mr-2">{accountCode}</span>
            {accountName}
          </h1>
          <p className={cn('text-sm font-medium mt-0.5', CLASS_COLORS[accountClass] ?? 'text-muted-foreground')}>
            {accountClass}
            <span className="text-muted-foreground font-normal mx-1.5">·</span>
            <span className="text-muted-foreground font-normal">{tbLabel}</span>
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Opening Balance</p>
            <p className={cn('font-semibold font-mono text-sm mt-1', openingBalance < 0 && 'text-red-600')}>
              {fmtBal(openingBalance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Entries</p>
            <p className="font-semibold text-sm mt-1">
              {isLoading ? '—' : data?.pagination.total ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Closing Balance</p>
            <p className={cn('font-semibold font-mono text-sm mt-1', closingBalance < 0 && 'text-red-600')}>
              {isLoading ? '—' : fmtBal(closingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No ledger entries for this account in the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                      Date
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Journal #
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Description
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">
                      Debit
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">
                      Credit
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">
                      Running Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">—</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground italic">
                      Opening Balance
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                    <td className={cn(
                      'px-4 py-2.5 text-right font-mono text-xs font-semibold',
                      openingBalance < 0 && 'text-red-600',
                    )}>
                      {fmtBal(openingBalance)}
                    </td>
                  </tr>

                  {/* Transaction rows */}
                  {rows.map(({ entry, runningBalance }) => {
                    const dr = Number(entry.debitAmount);
                    const cr = Number(entry.creditAmount);
                    return (
                      <tr
                        key={entry.id}
                        className="border-b last:border-0 hover:bg-accent/50 cursor-pointer transition-colors group"
                        onClick={() => handleEntryClick(entry)}
                        title="Click to view full journal entry"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(entry.transactionDate).toLocaleDateString('en-US', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-medium text-primary group-hover:underline">
                          {entry.journalEntry.journalNumber}
                        </td>
                        <td className="px-4 py-2.5 text-xs max-w-[220px] truncate" title={entry.journalEntry.description ?? ''}>
                          {entry.journalEntry.description ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {entry.journalEntry.reference ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-blue-600 dark:text-blue-400">
                          {dr > 0 ? fmt(dr) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-red-600 dark:text-red-400">
                          {cr > 0 ? fmt(cr) : '—'}
                        </td>
                        <td className={cn(
                          'px-4 py-2.5 text-right font-mono text-xs font-semibold',
                          runningBalance < 0 && 'text-red-600',
                        )}>
                          {fmtBal(runningBalance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Closing balance footer */}
                <tfoot>
                  <tr className="border-t-2 bg-muted/20">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold">
                      Closing Balance
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {fmt(rows.reduce((s, r) => s + Number(r.entry.debitAmount), 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-600 dark:text-red-400">
                      {fmt(rows.reduce((s, r) => s + Number(r.entry.creditAmount), 0))}
                    </td>
                    <td className={cn(
                      'px-4 py-2.5 text-right font-mono text-xs font-semibold',
                      closingBalance < 0 && 'text-red-600',
                    )}>
                      {fmtBal(closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.pagination.hasNext && (
        <p className="text-xs text-muted-foreground text-center">
          Showing first {data.entries.length} of {data.pagination.total} entries
        </p>
      )}
    </div>
  );
}
