import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

// ─── Shared filters & dataset ──────────────────────────────────────────────────

export interface ReportFilters {
  runId?: string;
  year?: number;
  month?: number;       // 1-12, requires year
  departmentId?: string;
  employeeId?: string;
}

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);

// Resolve the run-date window for a year / year+month scope.
function dateWindow(year?: number, month?: number): { gte: Date; lte: Date } | undefined {
  if (!year) return undefined;
  const m = month ? month - 1 : 0;
  const start = new Date(Date.UTC(year, m, 1));
  const end = month
    ? new Date(Date.UTC(year, m + 1, 0, 23, 59, 59))
    : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  return { gte: start, lte: end };
}

const payslipInclude = {
  employee: {
    select: {
      employeeNumber: true, firstName: true, lastName: true,
      ssnitNumber: true, tinNumber: true, nationalId: true, employmentType: true,
      bankName: true, bankAccountNumber: true, bankBranch: true,
      department: { select: { id: true, name: true } },
    },
  },
  payrollRun: { select: { runNumber: true, paymentDate: true, status: true, description: true } },
} satisfies Prisma.PayslipInclude;

type PayslipRow = Prisma.PayslipGetPayload<{ include: typeof payslipInclude }>;

async function fetchPayslips(organisationId: string, f: ReportFilters): Promise<PayslipRow[]> {
  const window = dateWindow(f.year, f.month);
  const where: Prisma.PayslipWhereInput = {
    organisationId,
    ...(f.runId ? { payrollRunId: f.runId } : {}),
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.employeeId ? { employeeId: f.employeeId } : {}),
    // Year/period scope only counts finalised runs (exclude DRAFT noise).
    ...(window ? { payrollRun: { paymentDate: window, status: { in: ['APPROVED', 'PAID', 'LOCKED'] } } } : {}),
  };
  return prisma.payslip.findMany({
    where,
    include: payslipInclude,
    orderBy: [{ payrollRun: { paymentDate: 'asc' } }, { employee: { employeeNumber: 'asc' } }],
  });
}

const empName = (p: PayslipRow) => `${p.employee.firstName} ${p.employee.lastName}`;

async function scopeMeta(organisationId: string, f: ReportFilters) {
  if (f.runId) {
    const run = await prisma.payrollRun.findFirst({
      where: { id: f.runId, organisationId },
      select: { runNumber: true, description: true, paymentDate: true, status: true },
    });
    return { type: 'run' as const, runNumber: run?.runNumber, description: run?.description, paymentDate: run?.paymentDate, status: run?.status };
  }
  return { type: 'period' as const, year: f.year, month: f.month ?? null };
}

// ─── 1. Payroll Register (master report) ───────────────────────────────────────

export async function getPayrollRegister(organisationId: string, f: ReportFilters) {
  const slips = await fetchPayslips(organisationId, f);
  const rows = slips.map((p) => ({
    employeeNumber: p.employee.employeeNumber,
    name: empName(p),
    department: p.employee.department?.name ?? '—',
    runNumber: p.payrollRun.runNumber,
    basic: num(p.basicSalary),
    allowances: num(p.allowances),
    overtime: num(p.overtimePay),
    bonus: num(p.bonuses),
    otherEarnings: num(p.otherEarnings),
    gross: num(p.grossPay),
    paye: num(p.payeAmount) + num(p.overtimeTax) + num(p.bonusTax),
    ssnitEmployee: num(p.ssnitEmployee),
    tier3Employee: num(p.tier3Employee),
    otherDeductions: num(p.otherDeductions),
    totalDeductions: num(p.totalDeductions),
    netPay: num(p.netPay),
    ssnitEmployer: num(p.ssnitEmployer),
    tier2Employer: num(p.tier2Employer),
    tier3Employer: num(p.tier3Employer),
    employerCost: num(p.totalEmployerCost),
  }));
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  const totals = {
    count: rows.length,
    basic: sum('basic'), allowances: sum('allowances'), overtime: sum('overtime'), bonus: sum('bonus'),
    otherEarnings: sum('otherEarnings'), gross: sum('gross'), paye: sum('paye'),
    ssnitEmployee: sum('ssnitEmployee'), tier3Employee: sum('tier3Employee'),
    otherDeductions: sum('otherDeductions'), totalDeductions: sum('totalDeductions'), netPay: sum('netPay'),
    ssnitEmployer: sum('ssnitEmployer'), tier2Employer: sum('tier2Employer'), tier3Employer: sum('tier3Employer'),
    employerCost: sum('employerCost'),
  };
  return { meta: await scopeMeta(organisationId, f), rows, totals };
}

