import { useQuery } from '@tanstack/react-query';
import { Banknote, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getCashFlow } from '@/services/reports.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/utils/export';

function fmt(v: string | number) {
  const n = Number(v);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
}

function SignedAmount({ value }: { value: string }) {
  const n = Number(value);
  return (
    <span className={cn('font-mono text-xs tabular-nums flex items-center gap-0.5', n >= 0 ? 'text-green-600' : 'text-red-500')}>
      {n >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {fmt(value)}
    </span>
  );
}

export function CashFlowPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const { data, isLoading } = useQuery({
    queryKey: ['cash-flow', activeOrganisationId],
    queryFn: () => getCashFlow(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [['Account', 'Amount']];
    rows.push(['Net Profit', Number(data.operatingActivities.netProfit)]);
    for (const item of data.operatingActivities.workingCapitalAdjustments) {
      rows.push([item.name, Number(item.balance)]);
    }
    rows.push(['Net Cash from Operating', Number(data.operatingActivities.netCashFromOperating)]);
    for (const item of data.investingActivities.items) {
      rows.push([item.name, Number(item.balance)]);
    }
    rows.push(['Net Cash from Investing', Number(data.investingActivities.netCashFromInvesting)]);
    for (const item of data.financingActivities.items) {
      rows.push([item.name, Number(item.balance)]);
    }
    rows.push(['Net Cash from Financing', Number(data.financingActivities.netCashFromFinancing)]);
    rows.push(['Opening Cash Balance', Number(data.openingCashBalance)]);
    rows.push(['Net Change in Cash', Number(data.netChangeInCash)]);
    rows.push(['Closing Cash Balance', Number(data.closingCashBalance)]);
    downloadCsv('cash-flow.csv', rows);
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Banknote size={18} /> Cash Flow Statement
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">IAS 7 — Indirect Method · {currency}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
          <Download size={14} className="mr-1" /> CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* Operating */}
          <Card>
            <CardHeader><CardTitle>Operating Activities</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between py-1 text-sm border-b border-dashed border-border/50">
                <span>Net Profit</span>
                <SignedAmount value={data.operatingActivities.netProfit} />
              </div>
              {data.operatingActivities.workingCapitalAdjustments.map((item: { accountId: string; name: string; balance: string }) => (
                <div key={item.accountId} className="flex justify-between py-1 text-sm border-b border-dashed border-border/50">
                  <span className="text-muted-foreground">{item.name}</span>
                  <SignedAmount value={item.balance} />
                </div>
              ))}
              <div className="flex justify-between py-2 font-semibold text-sm border-t">
                <span>Net Cash from Operating</span>
                <SignedAmount value={data.operatingActivities.netCashFromOperating} />
              </div>
            </CardContent>
          </Card>

          {/* Investing */}
          <Card>
            <CardHeader><CardTitle>Investing Activities</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {data.investingActivities.items.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No investing activities</p>
              )}
              {data.investingActivities.items.map((item: { accountId: string; name: string; balance: string }) => (
                <div key={item.accountId} className="flex justify-between py-1 text-sm border-b border-dashed border-border/50">
                  <span className="text-muted-foreground">{item.name}</span>
                  <SignedAmount value={item.balance} />
                </div>
              ))}
              <div className="flex justify-between py-2 font-semibold text-sm border-t">
                <span>Net Cash from Investing</span>
                <SignedAmount value={data.investingActivities.netCashFromInvesting} />
              </div>
            </CardContent>
          </Card>

          {/* Financing */}
          <Card>
            <CardHeader><CardTitle>Financing Activities</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {data.financingActivities.items.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No financing activities</p>
              )}
              {data.financingActivities.items.map((item: { accountId: string; name: string; balance: string }) => (
                <div key={item.accountId} className="flex justify-between py-1 text-sm border-b border-dashed border-border/50">
                  <span className="text-muted-foreground">{item.name}</span>
                  <SignedAmount value={item.balance} />
                </div>
              ))}
              <div className="flex justify-between py-2 font-semibold text-sm border-t">
                <span>Net Cash from Financing</span>
                <SignedAmount value={data.financingActivities.netCashFromFinancing} />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opening Cash Balance</span>
                <span className="font-mono">{fmt(data.openingCashBalance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Net Change in Cash</span>
                <SignedAmount value={data.netChangeInCash} />
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>Closing Cash Balance</span>
                <span className={cn('font-mono', Number(data.closingCashBalance) >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {fmt(data.closingCashBalance)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
