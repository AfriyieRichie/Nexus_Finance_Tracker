import { JournalType, EntryStatus, SalaryComponentType, PayrollRunStatus, PayslipStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors';
import { buildPagination } from '../../utils/response';
import { createJournalEntry, postJournalEntry } from '../journals/journal.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PayeBand {
  min: number;
  max: number | null;
  rate: number; // percent
}

export interface UpsertStatutoryConfigInput {
  taxYear: number;
  ssnitEmployeeRate?: number;
  ssnitEmployerRate?: number;
  tier2Rate?: number;
  payeBands?: PayeBand[];
  personalRelief?: number;
}

export interface CreateEmployeeInput {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  tinNumber?: string;
  ssnitNumber?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CASUAL';
  payFrequency?: 'MONTHLY' | 'FORTNIGHTLY' | 'WEEKLY';
  startDate: string;
  endDate?: string;
  jobTitle?: string;
  departmentId?: string;
  costCentreId?: string;
  basicSalary: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranch?: string;
  tier3EmployeeRate?: number;
  tier3EmployerRate?: number;
  salaryExpenseAccountId?: string;
  overtimeType?: 'NONE' | 'FIXED' | 'RATE_BASED';
  overtimeFixedAmount?: number;
  overtimeMultiplier?: number;
  isResident?: boolean;
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {
  isActive?: boolean;
}

export interface CreateSalaryComponentInput {
  code: string;
  name: string;
  type: SalaryComponentType;
  isTaxable?: boolean;
  glAccountId?: string;
  description?: string;
}

export interface AssignComponentInput {
  componentId: string;
  amount?: number;
  rate?: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface PayslipOverride {
  employeeId: string;
  overtimePay?: number;   // flat amount override — bypasses overtimeType
  overtimeHours?: number; // used when employee overtimeType === RATE_BASED
  bonuses?: number;
}

export interface CreatePayrollRunInput {
  periodId: string;
  paymentDate: string;
  description: string;
  isSupplementary?: boolean;
  parentRunId?: string;
  wagesPayableAccountId: string;
  payePayableAccountId: string;
  ssnitPayableAccountId: string;
  pensionPayableAccountId: string;
  overrides?: PayslipOverride[];
  notes?: string;
}

export interface ListPayrollParams {
  page?: number;
  pageSize?: number;
}

export interface CreateLoanInput {
  description: string;
  principalAmount: number;
  instalmentAmount: number;
  startDate: string;
  glAccountId?: string;
}

export interface UpdateLoanInput {
  status?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUSPENDED';
  instalmentAmount?: number;
  balance?: number;
}

// ─── Ghana 2024 Default PAYE Bands (monthly GHS) ─────────────────────────────

const DEFAULT_PAYE_BANDS: PayeBand[] = [
  { min: 0,     max: 490,   rate: 0    },
  { min: 490,   max: 600,   rate: 5    },
  { min: 600,   max: 730,   rate: 10   },
  { min: 730,   max: 3730,  rate: 17.5 },
  { min: 3730,  max: 20130, rate: 25   },
  { min: 20130, max: null,  rate: 35   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function calculatePaye(monthlyTaxable: number, bands: PayeBand[], personalRelief = 0): number {
  const taxable = Math.max(0, monthlyTaxable - personalRelief);
  let tax = 0;
  for (const band of bands) {
    if (taxable <= band.min) break;
    const upper = band.max === null ? taxable : Math.min(taxable, band.max);
    const slice = upper - band.min;
    tax += slice * (band.rate / 100);
  }
  return round4(Math.max(0, tax));
}

async function getOrDefaultStatutoryConfig(organisationId: string, taxYear: number) {
  const cfg = await prisma.payrollStatutoryConfig.findUnique({
    where: { organisationId_taxYear: { organisationId, taxYear } },
  });
  return {
    ssnitEmployeeRate: cfg ? Number(cfg.ssnitEmployeeRate) : 0.055,
    ssnitEmployerRate: cfg ? Number(cfg.ssnitEmployerRate) : 0.13,
    tier2Rate:         cfg ? Number(cfg.tier2Rate)         : 0.05,
    payeBands:         cfg ? (cfg.payeBands as unknown as PayeBand[]) : DEFAULT_PAYE_BANDS,
    personalRelief:    cfg ? Number(cfg.personalRelief)    : 0,
  };
}

async function nextRunNumber(organisationId: string): Promise<string> {
  const last = await prisma.payrollRun.findFirst({
    where: { organisationId },
    orderBy: { createdAt: 'desc' },
    select: { runNumber: true },
  });
  const seq = last?.runNumber ? parseInt(last.runNumber.replace(/\D/g, ''), 10) + 1 : 1;
  return `PR-${String(seq).padStart(5, '0')}`;
}

// ─── Statutory Config ─────────────────────────────────────────────────────────

export async function listStatutoryConfigs(organisationId: string) {
  return prisma.payrollStatutoryConfig.findMany({
    where: { organisationId },
    orderBy: { taxYear: 'desc' },
  });
}

export async function getStatutoryConfig(organisationId: string, taxYear: number) {
  const cfg = await prisma.payrollStatutoryConfig.findUnique({
    where: { organisationId_taxYear: { organisationId, taxYear } },
  });
  if (!cfg) throw new NotFoundError(`No statutory config for tax year ${taxYear}`);
  return cfg;
}

export async function upsertStatutoryConfig(organisationId: string, input: UpsertStatutoryConfigInput) {
  return prisma.payrollStatutoryConfig.upsert({
    where: { organisationId_taxYear: { organisationId, taxYear: input.taxYear } },
    update: {
      ...(input.ssnitEmployeeRate !== undefined && { ssnitEmployeeRate: input.ssnitEmployeeRate }),
      ...(input.ssnitEmployerRate !== undefined && { ssnitEmployerRate: input.ssnitEmployerRate }),
      ...(input.tier2Rate         !== undefined && { tier2Rate:         input.tier2Rate }),
      ...(input.payeBands         !== undefined && { payeBands:         input.payeBands as object }),
      ...(input.personalRelief    !== undefined && { personalRelief:    input.personalRelief }),
    },
    create: {
      organisationId,
      taxYear:           input.taxYear,
      ssnitEmployeeRate: input.ssnitEmployeeRate ?? 0.055,
      ssnitEmployerRate: input.ssnitEmployerRate ?? 0.13,
      tier2Rate:         input.tier2Rate         ?? 0.05,
      payeBands:         (input.payeBands ?? DEFAULT_PAYE_BANDS) as object,
      personalRelief:    input.personalRelief    ?? 0,
    },
  });
}

// ─── Employees ────────────────────────────────────────────────────────────────

export async function listEmployees(organisationId: string, isActive?: boolean) {
  return prisma.employee.findMany({
    where: {
      organisationId,
      ...(isActive !== undefined && { isActive }),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      department:           { select: { id: true, name: true } },
      costCentre:           { select: { id: true, name: true } },
      salaryExpenseAccount: { select: { id: true, code: true, name: true } },
      components: {
        where: { isActive: true },
        include: { component: { select: { id: true, code: true, name: true, type: true } } },
      },
    },
  });
}

export async function getEmployee(organisationId: string, id: string) {
  const emp = await prisma.employee.findFirst({
    where: { id, organisationId },
    include: {
      department:           { select: { id: true, name: true } },
      costCentre:           { select: { id: true, name: true } },
      salaryExpenseAccount: { select: { id: true, code: true, name: true } },
      components: {
        where: { isActive: true },
        orderBy: { effectiveFrom: 'desc' },
        include: { component: true },
      },
    },
  });
  if (!emp) throw new NotFoundError('Employee not found');
  return emp;
}

export async function createEmployee(organisationId: string, input: CreateEmployeeInput) {
  const exists = await prisma.employee.findUnique({
    where: { organisationId_employeeNumber: { organisationId, employeeNumber: input.employeeNumber } },
  });
  if (exists) throw new ConflictError(`Employee number ${input.employeeNumber} already exists`);

  return prisma.employee.create({
    data: {
      organisationId,
      employeeNumber:        input.employeeNumber,
      firstName:             input.firstName,
      lastName:              input.lastName,
      email:                 input.email,
      phone:                 input.phone,
      nationalId:            input.nationalId,
      tinNumber:             input.tinNumber,
      ssnitNumber:           input.ssnitNumber,
      employmentType:        input.employmentType ?? 'FULL_TIME',
      payFrequency:          input.payFrequency   ?? 'MONTHLY',
      startDate:             new Date(input.startDate),
      endDate:               input.endDate ? new Date(input.endDate) : undefined,
      jobTitle:              input.jobTitle,
      departmentId:          input.departmentId,
      costCentreId:          input.costCentreId,
      basicSalary:           input.basicSalary,
      bankName:              input.bankName,
      bankAccountNumber:     input.bankAccountNumber,
      bankBranch:            input.bankBranch,
      tier3EmployeeRate:     input.tier3EmployeeRate,
      tier3EmployerRate:     input.tier3EmployerRate,
      salaryExpenseAccountId: input.salaryExpenseAccountId,
      overtimeType:           input.overtimeType           ?? 'NONE',
      overtimeFixedAmount:    input.overtimeFixedAmount,
      overtimeMultiplier:     input.overtimeMultiplier,
      isResident:             input.isResident ?? true,
    },
    include: {
      department:           { select: { id: true, name: true } },
      costCentre:           { select: { id: true, name: true } },
      salaryExpenseAccount: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function updateEmployee(organisationId: string, id: string, input: UpdateEmployeeInput) {
  const emp = await prisma.employee.findFirst({ where: { id, organisationId } });
  if (!emp) throw new NotFoundError('Employee not found');

  return prisma.employee.update({
    where: { id },
    data: {
      ...(input.firstName             !== undefined && { firstName:             input.firstName }),
      ...(input.lastName              !== undefined && { lastName:              input.lastName }),
      ...(input.email                 !== undefined && { email:                 input.email }),
      ...(input.phone                 !== undefined && { phone:                 input.phone }),
      ...(input.nationalId            !== undefined && { nationalId:            input.nationalId }),
      ...(input.tinNumber             !== undefined && { tinNumber:             input.tinNumber }),
      ...(input.ssnitNumber           !== undefined && { ssnitNumber:           input.ssnitNumber }),
      ...(input.employmentType        !== undefined && { employmentType:        input.employmentType }),
      ...(input.payFrequency          !== undefined && { payFrequency:          input.payFrequency }),
      ...(input.startDate             !== undefined && { startDate:             new Date(input.startDate) }),
      ...(input.endDate               !== undefined && { endDate:               input.endDate ? new Date(input.endDate) : null }),
      ...(input.jobTitle              !== undefined && { jobTitle:              input.jobTitle }),
      ...(input.departmentId          !== undefined && { departmentId:          input.departmentId }),
      ...(input.costCentreId          !== undefined && { costCentreId:          input.costCentreId }),
      ...(input.basicSalary           !== undefined && { basicSalary:           input.basicSalary }),
      ...(input.bankName              !== undefined && { bankName:              input.bankName }),
      ...(input.bankAccountNumber     !== undefined && { bankAccountNumber:     input.bankAccountNumber }),
      ...(input.bankBranch            !== undefined && { bankBranch:            input.bankBranch }),
      ...(input.tier3EmployeeRate     !== undefined && { tier3EmployeeRate:     input.tier3EmployeeRate }),
      ...(input.tier3EmployerRate     !== undefined && { tier3EmployerRate:     input.tier3EmployerRate }),
      ...(input.salaryExpenseAccountId !== undefined && { salaryExpenseAccountId: input.salaryExpenseAccountId }),
      ...(input.overtimeType          !== undefined && { overtimeType:          input.overtimeType }),
      ...(input.overtimeFixedAmount   !== undefined && { overtimeFixedAmount:   input.overtimeFixedAmount }),
      ...(input.overtimeMultiplier    !== undefined && { overtimeMultiplier:    input.overtimeMultiplier }),
      ...(input.isResident            !== undefined && { isResident:            input.isResident }),
      ...(input.isActive              !== undefined && { isActive:              input.isActive }),
    },
    include: {
      department:           { select: { id: true, name: true } },
      costCentre:           { select: { id: true, name: true } },
      salaryExpenseAccount: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function assignComponent(organisationId: string, employeeId: string, input: AssignComponentInput) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organisationId } });
  if (!emp) throw new NotFoundError('Employee not found');

  const component = await prisma.salaryComponent.findFirst({
    where: { id: input.componentId, organisationId },
  });
  if (!component) throw new NotFoundError('Salary component not found');

  return prisma.employeeComponent.create({
    data: {
      employeeId,
      componentId:   input.componentId,
      amount:        input.amount,
      rate:          input.rate,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveTo:   input.effectiveTo ? new Date(input.effectiveTo) : undefined,
    },
    include: { component: true },
  });
}

export async function removeComponent(organisationId: string, employeeId: string, assignmentId: string) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organisationId } });
  if (!emp) throw new NotFoundError('Employee not found');

  await prisma.employeeComponent.update({
    where: { id: assignmentId },
    data:  { isActive: false, effectiveTo: new Date() },
  });
}

// ─── Employee Loans ───────────────────────────────────────────────────────────

export async function listLoans(organisationId: string, employeeId: string) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organisationId } });
  if (!emp) throw new NotFoundError('Employee not found');

