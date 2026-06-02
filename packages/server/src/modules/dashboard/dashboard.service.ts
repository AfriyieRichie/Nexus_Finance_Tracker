import { Prisma, AccountClass, AccountType } from '@prisma/client';
import { prisma } from '../../config/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyTrendPoint {
  month: string;       // 'Jan', 'Feb', …
  monthNumber: number; // 1–12
  revenue: string;
  expenses: string;
  profit: string;
}

export interface BudgetAlert {
  budgetId: string;
  budgetName: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  budgeted: string;
  actual: string;
  variancePct: string;
  pctUsed: string;
}

export interface DashboardKPIs {
  totalAssets: string;
  totalLiabilities: string;
  netEquity: string;
  cashBalance: string;
  netIncomeMonth: string;
  netIncomeYTD: string;
  arOutstanding: string;
  apOutstanding: string;
}

export interface RecentJournal {
  id: string;
  journalNumber: string;
  description: string | null;
  entryDate: string;
  status: string;
  lineCount: number;
}

export interface DashboardData {
  asOfDate: string;
  fiscalYear: number;
  currency: string;
  kpis: DashboardKPIs;
  monthlyTrend: MonthlyTrendPoint[];
  budgetAlerts: BudgetAlert[];
  pendingApprovalsCount: number;
  recentJournals: RecentJournal[];
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dec(n: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return n ?? new Prisma.Decimal(0);
}

// Unpaid invoice statuses (InvoiceStatus enum values that mean money is still owed)
const UNPAID_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getDashboard(
  organisationId: string,
  userId: string,
): Promise<DashboardData> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const fiscalYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-based

  const ytdStart  = new Date(`${fiscalYear}-01-01T00:00:00Z`);
  const monthStart = new Date(`${fiscalYear}-${String(currentMonth).padStart(2, '0')}-01T00:00:00Z`);
  const todayEnd  = new Date(todayStr + 'T23:59:59Z');

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  const currency = org?.baseCurrency ?? 'GHS';

  // ── Parallel data fetches ──────────────────────────────────────────────────

