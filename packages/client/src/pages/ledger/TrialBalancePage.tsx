import { useQuery } from '@tanstack/react-query';
import { Scale, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getTrialBalance } from '@/services/ledger.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const CLASS_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const CLASS_COLORS: Record<string, string> = {
  ASSET: 'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY: 'text-amber-600 dark:text-amber-400',
  REVENUE: 'text-green-600 dark:text-green-400',
  EXPENSE: 'text-orange-600 dark:text-orange-400',
};

function fmt(v: string) {
  const n = Number(v);
  return n === 0
    ? '—'
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function TrialBalancePage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', activeOrganisationId],
    queryFn: () => getTrialBalance(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  // Group by class
  const grouped = CLASS_ORDER.map((cls) => ({
    class: cls,
    lines: (data?.lines ?? []).filter((l) => l.class === cls),
  })).filter((g) => g.lines.length > 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Scale size={18} /> Trial Balance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">All posted ledger entries</p>
        </div>

        {data && (
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', data.isBalanced ? 'text-green-600' : 'text-red-600')}>
            {data.isBalanced ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {data.isBalanced ? 'Balanced' : 'Out of balance'}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : !data?.lines.length ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No posted ledger entries found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-24">Class</TableHead>
                  <TableHead className="text-right w-36">Debit</TableHead>
                  <TableHead className="text-right w-36">Credit</TableHead>
                  <TableHead className="text-right w-36">Balance</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {grouped.map((group) => (
                  <>
                    <TableRow key={`heading-${group.class}`} className="bg-muted/30">
                      <TableCell colSpan={6} className={cn('text-xs font-semibold uppercase tracking-wide py-2', CLASS_COLORS[group.class])}>
                        {group.class}
                      </TableCell>
                    </TableRow>
                    {group.lines.map((line) => (
                      <TableRow key={line.accountId}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{line.code}</TableCell>
                        <TableCell className="text-sm">{line.name}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right font-mono text-xs debit-amount">
                          {fmt(line.totalDebit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs credit-amount">
                          {fmt(line.totalCredit)}
                        </TableCell>
                        <TableCell className={cn('text-right font-mono text-xs font-medium', Number(line.balance) < 0 && 'negative-amount')}>
                          {fmt(line.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>

              {data && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold text-sm">Totals</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm debit-amount">
                      {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(data.totalDebit))}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm credit-amount">
                      {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(data.totalCredit))}
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
              )}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