  return prisma.employeeLoan.findMany({
    where:   { employeeId, organisationId },
    orderBy: { createdAt: 'desc' },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

export async function createLoan(
  organisationId: string,
  employeeId: string,
  input: CreateLoanInput,
  userId: string,
) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organisationId } });
  if (!emp) throw new NotFoundError('Employee not found');

  if (input.principalAmount <= 0)  throw new ValidationError('Principal amount must be positive');
  if (input.instalmentAmount <= 0) throw new ValidationError('Instalment amount must be positive');
  if (input.instalmentAmount > input.principalAmount) throw new ValidationError('Instalment cannot exceed principal');

  return prisma.employeeLoan.create({
    data: {
      organisationId,
      employeeId,
      description:      input.description,
      principalAmount:  input.principalAmount,
      balance:          input.principalAmount,
      instalmentAmount: input.instalmentAmount,
      startDate:        new Date(input.startDate),
      glAccountId:      input.glAccountId,
      createdBy:        userId,
      status:           'ACTIVE',
    },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

export async function updateLoan(organisationId: string, id: string, input: UpdateLoanInput) {
  const loan = await prisma.employeeLoan.findFirst({ where: { id, organisationId } });
  if (!loan) throw new NotFoundError('Loan not found');

  return prisma.employeeLoan.update({
    where: { id },
    data: {
      ...(input.status            !== undefined && { status:            input.status }),
      ...(input.instalmentAmount  !== undefined && { instalmentAmount:  input.instalmentAmount }),
      ...(input.balance           !== undefined && { balance:           input.balance }),
    },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

// ─── Salary Components ────────────────────────────────────────────────────────

export async function listSalaryComponents(organisationId: string, isActive?: boolean) {
  return prisma.salaryComponent.findMany({
    where: {
      organisationId,
      ...(isActive !== undefined && { isActive }),
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

export async function createSalaryComponent(organisationId: string, input: CreateSalaryComponentInput) {
  const exists = await prisma.salaryComponent.findUnique({
    where: { organisationId_code: { organisationId, code: input.code } },
  });
  if (exists) throw new ConflictError(`Salary component code ${input.code} already exists`);

  return prisma.salaryComponent.create({
    data: {
      organisationId,
      code:        input.code,
      name:        input.name,
      type:        input.type,
      isTaxable:   input.isTaxable ?? true,
      glAccountId: input.glAccountId,
      description: input.description,
    },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

export async function updateSalaryComponent(
  organisationId: string,
  id: string,
  input: Partial<CreateSalaryComponentInput> & { isActive?: boolean },
) {
  const comp = await prisma.salaryComponent.findFirst({ where: { id, organisationId } });
  if (!comp) throw new NotFoundError('Salary component not found');

  return prisma.salaryComponent.update({
    where: { id },
    data: {
      ...(input.name        !== undefined && { name:        input.name }),
      ...(input.type        !== undefined && { type:        input.type }),
      ...(input.isTaxable   !== undefined && { isTaxable:   input.isTaxable }),
      ...(input.glAccountId !== undefined && { glAccountId: input.glAccountId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive    !== undefined && { isActive:    input.isActive }),
    },
    include: { glAccount: { select: { id: true, code: true, name: true } } },
  });
}

// ─── Payroll Run Engine ───────────────────────────────────────────────────────

export async function listPayrollRuns(organisationId: string, params: ListPayrollParams = {}) {
  const page     = Math.max(1, params.page     ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = { organisationId };
  const [total, runs] = await Promise.all([
    prisma.payrollRun.count({ where }),
    prisma.payrollRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: {
        period:  { select: { name: true, fiscalYear: true } },
        payslips: { select: { id: true, status: true, netPay: true } },
        _count:  { select: { payslips: true } },
      },
    }),
  ]);
  return { runs, pagination: buildPagination(page, pageSize, total) };
}

export async function getPayrollRun(organisationId: string, id: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id, organisationId },
    include: {
      period:  { select: { name: true, fiscalYear: true } },
      payslips: {
        include: {
          employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, bankName: true, bankAccountNumber: true, departmentId: true, costCentreId: true } },
          lines:    { orderBy: { amount: 'desc' } },
        },
      },
    },
  });
  if (!run) throw new NotFoundError('Payroll run not found');
  return run;
}

export async function createPayrollRun(
  organisationId: string,
  userId: string,
  input: CreatePayrollRunInput,
) {
  const org = await prisma.organisation.findUnique({
    where:  { id: organisationId },
    select: { baseCurrency: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');

  const period = await prisma.accountingPeriod.findFirst({
    where: { id: input.periodId, organisationId },
  });
  if (!period) throw new NotFoundError('Accounting period not found');

  const paymentDate = new Date(input.paymentDate);
  // For @db.Date comparisons use lt(nextDay) rather than lte(paymentDate) to
  // avoid timezone cast issues when effectiveFrom equals the payment date
  const paymentDateNextDay = new Date(paymentDate);
  paymentDateNextDay.setDate(paymentDateNextDay.getDate() + 1);
  const taxYear     = paymentDate.getFullYear();
  const statutory   = await getOrDefaultStatutoryConfig(organisationId, taxYear);
  const bands       = statutory.payeBands;

  // All active employees
  const employees = await prisma.employee.findMany({
    where:   { organisationId, isActive: true },
    select: {
      id: true, basicSalary: true, departmentId: true, costCentreId: true,
      salaryExpenseAccountId: true, tier3EmployeeRate: true, tier3EmployerRate: true,
      isResident: true, overtimeType: true, overtimeFixedAmount: true, overtimeMultiplier: true,
      components: {
        where:   { isActive: true, effectiveFrom: { lt: paymentDateNextDay } },
        orderBy: { effectiveFrom: 'desc' },
        include: { component: { select: { id: true, code: true, name: true, type: true, isTaxable: true } } },
      },
    },
  });
  if (employees.length === 0) throw new ValidationError('No active employees found');

  // YTD from previous PAID payslips in the same fiscal year
  const ytdRaw = await prisma.payslip.groupBy({
    by:      ['employeeId'],
    where: {
      organisationId,
      status: PayslipStatus.PAID,
      payrollRun: {
        paymentDate: {
          gte: new Date(`${taxYear}-01-01`),
          lt:  paymentDate,
        },
      },
    },
    _sum: { grossPay: true, payeAmount: true, ssnitEmployee: true, netPay: true },
  });
  const ytdMap = new Map(ytdRaw.map((r) => [r.employeeId, r._sum]));

  const overrideMap = new Map(
    (input.overrides ?? []).map((o) => [o.employeeId, o]),
  );

  type PayslipCreate = Parameters<typeof prisma.payslip.create>[0]['data'];
  const payslipDataList: PayslipCreate[] = [];

  let totalGross           = 0;
  let totalPaye            = 0;
  let totalSsnitEmployee   = 0;
  let totalSsnitEmployer   = 0;
  let totalTier2           = 0;
  let totalTier3Employee   = 0;
  let totalTier3Employer   = 0;
  let totalOtherDeductions = 0;
  let totalNetPay          = 0;
  let totalEmployerCost    = 0;

  for (const emp of employees) {
    const override = overrideMap.get(emp.id);
    const basic    = round4(Number(emp.basicSalary));
    let   bonuses  = 0;

    // Overtime: manual flat override > employee config
    let overtime = 0;
    if (override?.overtimePay !== undefined) {
      overtime = round4(override.overtimePay);
    } else if (emp.overtimeType === 'FIXED' && emp.overtimeFixedAmount) {
      overtime = round4(Number(emp.overtimeFixedAmount));
    } else if (emp.overtimeType === 'RATE_BASED' && override?.overtimeHours) {
      // Ghana standard: 22 working days × 8 hrs = 176 hrs/month
      const hourlyRate   = round4(basic / 176);
      const multiplier   = emp.overtimeMultiplier ? Number(emp.overtimeMultiplier) : 1.5;
      overtime           = round4(override.overtimeHours * hourlyRate * multiplier);
    }

    let allowances     = 0;
    let otherEarnings  = 0;
    let otherDeductions = 0;

    const lines: { description: string; type: SalaryComponentType; amount: number; isEmployer: boolean; componentId: string | undefined; loanId?: string }[] = [];

    lines.push({ description: 'Basic Salary', type: SalaryComponentType.BASIC_SALARY, amount: basic, isEmployer: false, componentId: undefined });
    if (overtime > 0) lines.push({ description: 'Overtime', type: SalaryComponentType.OVERTIME, amount: overtime, isEmployer: false, componentId: undefined });

    for (const ec of emp.components) {
      const compType   = ec.component.type;
      const compAmount = ec.amount ? round4(Number(ec.amount)) : ec.rate ? round4(basic * Number(ec.rate)) : 0;
      if (compAmount === 0) continue;

      if (compType === SalaryComponentType.BONUS) {
        bonuses = round4(bonuses + compAmount);
        lines.push({ description: ec.component.name, type: compType, amount: compAmount, isEmployer: false, componentId: ec.component.id });
      } else if (compType === SalaryComponentType.ALLOWANCE) {
        allowances = round4(allowances + compAmount);
        lines.push({ description: ec.component.name, type: compType, amount: compAmount, isEmployer: false, componentId: ec.component.id });
      } else if (compType === SalaryComponentType.OTHER_EARNING || compType === SalaryComponentType.COMMISSION) {
        otherEarnings = round4(otherEarnings + compAmount);
        lines.push({ description: ec.component.name, type: compType, amount: compAmount, isEmployer: false, componentId: ec.component.id });
      } else if (compType === SalaryComponentType.EMPLOYEE_DEDUCTION) {
        otherDeductions = round4(otherDeductions + compAmount);
        lines.push({ description: ec.component.name, type: compType, amount: compAmount, isEmployer: false, componentId: ec.component.id });
      }
    }

    // Run-level bonus override (one-off performance bonus — no component ID)
    const overrideBonuses = round4(override?.bonuses ?? 0);
    if (overrideBonuses > 0) {
      bonuses = round4(bonuses + overrideBonuses);
      lines.push({ description: 'Bonus', type: SalaryComponentType.BONUS, amount: overrideBonuses, isEmployer: false, componentId: undefined });
    }

    // Active loan repayments
    const activeLoans = await prisma.employeeLoan.findMany({
      where: { employeeId: emp.id, status: 'ACTIVE', startDate: { lte: paymentDate } },
    });
    for (const loan of activeLoans) {
      const instalment = round4(Math.min(Number(loan.instalmentAmount), Number(loan.balance)));
      if (instalment > 0) {
        otherDeductions = round4(otherDeductions + instalment);
        lines.push({ description: `Loan Repayment: ${loan.description}`, type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: instalment, isEmployer: false, componentId: undefined, loanId: loan.id });
      }
    }

    const grossPay = round4(basic + overtime + bonuses + allowances + otherEarnings);

    // SSNIT & Tier 2 are on basic salary only (GRA: 5.5% / 13% / 5% of basic)
    const ssnitEmployee = round4(basic * statutory.ssnitEmployeeRate);
    const ssnitEmployer = round4(basic * (statutory.ssnitEmployerRate - statutory.tier2Rate));
    const tier2Employer = round4(basic * statutory.tier2Rate);

    // Tier 3 / Provident Fund — on basic salary; PAYE deductible is combined
    // employee + employer contribution capped at 16.5% of basic (GRA Act 896)
    const t3EmpRate     = emp.tier3EmployeeRate ? Number(emp.tier3EmployeeRate) : 0;
    const t3ErRate      = emp.tier3EmployerRate ? Number(emp.tier3EmployerRate) : 0;
    const tier3Employee = round4(basic * t3EmpRate);
    const tier3Employer = round4(basic * t3ErRate);
    const tier3Deductible = round4(Math.min(tier3Employee + tier3Employer, basic * 0.165));

    const isResident    = emp.isResident !== false;
    const isJuniorStaff = (basic * 12) <= 18_000;

    // Overtime tax — GRA Act 896
    let overtimeTax    = 0;
    let overtimeInPaye = 0;
    if (overtime > 0) {
      if (!isResident) {
        overtimeTax = round4(overtime * 0.20);
      } else if (isJuniorStaff) {
        const halfBasic = round4(basic * 0.5);
        const at5pct    = round4(Math.min(overtime, halfBasic));
        const at10pct   = round4(Math.max(0, overtime - halfBasic));
        overtimeTax     = round4(at5pct * 0.05 + at10pct * 0.10);
      } else {
        overtimeInPaye = overtime;
      }
    }

    // Bonus tax — GRA: 5% on first 15% of annual basic; excess added to PAYE income
    let bonusTax    = 0;
    let bonusInPaye = 0;
    if (bonuses > 0) {
      if (!isResident) {
        bonusTax = round4(bonuses * 0.20);
      } else {
        const monthlyThreshold = round4(basic * 0.15); // 15% of monthly basic salary
        const at5pct           = round4(Math.min(bonuses, monthlyThreshold));
        const excess           = round4(Math.max(0, bonuses - monthlyThreshold));
        bonusTax              = round4(at5pct * 0.05);
        bonusInPaye           = excess;
      }
    }

    // PAYE on taxable employment income
    // Qualifying bonus (≤15% of annual basic) is excluded — it has its own flat tax
    // Excess bonus and non-qualifying overtime are included in the PAYE base
    const payeGross     = round4(basic + allowances + otherEarnings + bonusInPaye + overtimeInPaye);
    const taxableIncome = round4(Math.max(0, payeGross - ssnitEmployee - tier3Deductible));
    const payeAmount    = calculatePaye(taxableIncome, bands, statutory.personalRelief);

    const totalEmployeeDeductions = round4(ssnitEmployee + tier3Employee + payeAmount + overtimeTax + bonusTax + otherDeductions);
    const netPay                  = round4(grossPay - totalEmployeeDeductions);
    const empEmployerCost         = round4(grossPay + ssnitEmployer + tier2Employer + tier3Employer);

    // Statutory deduction lines
    lines.push({ description: 'PAYE',          type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: payeAmount,    isEmployer: false, componentId: undefined });
    if (overtimeTax > 0) lines.push({ description: 'Overtime Tax', type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: overtimeTax, isEmployer: false, componentId: undefined });
    if (bonusTax    > 0) lines.push({ description: 'Bonus Tax',    type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: bonusTax,    isEmployer: false, componentId: undefined });
    lines.push({ description: 'SSNIT (Emp)',   type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: ssnitEmployee, isEmployer: false, componentId: undefined });
    if (tier3Employee > 0) lines.push({ description: 'Tier 3 (Emp)', type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: tier3Employee, isEmployer: false, componentId: undefined });
    lines.push({ description: 'SSNIT (Er)',    type: SalaryComponentType.EMPLOYER_CONTRIBUTION, amount: ssnitEmployer, isEmployer: true, componentId: undefined });
    lines.push({ description: 'Tier 2 (Er)',   type: SalaryComponentType.EMPLOYER_CONTRIBUTION, amount: tier2Employer, isEmployer: true, componentId: undefined });
    if (tier3Employer > 0) lines.push({ description: 'Tier 3 (Er)', type: SalaryComponentType.EMPLOYER_CONTRIBUTION, amount: tier3Employer, isEmployer: true, componentId: undefined });

    // YTD
    const ytd        = ytdMap.get(emp.id);
    const ytdGross   = round4(Number(ytd?.grossPay    ?? 0) + grossPay);
    const ytdPaye    = round4(Number(ytd?.payeAmount  ?? 0) + payeAmount);
    const ytdSsnit   = round4(Number(ytd?.ssnitEmployee ?? 0) + ssnitEmployee);
    const ytdNetPay  = round4(Number(ytd?.netPay      ?? 0) + netPay);

    payslipDataList.push({
      payrollRunId:     '',        // set after run created
      employeeId:       emp.id,
      organisationId,
      status:           PayslipStatus.DRAFT,
      basicSalary:      basic,
      overtimePay:      overtime,
      bonuses,
      allowances,
      otherEarnings,
      grossPay,
      payeAmount,
      overtimeTax,
      bonusTax,
      ssnitEmployee,
      tier3Employee,
      otherDeductions,
      totalDeductions:  totalEmployeeDeductions,
      netPay,
      ssnitEmployer,
      tier2Employer,
      tier3Employer,
      totalEmployerCost: empEmployerCost,
      ytdGross,
      ytdPaye,
      ytdSsnit,
      ytdNetPay,
      departmentId:     emp.departmentId,
      costCentreId:     emp.costCentreId,
      lines:            { create: lines.map((l) => ({ description: l.description, type: l.type, amount: l.amount, isEmployer: l.isEmployer, componentId: l.componentId, loanId: l.loanId })) },
    } as PayslipCreate);

    totalGross           = round4(totalGross           + grossPay);
    totalPaye            = round4(totalPaye            + payeAmount);
    totalSsnitEmployee   = round4(totalSsnitEmployee   + ssnitEmployee);
    totalSsnitEmployer   = round4(totalSsnitEmployer   + ssnitEmployer);
    totalTier2           = round4(totalTier2           + tier2Employer);
    totalTier3Employee   = round4(totalTier3Employee   + tier3Employee);
    totalTier3Employer   = round4(totalTier3Employer   + tier3Employer);
    totalOtherDeductions = round4(totalOtherDeductions + otherDeductions);
    totalNetPay          = round4(totalNetPay          + netPay);
    totalEmployerCost    = round4(totalEmployerCost    + empEmployerCost);
  }

  const runNumber = await nextRunNumber(organisationId);

  // Create run + payslips in a transaction
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.payrollRun.create({
      data: {
        organisationId,
        runNumber,
        periodId:               input.periodId,
        paymentDate,
        description:            input.description,
        isSupplementary:        input.isSupplementary ?? false,
        parentRunId:            input.parentRunId,
        wagesPayableAccountId:  input.wagesPayableAccountId,
        payePayableAccountId:   input.payePayableAccountId,
        ssnitPayableAccountId:  input.ssnitPayableAccountId,
        pensionPayableAccountId: input.pensionPayableAccountId,
        totalGross,
        totalPaye,
        totalSsnitEmployee,
        totalSsnitEmployer,
        totalTier2,
        totalTier3Employee,
        totalTier3Employer,
        totalOtherDeductions,
        totalNetPay,
        totalEmployerCost,
        createdBy: userId,
        notes:     input.notes,
      },
    });

    // Attach payrollRunId to each payslip and create them
    for (const pd of payslipDataList) {
      (pd as Record<string, unknown>).payrollRunId = created.id;
      await tx.payslip.create({ data: pd });
    }

    return tx.payrollRun.findUnique({
      where:   { id: created.id },
      include: { payslips: { include: { employee: true, lines: true } }, period: true },
    });
  });

  return run!;
}

export async function deletePayrollRun(organisationId: string, id: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run) throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.DRAFT) throw new ValidationError('Only DRAFT runs can be deleted');

  // Cascade: lines → payslips → run
  const payslipIds = await prisma.payslip.findMany({ where: { payrollRunId: id }, select: { id: true } });
  await prisma.payslipLine.deleteMany({ where: { payslipId: { in: payslipIds.map((p) => p.id) } } });
  await prisma.payslip.deleteMany({ where: { payrollRunId: id } });
  await prisma.payrollRun.delete({ where: { id } });
}

// ─── Three-Person Workflow ────────────────────────────────────────────────────

export async function submitPayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run)                                  throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.DRAFT) throw new ValidationError('Only DRAFT runs can be submitted');
  // No four-eyes check between creator and submitter — the payroll preparer creates and submits.
  // Four-eyes applies at approval and payment stages below.

  return prisma.payrollRun.update({
    where: { id },
    data:  { status: PayrollRunStatus.SUBMITTED, submittedBy: userId, submittedAt: new Date() },
  });
}

export async function approvePayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run)                                       throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.SUBMITTED)  throw new ValidationError('Only SUBMITTED runs can be approved');
  if ([run.createdBy, run.submittedBy].includes(userId)) throw new ForbiddenError('The approver must differ from the creator and submitter');

  return prisma.payrollRun.update({
    where: { id },
    data:  { status: PayrollRunStatus.APPROVED, approvedBy: userId, approvedAt: new Date() },
  });
}

