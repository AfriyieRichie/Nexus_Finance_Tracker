import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listPeriods } from '@/services/periods.service';
import { getChangesInEquity } from '@/services/reports.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { downloadCsv } from '@/utils/export';
import { cn } from '@/lib/utils';

function fmt(v: string | number) {
  const n = Number(v);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AmountCell({ value, className }: { value: number; className?: string }) {
  return (
    <TableCell
      className={cn(
        'text-right font-mono text-sm tabular-nums',
        value < 0 ? 'text-red-600' : '',
        className,
      )}
    >
      {fmt(value)}
    </TableCell>
  );
}

// Classify an equity account name/type into one of our columns
function classifyComponent(name: string): 'shareCapital' | 'retainedEarnings' | 'otherReserves' {
  const lower = name.toLowerCase();
  if (lower.includes('share capital') || lower.includes('paid-in') || lower.includes('paid in') || lower.includes('common stock') || lower.includes('ordinary share')) {
    return 'shareCapital';
  }
  if (lower.includes('retain') || lower.includes('accumulated') || lower.includes('profit') || lower.includes('loss')) {
    return 'retainedEarnings';
  }
  return 'otherReserves';
}

interface MatrixRow {
  label: string;
  shareCapital: number;
  retainedEarnings: number;
  otherReserves: number;
  total: number;
  isBold?: boolean;
}

export function ChangesInEquityPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  const { data: periods } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['changes-in-equity', activeOrganisationId, selectedPeriodId],
    queryFn: () =>
      getChangesInEquity(activeOrganisationId!, selectedPeriodId ? { periodId: selectedPeriodId } : undefined),
    enabled: !!activeOrganisationId,
  });

  // Build the matrix from the API response
  const matrix: MatrixRow[] | null = data
    ? (() => {
        // Accumulate opening / movements / closing by column
        const opening = { shareCapital: 0, retainedEarnings: 0, otherReserves: 0 };
        const movements = { shareCapital: 0, retainedEarnings: 0, otherReserves: 0 };
        const closing = { shareCapital: 0, retainedEarnings: 0, otherReserves: 0 };

        for (const c of data.components ?? []) {
          const col = classifyComponent(c.name);
          opening[col] += Number(c.openingBalance);
          movements[col] += Number(c.movements);
          closing[col] += Number(c.closingBalance);
        }

        // Profit for period flows into retained earnings
        const profit = Number(data.profitForPeriod ?? 0);

        // Derive dividends & issue of capital from movements
        // Share capital column movements → "Issue of Capital"
        // Retained earnings movements that are NOT profit → "Dividends" (negative) or other
        const issueOfCapital = movements.shareCapital;
        const dividends = movements.retainedEarnings - profit; // residual retained earnings movement excl. profit
        const otherMovements = movements.otherReserves;

        const openingTotal = opening.shareCapital + opening.retainedEarnings + opening.otherReserves;
        const closingTotal =
          closing.shareCapital +
          closing.retainedEarnings +
          closing.otherReserves +
          profit;

        return [
          {
            label: 'Opening Balance',
            shareCapital: opening.shareCapital,
            retainedEarnings: opening.retainedEarnings,
            otherReserves: opening.otherReserves,
            total: openingTotal,
            isBold: true,
          },
          {
            label: 'Total Comprehensive Income',
            shareCapital: 0,
            retainedEarnings: profit,
            otherReserves: 0,
            total: profit,
          },
          {
            label: 'Dividends',
            shareCapital: 0,
            retainedEarnings: dividends,
            otherReserves: 0,
            total: dividends,
          },
          {
            label: 'Issue of Capital',
            shareCapital: issueOfCapital,
            retainedEarnings: 0,
            otherReserves: 0,
            total: issueOfCapital,
          },
          {
            label: 'Other Movements',
            shareCapital: 0,
            retainedEarnings: 0,
            otherReserves: otherMovements,
            total: otherMovements,
          },
          {
            label: 'Closing Balance',
            shareCapital: closing.shareCapital,
            retainedEarnings: closing.retainedEarnings + profit,
            otherReserves: closing.otherReserves,
            total: closingTotal,
            isBold: true,
          },
        ] as MatrixRow[];
      })()
    : null;

  function exportCsv() {
    if (!matrix) return;
    const rows: (string | number)[][] = [
      ['', 'Share Capital', 'Retained Earnings', 'Other Reserves', 'Total'],
      ...matrix.map((r) => [r.label, r.shareCapital, r.retainedEarnings, r.otherReserves, r.total]),
    ];
    downloadCsv('changes-in-equity.csv', rows);
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp size={18} /> Statement of Changes in Equity
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">IAS 1 — Equity movements · {currency}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Period selector */}
          <Select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="w-48 h-8 text-sm">
            <option value="">All periods</option>
            {(periods ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>

          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download size={14} className="mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Equity Components
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Movement</TableHead>
                  <TableHead className="text-right">Share Capital</TableHead>
                  <TableHead className="text-right">Retained Earnings</TableHead>
                  <TableHead className="text-right">Other Reserves</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(matrix ?? []).map((row) => (
                  <TableRow
                    key={row.label}
                    className={cn(row.isBold && 'bg-muted/40 font-semibold')}
                  >
                    <TableCell
                      className={cn('text-sm', row.isBold ? 'font-semibold' : 'text-muted-foreground')}
                    >
                      {row.label}
                    </TableCell>
                    <AmountCell value={row.shareCapital} />
                    <AmountCell value={row.retainedEarnings} />
                    <AmountCell value={row.otherReserves} />
                    <AmountCell
                      value={row.total}
                      className={cn(row.isBold && 'font-semibold')}
                    />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Totals summary */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-1">Opening Equity</p>
              <p className={cn('text-lg font-semibold font-mono', Number(data.totals?.openingEquity) < 0 && 'text-red-600')}>
                {fmt(data.totals?.openingEquity ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-1">Movements During Period</p>
              <p className={cn('text-lg font-semibold font-mono', Number(data.totals?.movementsDuringPeriod) < 0 && 'text-red-600')}>
                {fmt(data.totals?.movementsDuringPeriod ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-1">Closing Equity</p>
              <p className={cn('text-lg font-semibold font-mono text-primary', Number(data.totals?.closingEquity) < 0 && 'text-red-600')}>
                {fmt(data.totals?.closingEquity ?? 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