  const [
    assetAgg, liabAgg, cashAgg,
    revYTD, expYTD, revMonth, expMonth,
    arRaw, apRaw,
    allLedgerFY,
    approvedBudgets,
    pendingCount,
    recentJournals,
  ] = await Promise.all([

    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.ASSET }, transactionDate: { lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.LIABILITY }, transactionDate: { lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { type: { in: [AccountType.BANK, AccountType.CASH] } }, transactionDate: { lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),

    // Revenue YTD
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.REVENUE }, transactionDate: { gte: ytdStart, lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    // Expenses YTD
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.EXPENSE }, transactionDate: { gte: ytdStart, lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    // Revenue current month
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.REVENUE }, transactionDate: { gte: monthStart, lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    // Expenses current month
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.EXPENSE }, transactionDate: { gte: monthStart, lte: todayEnd } },
      _sum: { debitAmount: true, creditAmount: true },
    }),

    // AR: unpaid customer invoices (Invoice model)
    prisma.invoice.aggregate({
      where: { organisationId, status: { in: [...UNPAID_STATUSES] } },
      _sum: { totalAmount: true, amountPaid: true },
    }),

    // AP: unpaid supplier invoices (SupplierInvoice model)
    prisma.supplierInvoice.aggregate({
      where: { organisationId, status: { in: [...UNPAID_STATUSES] } },
      _sum: { totalAmount: true, amountPaid: true },
    }),

    // All revenue + expense ledger entries for the fiscal year (for monthly trend)
    prisma.ledgerEntry.findMany({
      where: {
        organisationId,
        account: { class: { in: [AccountClass.REVENUE, AccountClass.EXPENSE] } },
        transactionDate: { gte: ytdStart, lte: todayEnd },
      },
      select: {
        transactionDate: true,
        debitAmount: true,
        creditAmount: true,
        account: { select: { class: true } },
      },
    }),

    // Approved budgets for budget alerts
    prisma.budget.findMany({
      where: { organisationId, fiscalYear, isApproved: true },
      select: {
        id: true, name: true, alertThresholdPct: true,
        lines: {
          select: {
            accountId: true, periodNumber: true, amount: true,
            account: { select: { code: true, name: true } },
          },
        },
      },
    }),

    // Pending approvals where the logged-in user is a designated approver
    prisma.approvalRequest.count({
      where: {
        status: 'PENDING',
        workflow: {
          organisationId,
          levels: { some: { approvers: { some: { userId } } } },
        },
      },
    }),

    // Recent journals
    prisma.journalEntry.findMany({
      where: { organisationId },
      orderBy: [{ entryDate: 'desc' }, { journalNumber: 'desc' }],
      take: 8,
      select: {
        id: true, journalNumber: true, description: true, entryDate: true, status: true,
        _count: { select: { lines: true } },
      },
    }),
  ]);

  // ── KPI Computations ───────────────────────────────────────────────────────

  const totalAssets    = dec(assetAgg._sum.debitAmount).minus(dec(assetAgg._sum.creditAmount));
  const totalLiab      = dec(liabAgg._sum.creditAmount).minus(dec(liabAgg._sum.debitAmount));
  const cashBalance    = dec(cashAgg._sum.debitAmount).minus(dec(cashAgg._sum.creditAmount));
  const netEquity      = totalAssets.minus(totalLiab);

  const revYTDNet      = dec(revYTD._sum.creditAmount).minus(dec(revYTD._sum.debitAmount));
  const expYTDNet      = dec(expYTD._sum.debitAmount).minus(dec(expYTD._sum.creditAmount));
  const netIncomeYTD   = revYTDNet.minus(expYTDNet);

  const revMonthNet    = dec(revMonth._sum.creditAmount).minus(dec(revMonth._sum.debitAmount));
  const expMonthNet    = dec(expMonth._sum.debitAmount).minus(dec(expMonth._sum.creditAmount));
  const netIncomeMonth = revMonthNet.minus(expMonthNet);

  const arOutstanding  = dec(arRaw._sum.totalAmount).minus(dec(arRaw._sum.amountPaid));
  const apOutstanding  = dec(apRaw._sum.totalAmount).minus(dec(apRaw._sum.amountPaid));

  // ── Monthly Trend ──────────────────────────────────────────────────────────

  const monthBuckets = new Map<number, { rev: Prisma.Decimal; exp: Prisma.Decimal }>();
  for (let m = 1; m <= currentMonth; m++) {
    monthBuckets.set(m, { rev: new Prisma.Decimal(0), exp: new Prisma.Decimal(0) });
  }

  for (const entry of allLedgerFY) {
    const m = new Date(entry.transactionDate).getUTCMonth() + 1;
    const bucket = monthBuckets.get(m);
    if (!bucket) continue;
    const dr = dec(entry.debitAmount);
    const cr = dec(entry.creditAmount);
    if (entry.account.class === AccountClass.REVENUE) {
      bucket.rev = bucket.rev.plus(cr.minus(dr));
    } else {
      bucket.exp = bucket.exp.plus(dr.minus(cr));
    }
  }

  const monthlyTrend: MonthlyTrendPoint[] = [];
  for (let m = 1; m <= currentMonth; m++) {
    const b = monthBuckets.get(m)!;
    monthlyTrend.push({
      month: MONTH_ABBR[m - 1],
      monthNumber: m,
      revenue:  b.rev.toFixed(2),
      expenses: b.exp.toFixed(2),
      profit:   b.rev.minus(b.exp).toFixed(2),
    });
  }

  // ── Budget Alerts ──────────────────────────────────────────────────────────

  const budgetAlerts: BudgetAlert[] = [];

  const ytdPeriods = await prisma.accountingPeriod.findMany({
    where: { organisationId, fiscalYear, periodNumber: { lte: currentMonth } },
    select: { id: true },
  });
  const ytdPeriodIds: string[] = ytdPeriods.map((p) => p.id);

  for (const budget of approvedBudgets) {
    const threshold = budget.alertThresholdPct ? Number(budget.alertThresholdPct) : 80;

    const accountIds = [...new Set(budget.lines.map((l) => l.accountId))];
    if (!accountIds.length) continue;

    const actuals = await prisma.ledgerEntry.groupBy({
      by: ['accountId'],
      where: {
        organisationId,
        accountId: { in: accountIds },
        ...(ytdPeriodIds.length ? { periodId: { in: ytdPeriodIds } } : { periodId: 'none' }),
      },
      _sum: { debitAmount: true, creditAmount: true },
    });

    const actualMap = new Map(
      actuals.map((a) => [
        a.accountId,
        dec(a._sum?.debitAmount).minus(dec(a._sum?.creditAmount)),
      ]),
    );

    // Sum budget lines per account across all periods
    const budgetMap = new Map<string, { amount: Prisma.Decimal; code: string; name: string }>();
    for (const line of budget.lines) {
      const existing = budgetMap.get(line.accountId);
      const amt = new Prisma.Decimal(line.amount);
      if (existing) {
        existing.amount = existing.amount.plus(amt);
      } else {
        budgetMap.set(line.accountId, {
          amount: amt,
          code: line.account.code,
          name: line.account.name,
        });
      }
    }

    for (const [accountId, info] of budgetMap.entries()) {
      if (info.amount.isZero()) continue;
      const actual = actualMap.get(accountId) ?? new Prisma.Decimal(0);
      const pctUsed = actual.div(info.amount).times(100);
      if (pctUsed.greaterThanOrEqualTo(threshold)) {
        const variance = info.amount.minus(actual);
        budgetAlerts.push({
          budgetId:    budget.id,
          budgetName:  budget.name,
          accountId,
          accountCode: info.code,
          accountName: info.name,
          budgeted:    info.amount.toFixed(2),
          actual:      actual.toFixed(2),
          variancePct: variance.isZero() ? '0.0' : variance.div(info.amount).times(100).toFixed(1),
          pctUsed:     pctUsed.toFixed(1),
        });
      }
    }
  }

  budgetAlerts.sort((a, b) => Number(b.pctUsed) - Number(a.pctUsed));

  return {
    asOfDate: todayStr,
    fiscalYear,
    currency,
    kpis: {
      totalAssets:      totalAssets.toFixed(2),
      totalLiabilities: totalLiab.toFixed(2),
      netEquity:        netEquity.toFixed(2),
      cashBalance:      cashBalance.toFixed(2),
      netIncomeMonth:   netIncomeMonth.toFixed(2),
      netIncomeYTD:     netIncomeYTD.toFixed(2),
      arOutstanding:    arOutstanding.toFixed(2),
      apOutstanding:    apOutstanding.toFixed(2),
    },
    monthlyTrend,
    budgetAlerts: budgetAlerts.slice(0, 10),
    pendingApprovalsCount: pendingCount,
    recentJournals: recentJournals.map((j) => ({
      id:            j.id,
      journalNumber: j.journalNumber,
      description:   j.description,
      entryDate:     j.entryDate.toISOString().slice(0, 10),
      status:        j.status,
      lineCount:     j._count.lines,
    })),
  };
}
