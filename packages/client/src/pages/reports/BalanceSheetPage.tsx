import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getBalanceSheet } from '@/services/reports.service';
import type { StatementSection } from '@/services/reports.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function fmt(v: string | number, _currency?: string) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
}

function Section({
  section,
  currency,
  indent = false,
}: {
  section: StatementSection;
  currency: string;
  indent?: boolean;
}) {
  if (!section.lines.length) return null;
  return (
    <div className={cn('mb-4', indent && 'ml-4')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{section.label}</p>
      {section.lines.map((line) => (
        <div key={line.accountId} className="flex justify-between py-1 border-b border-dashed border-border/60 text-sm">
          <span className="text-muted-foreground text-xs">{line.code}</span>
          <span className="flex-1 px-3">{line.name}</span>
          <span className="font-mono text-xs tabular-nums">{fmt(line.balance, currency)}</span>
        </div>
      ))}
      <div className="flex justify-between py-1.5 font-semibold text-sm border-t">
        <span>Total {section.label}</span>
        <span className="font-mono">{fmt(section.subtotal, currency)}</span>
      </div>
    </div>
  );
}

function TotalRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('flex justify-between py-2 text-sm font-semibold', highlight && 'text-primary border-t-2 border-primary mt-2 pt-3')}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

export function BalanceSheetPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', activeOrganisationId],
    queryFn: () => getBalanceSheet(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Building2 size={18} /> Balance Sheet
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Statement of Financial Position · {currency}
          </p>
        </div>
        {data && (
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', data.isBalanced ? 'text-green-600' : 'text-red-600')}>
            {data.isBalanced ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {data.isBalanced ? 'Assets = Liabilities + Equity' : 'Out of balance'}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !data ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assets */}
          <Card>
            <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
            <CardContent>
              <Section section={data.assets.current} currency={currency} />
              <Section section={data.assets.nonCurrent} currency={currency} />
              <TotalRow label="TOTAL ASSETS" value={fmt(data.assets.total, currency)} highlight />
            </CardContent>
          </Card>

          {/* Liabilities + Equity */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Liabilities</CardTitle></CardHeader>
              <CardContent>
                <Section section={data.liabilities.current} currency={currency} />
                <Section section={data.liabilities.nonCurrent} currency={currency} />
                <TotalRow label="TOTAL LIABILITIES" value={fmt(data.liabilities.total, currency)} highlight />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Equity</CardTitle></CardHeader>
              <CardContent>
                <Section section={data.equity.items} currency={currency} />
                <div className="flex justify-between py-1 border-b border-dashed border-border/60 text-sm">
                  <span className="flex-1">Current Period Profit</span>
                  <span className={cn('font-mono text-xs', Number(data.equity.currentPeriodProfit) < 0 && 'text-red-500')}>
                    {fmt(data.equity.currentPeriodProfit, currency)}
                  </span>
                </div>
                <TotalRow label="TOTAL EQUITY" value={fmt(data.equity.total, currency)} highlight />
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL LIABILITIES & EQUITY</span>
                  <span className="font-mono text-primary">{fmt(data.totalLiabilitiesAndEquity, currency)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