export async function payPayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({
    where:   { id, organisationId },
    include: { payslips: { include: { employee: { select: { departmentId: true, costCentreId: true, salaryExpenseAccountId: true } } } } },
  });
  if (!run)                                      throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.APPROVED)  throw new ValidationError('Only APPROVED runs can be marked as paid');
  if ([run.createdBy, run.submittedBy, run.approvedBy].includes(userId)) {
    throw new ForbiddenError('The payer must differ from the creator, submitter, and approver');
  }

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  const currency = org?.baseCurrency ?? 'GHS';

  // Fetch loan repayment lines for this run (needed before journal is built)
  const loanRepaymentLines = await prisma.payslipLine.findMany({
    where:   { payslip: { payrollRunId: id }, loanId: { not: null } },
    select:  { loanId: true, amount: true },
  });
  const loanTotals = new Map<string, number>();
  for (const line of loanRepaymentLines) {
    if (line.loanId) loanTotals.set(line.loanId, (loanTotals.get(line.loanId) ?? 0) + Number(line.amount));
  }
  // Group loan repayments by GL account
  const loanGlGroups = new Map<string, number>();
  for (const [loanId, repaid] of loanTotals.entries()) {
    const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId }, select: { glAccountId: true } });
    if (loan?.glAccountId) {
      loanGlGroups.set(loan.glAccountId, round4((loanGlGroups.get(loan.glAccountId) ?? 0) + repaid));
    }
  }

  // Aggregate overtime tax + bonus tax from payslips (all remitted to GRA alongside PAYE)
  const payslipTaxes = await prisma.payslip.aggregate({
    where: { payrollRunId: id },
    _sum:  { overtimeTax: true, bonusTax: true },
  });
  const totalOvertimeTax = round4(Number(payslipTaxes._sum.overtimeTax ?? 0));
  const totalBonusTax    = round4(Number(payslipTaxes._sum.bonusTax    ?? 0));

  // Build GL posting lines:
  // DR Salary Expense (per dept/CC): total employer cost
  // CR PAYE Payable (PAYE + overtime tax + bonus tax — all remitted to GRA)
  // CR SSNIT Payable (employee + employer)
  // CR Pension Payable (Tier2 + Tier3)
  // CR Employee Loans Receivable (loan repayments, by GL account)
  // CR Wages Payable (net pay)

  type JLine = { accountId: string; description: string; debitAmount: number; creditAmount: number; currency: string; exchangeRate: number };
  const lines: JLine[] = [];

  // Group debits by dept/CC → salaryExpenseAccount
  const debitGroups = new Map<string, number>();
  for (const slip of run.payslips) {
    const acctId = slip.employee.salaryExpenseAccountId ?? run.wagesPayableAccountId;
    const cost   = round4(Number(slip.totalEmployerCost));
    debitGroups.set(acctId, round4((debitGroups.get(acctId) ?? 0) + cost));
  }
  for (const [acctId, amount] of debitGroups.entries()) {
    lines.push({ accountId: acctId, description: 'Salary expense', debitAmount: amount, creditAmount: 0, currency, exchangeRate: 1 });
  }

  // CR PAYE payable (PAYE + overtime tax + bonus tax — all remitted to GRA)
  const totalGraTax = round4(Number(run.totalPaye) + totalOvertimeTax + totalBonusTax);
  if (totalGraTax > 0) {
    lines.push({ accountId: run.payePayableAccountId, description: 'PAYE payable', debitAmount: 0, creditAmount: totalGraTax, currency, exchangeRate: 1 });
  }
  // CR SSNIT payable (employee + employer)
  const totalSsnit = round4(Number(run.totalSsnitEmployee) + Number(run.totalSsnitEmployer));
  if (totalSsnit > 0) {
    lines.push({ accountId: run.ssnitPayableAccountId,   description: 'SSNIT payable',   debitAmount: 0, creditAmount: totalSsnit,   currency, exchangeRate: 1 });
  }
  // CR Pension payable (Tier 2 + Tier 3 employee + Tier 3 employer)
  const totalPension = round4(Number(run.totalTier2) + Number(run.totalTier3Employee) + Number(run.totalTier3Employer));
  if (totalPension > 0) {
    lines.push({ accountId: run.pensionPayableAccountId, description: 'Pension payable', debitAmount: 0, creditAmount: totalPension, currency, exchangeRate: 1 });
  }
  // CR Employee Loans Receivable (one line per GL account)
  for (const [glAccountId, amount] of loanGlGroups.entries()) {
    lines.push({ accountId: glAccountId, description: 'Loan repayment recovery', debitAmount: 0, creditAmount: amount, currency, exchangeRate: 1 });
  }
  // CR Wages payable (net pay)
  lines.push({ accountId: run.wagesPayableAccountId, description: 'Net wages payable', debitAmount: 0, creditAmount: Number(run.totalNetPay), currency, exchangeRate: 1 });

  // Create + auto-approve + post journal entry
  const je = await createJournalEntry(
    organisationId,
    {
      type:        JournalType.PAYROLL,
      description: run.description,
      entryDate:   run.paymentDate.toISOString().split('T')[0],
      periodId:    run.periodId,
      currency,
      exchangeRate: 1,
      lines,
    },
    userId,
  );

  await prisma.journalEntry.update({
    where: { id: je.id },
    data:  { status: EntryStatus.APPROVED, approvedBy: userId, approvedAt: new Date() },
  });
  await postJournalEntry(organisationId, je.id, userId);

  // Mark payslips as PAID and run as PAID/LOCKED
  const [updatedRun] = await prisma.$transaction([
    prisma.payrollRun.update({
      where: { id },
      data:  { status: PayrollRunStatus.PAID, paidBy: userId, paidAt: new Date(), journalEntryId: je.id },
    }),
    prisma.payslip.updateMany({
      where: { payrollRunId: id },
      data:  { status: PayslipStatus.PAID },
    }),
  ]);

  // Reduce loan balances using the totals already computed above
  for (const [loanId, repaid] of loanTotals.entries()) {
    const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId } });
    if (!loan) continue;
    const newBalance = round4(Math.max(0, Number(loan.balance) - repaid));
    await prisma.employeeLoan.update({
      where: { id: loanId },
      data:  { balance: newBalance, status: newBalance === 0 ? 'COMPLETED' : 'ACTIVE' },
    });
  }

  return updatedRun;
}

