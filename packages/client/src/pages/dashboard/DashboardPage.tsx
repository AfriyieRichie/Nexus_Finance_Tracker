import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Scale, FileText, ArrowUpRight, Users, ShoppingCart, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getTrialBalance } from '@/services/ledger.service';
import { getIncomeStatement } from '@/services/reports.service';
import { listJournals } from '@/services/journals.service';
import { getArAgeing } from '@/services/ar.service';
import { getApAgeing } from '@/services/ap.service';
import { listRequests } from '@/services/approvals.service';
import { cn } from '@/lib/utils';

function fmt(value: string | number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

const JOURNAL_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  POSTED: 'success',
  APPROVED: 'info',
  PENDING_APPROVAL: 'warning',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
  REVERSED: 'secondary',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function DashboardPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const { data: tb, isLoading: tbLoading } = useQuery({
    queryKey: ['trial-balance', activeOrganisationId],
    queryFn: () => getTrialBalance(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['income-statement', activeOrganisationId],
    queryFn: () => getIncomeStatement(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const { data: journalsData, isLoading: journalsLoading } = useQuery({
    queryKey: ['journals', activeOrganisationId],
    queryFn: () => listJournals(activeOrganisationId!, { pageSize: 8 }),
    enabled: !!activeOrganisationId,
  });

  const { data: arAgeing } = useQuery({
    queryKey: ['ar-ageing', activeOrganisationId],
    queryFn: () => getArAgeing(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const { data: apAgeing } = useQuery({
    queryKey: ['ap-ageing', activeOrganisationId],
    queryFn: () => getApAgeing(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const { data: pendingApprovals } = useQuery({
    queryKey: ['approvals', activeOrganisationId, 'PENDING'],
    queryFn: () => listRequests(activeOrganisationId!, { status: 'PENDING' }),
    enabled: !!activeOrganisationId,
  });

  // Compute KPIs from trial balance
  const totalAssets = tb?.lines
    .filter((l) => l.class === 'ASSET')
    .reduce((sum, l) => sum + Number(l.balance), 0) ?? 0;

  const revenue = Number(pnl?.revenue.subtotal ?? 0);
  const expenses = Number(pnl?.costOfSales.subtotal ?? 0) + Number(pnl?.operatingExpenses.subtotal ?? 0);
  const profit = Number(pnl?.profitForPeriod ?? 0);

  // Pie data: expense breakdown
  const expensePieData = [
    ...(pnl?.costOfSales.lines ?? []).map((l) => ({ name: l.name, value: Math.abs(Number(l.balance)) })),
    ...(pnl?.operatingExpenses.lines ?? []).map((l) => ({ name: l.name, value: Math.abs(Number(l.balance)) })),
  ]
    .filter((d) => d.value > 0)
    .slice(0, 5);

  // Simple revenue/expense bar data (monthly labels are placeholders without historical data)
  const revenueExpenseData = [
    { name: 'Revenue', value: revenue },
    { name: 'Cost of Sales', value: Number(pnl?.costOfSales.subtotal ?? 0) },
    { name: 'Operating Exp.', value: Number(pnl?.operatingExpenses.subtotal ?? 0) },
    { name: 'Net Profit', value: profit },
  ];

  const kpis = [
    {
      label: 'Total Assets',
      value: fmt(totalAssets, currency),
      icon: <DollarSign size={16} className="text-blue-500" />,
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      change: null,
    },
    {
      label: 'Total Revenue',
      value: fmt(revenue, currency),
      icon: <TrendingUp size={16} className="text-green-500" />,
      bg: 'bg-green-50 dark:bg-green-950/30',
      change: null,
    },
    {
      label: 'Total Expenses',
      value: fmt(expenses, currency),
      icon: <TrendingDown size={16} className="text-amber-500" />,
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      change: null,
    },
    {
      label: 'Net Profit',
      value: fmt(profit, currency),
      icon: <Scale size={16} className={profit >= 0 ? 'text-emerald-500' : 'text-red-500'} />,
      bg: profit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30',
      change: null,
    },
  ];

  if (!activeOrganisationId) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <p className="text-muted-foreground text-sm">No organisation selected.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeOrg?.organisationName} · {activeOrg?.baseCurrency}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>{kpi.label}</CardTitle>
                <div className={cn('p-1.5 rounded-md', kpi.bg)}>{kpi.icon}</div>
              </div>
            </CardHeader>
            <CardContent>
              {tbLoading || pnlLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                <p className="text-2xl font-bold tracking-tight font-mono">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Revenue vs Expenses bar */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Revenue & Expenses Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {pnlLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueExpenseData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency} ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => [fmt(v, currency), '']}
                    contentStyle={{ fontSize: 12, border: '1px solid hsl(var(--border))', borderRadius: 6, background: 'hsl(var(--card))' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#colorVal)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expense pie */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pnlLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : expensePieData.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">No expense data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={expensePieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expensePieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 10 }}>{value}</span>}
                  />
                  <Tooltip formatter={(v: number) => [fmt(v, currency), '']} contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AR / AP / Approvals quick tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/ar?tab=ageing">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm"><Users size={14} /> AR Outstanding</CardTitle>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">
                {fmt(arAgeing?.grandTotal ?? 0, currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Overdue: {fmt(
                  (Number(arAgeing?.buckets?.days1_30 ?? 0) + Number(arAgeing?.buckets?.days31_60 ?? 0) +
                   Number(arAgeing?.buckets?.days61_90 ?? 0) + Number(arAgeing?.buckets?.over90 ?? 0)),
                  currency,
                )}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/ap?tab=ageing">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm"><ShoppingCart size={14} /> AP Outstanding</CardTitle>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">
                {fmt(apAgeing?.grandTotal ?? 0, currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Overdue: {fmt(
                  (Number(apAgeing?.buckets?.days1_30 ?? 0) + Number(apAgeing?.buckets?.days31_60 ?? 0) +
                   Number(apAgeing?.buckets?.days61_90 ?? 0) + Number(apAgeing?.buckets?.over90 ?? 0)),
                  currency,
                )}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/approvals">
          <Card className={cn('hover:border-primary/40 transition-colors cursor-pointer', (pendingApprovals?.total ?? 0) > 0 && 'border-amber-400/60')}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm"><Clock size={14} /> Pending Approvals</CardTitle>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">{pendingApprovals?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(pendingApprovals?.total ?? 0) === 0 ? 'All clear' : 'Requires your action'}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Journals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText size={14} /> Recent Journal Entries
            </CardTitle>
            <Link
              to="/journals"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {journalsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !journalsData?.entries.length ? (
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
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Lines</th>
                </tr>
              </thead>
              <tbody>
                {journalsData.entries.map((j) => (
                  <tr key={j.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-primary font-medium">{j.journalNumber}</td>
                    <td className="px-4 py-2.5 max-w-xs truncate text-sm">{j.description}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(j.entryDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={JOURNAL_STATUS_VARIANT[j.status] ?? 'secondary'}>
                        {j.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{j._count?.lines ?? '—'}</td>
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
