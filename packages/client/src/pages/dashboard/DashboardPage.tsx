import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Scale, FileText,
  ArrowUpRight, Users, ShoppingCart, Clock, Landmark,
  Banknote, AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboardData } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';

function fmt(value: string | number, currency = 'GHS') {
  const num = Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function fmtShort(value: string | number) {
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  POSTED: 'success',
  APPROVED: 'info',
  PENDING_APPROVAL: 'warning',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
  REVERSED: 'secondary',
};

export function DashboardPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'GHS';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', activeOrganisationId],
    queryFn: () => getDashboardData(activeOrganisationId!),
    enabled: !!activeOrganisationId,
    staleTime: 60_000, // refresh every 60s
  });

  if (!activeOrganisationId) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <p className="text-muted-foreground text-sm">No organisation selected.</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const netIncomeMonthNum = Number(kpis?.netIncomeMonth ?? 0);
  const netIncomeYTDNum   = Number(kpis?.netIncomeYTD   ?? 0);
  const netEquityNum      = Number(kpis?.netEquity       ?? 0);

  const kpiCards = [
    {
      label: 'Total Assets',
      value: fmt(kpis?.totalAssets ?? 0, currency),
      icon: <DollarSign size={16} className="text-blue-300" />,
      bg: 'bg-blue-400/15',
      sub: null,
    },
    {
      label: 'Total Liabilities',
      value: fmt(kpis?.totalLiabilities ?? 0, currency),
      icon: <Banknote size={16} className="text-rose-300" />,
      bg: 'bg-rose-400/15',
      sub: null,
    },
    {
      label: 'Net Equity',
      value: fmt(kpis?.netEquity ?? 0, currency),
      icon: <Scale size={16} className={netEquityNum >= 0 ? 'text-emerald-300' : 'text-red-300'} />,
      bg: netEquityNum >= 0 ? 'bg-emerald-400/15' : 'bg-red-400/15',
      sub: null,
    },
    {
      label: 'Cash Balance',
      value: fmt(kpis?.cashBalance ?? 0, currency),
      icon: <Landmark size={16} className="text-cyan-300" />,
      bg: 'bg-cyan-400/15',
      sub: null,
    },
    {
      label: 'Net Income — Month',
      value: fmt(kpis?.netIncomeMonth ?? 0, currency),
      icon: <TrendingUp size={16} className={netIncomeMonthNum >= 0 ? 'text-green-300' : 'text-red-300'} />,
      bg: netIncomeMonthNum >= 0 ? 'bg-green-400/15' : 'bg-red-400/15',
      sub: 'Current month',
    },
    {
      label: 'Net Income — YTD',
      value: fmt(kpis?.netIncomeYTD ?? 0, currency),
      icon: <TrendingDown size={16} className={netIncomeYTDNum >= 0 ? 'text-indigo-300' : 'text-red-300'} />,
      bg: netIncomeYTDNum >= 0 ? 'bg-indigo-400/15' : 'bg-red-400/15',
      sub: `FY${data?.fiscalYear ?? ''}`,
    },
    {
      label: 'AR Outstanding',
      value: fmt(kpis?.arOutstanding ?? 0, currency),
      icon: <Users size={16} className="text-amber-300" />,
      bg: 'bg-amber-400/15',
      link: '/ar?tab=ageing',
      sub: 'Click to view ageing',
    },
    {
      label: 'AP Outstanding',
      value: fmt(kpis?.apOutstanding ?? 0, currency),
      icon: <ShoppingCart size={16} className="text-orange-300" />,
      bg: 'bg-orange-400/15',
      link: '/ap?tab=ageing',
      sub: 'Click to view ageing',
    },
  ] as const;

  const trendData = data?.monthlyTrend ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeOrg?.organisationName} · {currency} · {data?.asOfDate ?? '…'}
        </p>
      </div>

      {/* KPI Cards — 4 columns, 2 rows. Brand "premium" teal tiles. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const clickable = 'link' in kpi && kpi.link;
          const card = (
            <div
              className={cn(
                'rounded-xl p-4 border border-white/10 transition-all duration-200',
                'hover:-translate-y-0.5 hover:border-[#d3aa49]/45 hover:shadow-xl',
                clickable && 'cursor-pointer',
              )}
              style={{ background: 'linear-gradient(135deg, #123f51 0%, #0e3243 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white/65">{kpi.label}</p>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', kpi.bg)}>{kpi.icon}</div>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-28 mt-3 bg-white/10" />
              ) : (
                <p className="text-2xl font-bold tracking-tight font-mono mt-2 text-white">{kpi.value}</p>
              )}
              {'sub' in kpi && kpi.sub && (
                <p className="text-xs mt-1 text-white/40">{kpi.sub}</p>
              )}
            </div>
          );
          return clickable
            ? <Link to={kpi.link} key={kpi.label} className="no-underline">{card}</Link>
            : <div key={kpi.label}>{card}</div>;
        })}
      </div>

      {/* Revenue vs Expenses — Monthly Bar Chart for current fiscal year */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Revenue vs Expenses — Monthly ({data?.fiscalYear ?? '…'})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : trendData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
              No transactions posted for {data?.fiscalYear}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => fmtShort(v)}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [fmt(v, currency), name]}
                  contentStyle={{ fontSize: 12, border: '1px solid hsl(var(--border))', borderRadius: 6, background: 'hsl(var(--card))' }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"  name="Revenue"  fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit"   name="Net Profit" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Budget Alerts + Pending Approvals */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Budget Alerts — spans 2 cols */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle size={14} className="text-amber-500" /> Budget Alerts
              </CardTitle>
              <Link to="/budgets" className="text-xs text-primary hover:underline flex items-center gap-1">
                View budgets <ArrowUpRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !data?.budgetAlerts.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No budget lines at or above alert threshold.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Budget</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Budget Name</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Budgeted</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Actual</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Used %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.budgetAlerts.map((alert) => {
                    const pct = Number(alert.pctUsed);
                    const isOver = pct >= 100;
                    return (
                      <tr key={`${alert.budgetId}-${alert.accountId}`} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-mono text-xs">{alert.accountCode}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[140px] truncate">{alert.accountName}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{alert.budgetName}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-mono">{fmt(alert.budgeted, currency)}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-mono">{fmt(alert.actual, currency)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={cn('text-xs font-semibold', isOver ? 'text-red-600' : 'text-amber-600')}>
                            {pct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Link to="/approvals">
          <Card className={cn(
            'hover:border-primary/40 transition-colors cursor-pointer h-full',
            (data?.pendingApprovalsCount ?? 0) > 0 && 'border-amber-400/60',
          )}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock size={14} /> Pending Approvals
                </CardTitle>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-4xl font-bold font-mono">
                    {data?.pendingApprovalsCount ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(data?.pendingApprovalsCount ?? 0) === 0
                      ? 'No actions required'
                      : 'Awaiting your decision'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Journals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText size={14} /> Recent Journal Entries
            </CardTitle>
            <Link to="/journals" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data?.recentJournals.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No journal entries yet.{' '}
              <Link to="/journals" className="text-primary hover:underline">Create one</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Number</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Lines</th>
                </tr>
              </thead>
              <tbody>
                {data.recentJournals.map((j) => (
                  <tr key={j.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-primary font-medium">{j.journalNumber}</td>
                    <td className="px-4 py-2.5 max-w-xs truncate text-sm">{j.description ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(j.entryDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[j.status] ?? 'secondary'}>
                        {j.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground text-right">{j.lineCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