// ─── Lock Run ─────────────────────────────────────────────────────────────────

export async function lockPayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run) throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.PAID) throw new ValidationError('Only PAID runs can be locked');

  return prisma.payrollRun.update({
    where: { id },
    data:  { status: PayrollRunStatus.LOCKED, lockedBy: userId, lockedAt: new Date() },
  });
}

// ─── Payment File ─────────────────────────────────────────────────────────────

export async function generatePaymentFile(organisationId: string, id: string): Promise<string> {
  const run = await prisma.payrollRun.findFirst({
    where:   { id, organisationId },
    include: {
      payslips: {
        include: {
          employee: { select: { employeeNumber: true, firstName: true, lastName: true, bankName: true, bankAccountNumber: true, bankBranch: true } },
        },
      },
    },
  });
  if (!run) throw new NotFoundError('Payroll run not found');
  if (run.status === PayrollRunStatus.DRAFT) throw new ValidationError('Payment file can only be generated for submitted/approved/paid runs');
  if (run.status === PayrollRunStatus.LOCKED) throw new ForbiddenError('Payment file cannot be regenerated after the run is locked');

  const rows = [
    'Employee Number,Full Name,Bank,Branch,Account Number,Net Pay',
    ...run.payslips.map((s) =>
      [
        s.employee.employeeNumber,
        `${s.employee.firstName} ${s.employee.lastName}`,
        s.employee.bankName          ?? '',
        s.employee.bankBranch        ?? '',
        s.employee.bankAccountNumber ?? '',
        Number(s.netPay).toFixed(2),
      ].join(','),
    ),
  ];
  return rows.join('\n');
}