// ─── 2. Statutory report (PAYE + SSNIT — GRA & SSNIT filings) ───────────────────

export async function getStatutoryReport(organisationId: string, f: ReportFilters) {
  const slips = await fetchPayslips(organisationId, f);
  const rows = slips.map((p) => {
    // All three are income tax remitted to GRA under PAYE; broken out for detail.
    const payeBase = num(p.payeAmount);
    const overtimeTax = num(p.overtimeTax);
    const bonusTax = num(p.bonusTax);
    return {
      employeeNumber: p.employee.employeeNumber,
      name: empName(p),
      tin: p.employee.tinNumber ?? '—',
      ssnitNumber: p.employee.ssnitNumber ?? '—',
      gross: num(p.grossPay),
      // GRA income tax (PAYE) — components + total
      payeBase,
      overtimeTax,
      bonusTax,
      totalTax: payeBase + overtimeTax + bonusTax,
      // SSNIT
      ssnitEmployee: num(p.ssnitEmployee),       // 5.5%
      ssnitEmployer: num(p.ssnitEmployer),       // 13%
      tier1: num(p.ssnitEmployee) + num(p.ssnitEmployer),
      tier2: num(p.tier2Employer),
      tier3: num(p.tier3Employee) + num(p.tier3Employer),
      totalSsnit: num(p.ssnitEmployee) + num(p.ssnitEmployer) + num(p.tier2Employer) + num(p.tier3Employee) + num(p.tier3Employer),
    };
  });
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  const totals = {
    count: rows.length, gross: sum('gross'),
    payeBase: sum('payeBase'), overtimeTax: sum('overtimeTax'), bonusTax: sum('bonusTax'), totalTax: sum('totalTax'),
    ssnitEmployee: sum('ssnitEmployee'), ssnitEmployer: sum('ssnitEmployer'),
    tier1: sum('tier1'), tier2: sum('tier2'), tier3: sum('tier3'), totalSsnit: sum('totalSsnit'),
  };
  return { meta: await scopeMeta(organisationId, f), rows, totals };
}

// ─── 3. Payroll GL / Journal summary (per run) ─────────────────────────────────

