import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getIncomeStatement, type StatementSection } from '@/services/reports.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function fmt(v: string | number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
}

function LineItems({ section }: { section: StatementSection }) {
  if (!section.lines.length) return <p className="text-xs text-muted-foreground py-2">No entries</p>;
  return (
    <div className="mb-3">
      {section.lines.map((line) => (
        <div key={line.accountId} className="flex justify-between py-1 border-b border-dashed border-border/50 text-sm">
          <span className="text-muted-foreground text-xs w-20 shrink-0">{line.code}</span>
          <span className="flex-1">{line.name}</span>
          <span className="font-mono text-xs">{fmt(line.balance)}</span>
        </div>
      ))}
    </div>
  );
}

function Subtotal({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex justify-between py-1.5 text-sm font-semibold border-t', className)}>
      <span>{label}</span>
      <span className={cn('font-mono', Number(value) < 0 ? 'text-red-500' : 'text-green-600')}>{fmt(value)}</span>
    </div>
  );
}

export function IncomeStatementPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const { data, isLoading } = useQuery({
    queryKey: ['income-statement', activeOrganisationId],
    queryFn: () => getIncomeStatement(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp size={18} /> Income Statement
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Profit & Loss · {currency}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data ? null : (
        <Card>
          <CardHeader><CardTitle>Period to Date</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Revenue */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Revenue</p>
              <LineItems section={data.revenue} />
              <Subtotal label={`Total ${data.revenue.label}`} value={data.revenue.subtotal} />
            </div>

            {/* Cost of Sales */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cost of Sales</p>
              <LineItems section={data.costOfSales} />
              <Subtotal label={`Total ${data.costOfSales.label}`} value={data.costOfSales.subtotal} />
            </div>

            {/* Gross Profit */}
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Gross Profit</span>
                <span className={cn('font-mono', Number(data.grossProfit) < 0 ? 'text-red-600' : 'text-green-600')}>
                  {fmt(data.grossProfit)}
                </span>
              </div>
            </div>

            {/* Operating Expenses */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Operating Expenses</p>
              <LineItems section={data.operatingExpenses} />
              <Subtotal label={`Total ${data.operatingExpenses.label}`} value={data.operatingExpenses.subtotal} />
            </div>

            {/* Profit for Period */}
            <div className={cn('rounded-md px-3 py-3 mt-2', Number(data.profitForPeriod) >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30')}>
              <div className="flex justify-between text-base font-bold">
                <span>{Number(data.profitForPeriod) >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                <span className={cn('font-mono', Number(data.profitForPeriod) < 0 ? 'text-red-600' : 'text-green-700')}>
                  {fmt(data.profitForPeriod)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