// ─── Legacy: Journal-based payroll entries ────────────────────────────────────

export interface PayrollInput {
  periodId: string;
  payrollDate: string;
  description: string;
  grossSalaries: number;
  payeTax: number;
  pensionEmployee: number;
  pensionEmployer: number;
  otherDeductions: number;
  netPay: number;
  wagesAccountId: string;
  taxPayableAccountId: string;
  pensionPayableAccountId: string;
  bankAccountId: string;
  otherPayablesAccountId?: string;
}

export async function processPayroll(
  organisationId: string,
  userId: string,
  input: PayrollInput,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payrollDate)) {
    throw new ValidationError('payrollDate must be in YYYY-MM-DD format');
  }

  const drTotal = round4(input.grossSalaries + input.pensionEmployer);
  const crTotal = round4(input.payeTax + input.pensionEmployee + input.pensionEmployer + input.otherDeductions + input.netPay);
  if (drTotal !== crTotal) throw new ValidationError(`Payroll entry is unbalanced: debits (${drTotal}) ≠ credits (${crTotal})`);
  if (input.otherDeductions > 0 && !input.otherPayablesAccountId) throw new ValidationError('otherPayablesAccountId required when otherDeductions > 0');

  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { baseCurrency: true } });
  if (!org) throw new ValidationError('Organisation not found');
  const currency = org.baseCurrency;

  const lines = [
    { accountId: input.wagesAccountId,           description: 'Gross wages & employer pension', debitAmount: round4(input.grossSalaries + input.pensionEmployer), creditAmount: 0,                currency, exchangeRate: 1 },
    { accountId: input.taxPayableAccountId,      description: 'PAYE tax payable',               debitAmount: 0, creditAmount: input.payeTax,                                                   currency, exchangeRate: 1 },
    { accountId: input.pensionPayableAccountId,  description: 'Pension payable',                 debitAmount: 0, creditAmount: round4(input.pensionEmployee + input.pensionEmployer),            currency, exchangeRate: 1 },
    { accountId: input.bankAccountId,            description: 'Net pay disbursed',               debitAmount: 0, creditAmount: input.netPay,                                                    currency, exchangeRate: 1 },
    ...(input.otherDeductions > 0 && input.otherPayablesAccountId
      ? [{ accountId: input.otherPayablesAccountId, description: 'Other deductions payable', debitAmount: 0, creditAmount: input.otherDeductions, currency, exchangeRate: 1 }]
      : []),
  ];

  const je = await createJournalEntry(organisationId, { type: JournalType.PAYROLL, description: input.description, entryDate: input.payrollDate, periodId: input.periodId, currency, exchangeRate: 1, lines }, userId);
  await prisma.journalEntry.update({ where: { id: je.id }, data: { status: EntryStatus.APPROVED, approvedBy: userId, approvedAt: new Date() } });
  return postJournalEntry(organisationId, je.id, userId);
}

export async function listPayrollEntries(organisationId: string, params: ListPayrollParams) {
  const page     = Math.max(1, params.page     ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  const where    = { organisationId, type: JournalType.PAYROLL };

  const [total, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { journalNumber: 'desc' }],
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: {
        lines:   { orderBy: { lineNumber: 'asc' }, include: { account: { select: { code: true, name: true, class: true, type: true } } } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        poster:  { select: { id: true, firstName: true, lastName: true } },
        period:  { select: { name: true, fiscalYear: true, periodNumber: true } },
        _count:  { select: { lines: true } },
      },
    }),
  ]);
  return { entries, pagination: buildPagination(page, pageSize, total) };
}