export async function getPayrollGlSummary(organisationId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, organisationId } });
  if (!run) throw new NotFoundError('Payroll run not found');

  const accIds = [run.wagesPayableAccountId, run.payePayableAccountId, run.ssnitPayableAccountId, run.pensionPayableAccountId];
  const accounts = await prisma.account.findMany({ where: { id: { in: accIds } }, select: { id: true, code: true, name: true } });
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} · ${a.name}` : id; };

  const gross = num(run.totalGross);
  const employerSsnit = num(run.totalSsnitEmployer) + num(run.totalTier2) + num(run.totalTier3Employer);

  // PAYE remitted to GRA = base PAYE + overtime tax + bonus tax (all income tax),
  // matching how the run actually posts. run.totalPaye stores base PAYE only.
  const taxAgg = await prisma.payslip.aggregate({
    where: { payrollRunId: runId, organisationId },
    _sum: { overtimeTax: true, bonusTax: true },
  });
  const totalGraTax = num(run.totalPaye) + num(taxAgg._sum.overtimeTax) + num(taxAgg._sum.bonusTax);

  // Debits = total cost to the company (gross + employer contributions).
  // Credits = net pay + statutory payables + other deductions.
  const lines = [
    { account: 'Salaries & Wages Expense', description: 'Gross pay', debit: gross, credit: 0 },
    { account: 'Employer SSNIT / Pension Expense', description: 'Employer contributions', debit: employerSsnit, credit: 0 },
    { account: accName(run.payePayableAccountId), description: 'PAYE — incl. overtime & bonus tax (payable to GRA)', debit: 0, credit: totalGraTax },
    { account: accName(run.ssnitPayableAccountId), description: 'SSNIT employee + employer (payable)', debit: 0, credit: num(run.totalSsnitEmployee) + num(run.totalSsnitEmployer) },
    { account: accName(run.pensionPayableAccountId), description: 'Tier 2 / Tier 3 pension (payable)', debit: 0, credit: num(run.totalTier2) + num(run.totalTier3Employee) + num(run.totalTier3Employer) },
    { account: 'Other deductions (loans etc.)', description: 'Loan & other deductions', debit: 0, credit: num(run.totalOtherDeductions) },
    { account: accName(run.wagesPayableAccountId), description: 'Net pay (payable to employees)', debit: 0, credit: num(run.totalNetPay) },
  ].filter((l) => l.debit !== 0 || l.credit !== 0);

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return {
    meta: { type: 'run' as const, runNumber: run.runNumber, description: run.description, paymentDate: run.paymentDate, status: run.status },
    lines, totals: { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 },
  };
}

// ─── 4. Bank disbursement schedule (per run) ───────────────────────────────────

export async function getBankDisbursement(organisationId: string, f: ReportFilters) {
  const slips = await fetchPayslips(organisationId, f);
  const rows = slips.map((p) => ({
    employeeNumber: p.employee.employeeNumber,
    name: empName(p),
    bankName: p.employee.bankName ?? '—',
    bankBranch: p.employee.bankBranch ?? '—',
    accountNumber: p.employee.bankAccountNumber ?? '—',
    netPay: num(p.netPay),
    hasBank: !!p.employee.bankAccountNumber,
  }));
  const totals = { count: rows.length, netPay: rows.reduce((s, r) => s + r.netPay, 0), missingBank: rows.filter((r) => !r.hasBank).length };
  return { meta: await scopeMeta(organisationId, f), rows, totals };
}

// ─── 5. Department / cost-centre cost analysis ─────────────────────────────────

export async function getDepartmentCostAnalysis(organisationId: string, f: ReportFilters) {
  const slips = await fetchPayslips(organisationId, f);
  const groups = new Map<string, { department: string; count: number; gross: number; deductions: number; netPay: number; employerCost: number; employees: Set<string> }>();
  for (const p of slips) {
    const key = p.employee.department?.id ?? 'none';
    const g = groups.get(key) ?? { department: p.employee.department?.name ?? 'Unassigned', count: 0, gross: 0, deductions: 0, netPay: 0, employerCost: 0, employees: new Set<string>() };
    g.gross += num(p.grossPay);
    g.deductions += num(p.totalDeductions);
    g.netPay += num(p.netPay);
    g.employerCost += num(p.totalEmployerCost);
    g.employees.add(p.employeeId);
    g.count += 1;
    groups.set(key, g);
  }
  // totalEmployerCost already = gross + employer contributions (the full cost to
  // company). So Total Cost IS that figure; employer contributions = it minus gross.
  const rows = [...groups.values()]
    .map((g) => ({
      department: g.department,
      headcount: g.employees.size,
      payslips: g.count,
      gross: g.gross,
      deductions: g.deductions,
      netPay: g.netPay,
      employerContrib: g.employerCost - g.gross,
      totalCost: g.employerCost,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
  const totals = {
    headcount: rows.reduce((s, r) => s + r.headcount, 0),
    gross: rows.reduce((s, r) => s + r.gross, 0),
    deductions: rows.reduce((s, r) => s + r.deductions, 0),
    netPay: rows.reduce((s, r) => s + r.netPay, 0),
    employerContrib: rows.reduce((s, r) => s + r.employerContrib, 0),
    totalCost: rows.reduce((s, r) => s + r.totalCost, 0),
  };
  return { meta: await scopeMeta(organisationId, f), rows, totals };
}

// ─── 6. Employee earnings (year-to-date, by employee) ──────────────────────────

export async function getEmployeeYtd(organisationId: string, f: ReportFilters) {
  const slips = await fetchPayslips(organisationId, { ...f, runId: undefined }); // year-scoped
  const byEmp = new Map<string, {
    employeeNumber: string; name: string; department: string;
    runs: number; gross: number; paye: number; ssnit: number; tier3: number; otherDeductions: number; netPay: number; employerCost: number;
  }>();
  for (const p of slips) {
    const g = byEmp.get(p.employeeId) ?? {
      employeeNumber: p.employee.employeeNumber, name: empName(p), department: p.employee.department?.name ?? '—',
      runs: 0, gross: 0, paye: 0, ssnit: 0, tier3: 0, otherDeductions: 0, netPay: 0, employerCost: 0,
    };
    g.runs += 1;
    g.gross += num(p.grossPay);
    g.paye += num(p.payeAmount) + num(p.overtimeTax) + num(p.bonusTax);
    g.ssnit += num(p.ssnitEmployee);
    g.tier3 += num(p.tier3Employee);
    g.otherDeductions += num(p.otherDeductions);
    g.netPay += num(p.netPay);
    g.employerCost += num(p.totalEmployerCost);
    byEmp.set(p.employeeId, g);
  }
  const rows = [...byEmp.values()].sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  const totals = {
    count: rows.length, gross: sum('gross'), paye: sum('paye'), ssnit: sum('ssnit'),
    tier3: sum('tier3'), otherDeductions: sum('otherDeductions'), netPay: sum('netPay'), employerCost: sum('employerCost'),
  };
  return { meta: { type: 'period' as const, year: f.year, month: null }, rows, totals };
}
