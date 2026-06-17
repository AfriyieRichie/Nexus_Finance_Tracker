import { randomUUID } from 'node:crypto';
import { Prisma, JournalType, EntryStatus, SalaryComponentType, PayrollRunStatus, PayslipStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors';
import { buildPagination } from '../../utils/response';
import { createJournalEntry, postJournalEntry } from '../journals/journal.service';
import { createPayrollApprovalRequest } from '../approvals/approval.service';
import { auditLog } from '../audit-trail/audit.service';
import { bulkEmployeeRowSchema, bulkComponentRowSchema } from './payroll.schemas';

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
  nonResidentFlatRate?: number;
  reliefs?: Record<string, unknown>;
  benefits?: Record<string, unknown>;
  taxRules?: Record<string, unknown>;
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
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: string;
  isMarried?: boolean;
  isDisabled?: boolean;
  numberOfChildren?: number;
  agedDependants?: number;
  vehicleBenefit?: number;
  accommodationCode?: 'AF' | 'AO' | 'FO' | 'SA' | null;
  vehicleCode?: 'FVD' | 'VF' | 'V' | 'F' | null;
  isNsp?: boolean;
  activatedReliefs?: ('MARRIAGE' | 'CHILD_EDUCATION' | 'OLD_AGE' | 'AGED_DEPENDANT' | 'DISABILITY')[];
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {
  isActive?: boolean;
}

export interface SetEmployeeStatusInput {
  status: 'ACTIVE' | 'SUSPENDED' | 'RESIGNED' | 'DISMISSED';
  reason?: string;
  endDate?: string;
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
  { min: 0,         max: 490,       rate: 0    },
  { min: 490,       max: 600,       rate: 5    },
  { min: 600,       max: 730,       rate: 10   },
  { min: 730,       max: 3896.67,   rate: 17.5 },
  { min: 3896.67,   max: 19896.67,  rate: 25   },
  { min: 19896.67,  max: 50416.67,  rate: 30   },
  { min: 50416.67,  max: null,      rate: 35   },
];

// ─── Configurable reliefs / benefits / tax rules (defaults; per-year overridable) ──

export interface ReliefTable {
  marriageChild: number; oldAge: number; childEducation: number;
  childEducationMax: number; agedDependant: number; disabilityPct: number;
}
export interface BenefitTable {
  accommodation: Record<string, number>;            // code → % of TCE
  vehicle: Record<string, { pct: number; cap: number }>;
}
export interface TaxRules {
  bonusThreshold: number; bonusRate: number;
  overtimeThreshold: number; overtimeRateLow: number; overtimeRateHigh: number; juniorStaffOtThreshold: number;
  casualRate: number; partTimeRate: number; nspAllowance: number;
  tier3Cap: number; totalPensionCap: number;
}

const DEFAULT_RELIEFS: ReliefTable = {
  marriageChild: 1200, oldAge: 1500, childEducation: 600, childEducationMax: 3, agedDependant: 1000, disabilityPct: 0.25,
};
const DEFAULT_BENEFITS: BenefitTable = {
  accommodation: { AF: 0.10, AO: 0.075, FO: 0.025, SA: 0.025 },
  vehicle: { FVD: { pct: 0.125, cap: 1500 }, VF: { pct: 0.10, cap: 1250 }, V: { pct: 0.05, cap: 625 }, F: { pct: 0.05, cap: 625 } },
};
const DEFAULT_TAX_RULES: TaxRules = {
  bonusThreshold: 0.15, bonusRate: 0.05,
  overtimeThreshold: 0.50, overtimeRateLow: 0.05, overtimeRateHigh: 0.10, juniorStaffOtThreshold: 1500,
  casualRate: 0.05, partTimeRate: 0.10, nspAllowance: 715,
  tier3Cap: 0.165, totalPensionCap: 0.35,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function ageFromDob(dob: Date | null | undefined, asOf: Date): number | null {
  if (!dob) return null;
  let age = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) age--;
  return age;
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
    nonResidentFlatRate: cfg ? Number(cfg.nonResidentFlatRate) : 0.25,
    reliefs:  { ...DEFAULT_RELIEFS,  ...((cfg?.reliefs  as object) ?? {}) } as ReliefTable,
    benefits: { ...DEFAULT_BENEFITS, ...((cfg?.benefits as object) ?? {}) } as BenefitTable,
    taxRules: { ...DEFAULT_TAX_RULES, ...((cfg?.taxRules as object) ?? {}) } as TaxRules,
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
      ...(input.nonResidentFlatRate !== undefined && { nonResidentFlatRate: input.nonResidentFlatRate }),
      ...(input.reliefs  !== undefined && { reliefs:  input.reliefs as object }),
      ...(input.benefits !== undefined && { benefits: input.benefits as object }),
      ...(input.taxRules !== undefined && { taxRules: input.taxRules as object }),
    },
    create: {
      organisationId,
      taxYear:           input.taxYear,
      ssnitEmployeeRate: input.ssnitEmployeeRate ?? 0.055,
      ssnitEmployerRate: input.ssnitEmployerRate ?? 0.13,
      tier2Rate:         input.tier2Rate         ?? 0.05,
      payeBands:         (input.payeBands ?? DEFAULT_PAYE_BANDS) as object,
      personalRelief:    input.personalRelief    ?? 0,
      nonResidentFlatRate: input.nonResidentFlatRate ?? 0.25,
      reliefs:  (input.reliefs  ?? DEFAULT_RELIEFS) as object,
      benefits: (input.benefits ?? DEFAULT_BENEFITS) as object,
      taxRules: (input.taxRules ?? DEFAULT_TAX_RULES) as object,
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
      gender:                 input.gender,
      dateOfBirth:            input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      isMarried:              input.isMarried ?? false,
      isDisabled:             input.isDisabled ?? false,
      numberOfChildren:       input.numberOfChildren ?? 0,
      agedDependants:         input.agedDependants ?? 0,
      vehicleBenefit:         input.vehicleBenefit,
      accommodationCode:      input.accommodationCode ?? null,
      vehicleCode:            input.vehicleCode ?? null,
      isNsp:                  input.isNsp ?? false,
      activatedReliefs:       input.activatedReliefs ?? [],
    },
    include: {
      department:           { select: { id: true, name: true } },
      costCentre:           { select: { id: true, name: true } },
      salaryExpenseAccount: { select: { id: true, code: true, name: true } },
    },
  });
}

// Bulk-onboard employees from an import. Each row is validated individually
// (so one bad row never aborts the batch), department is resolved by name, blank
// employee numbers auto-generate, and every failure is reported per row.
export async function bulkCreateEmployees(organisationId: string, rawRows: unknown[], dryRun = false) {
  const departments = await prisma.department.findMany({ where: { organisationId }, select: { id: true, name: true } });
  const deptByName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d.id]));

  const existing = await prisma.employee.findMany({ where: { organisationId }, select: { employeeNumber: true } });
  const used = new Set(existing.map((e) => e.employeeNumber));
  let maxSeq = 0;
  for (const n of used) { const m = n.match(/(\d+)$/); if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10)); }
  const genNumber = () => { maxSeq += 1; return `EMP-${String(maxSeq).padStart(4, '0')}`; };

  const errors: { row: number; employee: string; message: string }[] = [];
  const preview: { row: number; employeeNumber: string; name: string; department: string | null; basicSalary: number; cashAllowance?: number; fixedMonthlyBonus?: number }[] = [];
  const toCreate: Prisma.EmployeeCreateManyInput[] = [];
  // Inline standing pay elements captured per row, applied after the employees exist.
  const inlineElements: { employeeNumber: string; effectiveFrom: Date; cashAllowance?: number; fixedMonthlyBonus?: number }[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = (rawRows[i] ?? {}) as Record<string, unknown>;
    const label = `${(raw.firstName as string) ?? ''} ${(raw.lastName as string) ?? ''}`.trim();
    const parsed = bulkEmployeeRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push({ row: i + 2, employee: label, message: `${issue.path.join('.') || 'field'}: ${issue.message}` });
      continue;
    }
    const { department, employeeNumber, cashAllowance, fixedMonthlyBonus, ...r } = parsed.data;
    let departmentId: string | undefined;
    if (department && department.trim()) {
      departmentId = deptByName.get(department.trim().toLowerCase());
      if (!departmentId) { errors.push({ row: i + 2, employee: label, message: `Department "${department}" not found` }); continue; }
    }
    const number = (employeeNumber && employeeNumber.trim()) || genNumber();
    if (used.has(number)) { errors.push({ row: i + 2, employee: label, message: `Employee number ${number} already exists` }); continue; }
    used.add(number);
    if ((cashAllowance ?? 0) > 0 || (fixedMonthlyBonus ?? 0) > 0) {
      inlineElements.push({ employeeNumber: number, effectiveFrom: new Date(r.startDate), cashAllowance, fixedMonthlyBonus });
    }
    preview.push({ row: i + 2, employeeNumber: number, name: label, department: department?.trim() || null, basicSalary: r.basicSalary, cashAllowance, fixedMonthlyBonus });
    toCreate.push({
      organisationId, employeeNumber: number,
      firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone,
      nationalId: r.nationalId, tinNumber: r.tinNumber, ssnitNumber: r.ssnitNumber,
      employmentType: r.employmentType ?? 'FULL_TIME', payFrequency: r.payFrequency ?? 'MONTHLY',
      startDate: new Date(r.startDate), endDate: r.endDate ? new Date(r.endDate) : null,
      jobTitle: r.jobTitle, departmentId,
      basicSalary: r.basicSalary,
      bankName: r.bankName, bankAccountNumber: r.bankAccountNumber, bankBranch: r.bankBranch,
      tier3EmployeeRate: r.tier3EmployeeRate, tier3EmployerRate: r.tier3EmployerRate,
      overtimeType: r.overtimeType ?? 'NONE', overtimeFixedAmount: r.overtimeFixedAmount, overtimeMultiplier: r.overtimeMultiplier,
      isResident: r.isResident ?? true,
      gender: r.gender, dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth) : null,
      isMarried: r.isMarried ?? false, isDisabled: r.isDisabled ?? false,
      numberOfChildren: r.numberOfChildren ?? 0, agedDependants: r.agedDependants ?? 0,
      vehicleBenefit: r.vehicleBenefit, accommodationCode: r.accommodationCode ?? null,
      vehicleCode: r.vehicleCode ?? null, isNsp: r.isNsp ?? false,
    });
  }

  // Dry run: report what would be created (with all DB-level validation applied)
  // without writing anything.
  if (dryRun) {
    return { dryRun: true, created: 0, wouldCreate: toCreate.length, total: rawRows.length, errors, preview };
  }

  // Single batch insert — avoids a per-row round-trip storm (and the timeout it caused).
  let created = 0;
  if (toCreate.length > 0) {
    try {
      const res = await prisma.employee.createMany({ data: toCreate, skipDuplicates: true });
      created = res.count;
    } catch (e) {
      errors.push({ row: 0, employee: '', message: `Batch insert failed: ${(e as Error).message}` });
    }
  }

  // Apply inline standing pay elements. Validation already rejected duplicate numbers,
  // so the rows below resolve to the employees just created.
  if (inlineElements.length > 0) {
    const numbers = inlineElements.map((e) => e.employeeNumber);
    const emps = await prisma.employee.findMany({ where: { organisationId, employeeNumber: { in: numbers } }, select: { id: true, employeeNumber: true } });
    const idByNumber = new Map(emps.map((e) => [e.employeeNumber, e.id]));
    let allowId: string | undefined; let bonusId: string | undefined;
    const ecData: Prisma.EmployeeComponentCreateManyInput[] = [];
    for (const el of inlineElements) {
      const empId = idByNumber.get(el.employeeNumber);
      if (!empId) continue;
      if ((el.cashAllowance ?? 0) > 0) {
        allowId ??= await ensureSalaryComponent(organisationId, 'CASH_ALLOW', 'Cash Allowance', SalaryComponentType.ALLOWANCE, true);
        ecData.push({ employeeId: empId, componentId: allowId, amount: el.cashAllowance, effectiveFrom: el.effectiveFrom });
      }
      if ((el.fixedMonthlyBonus ?? 0) > 0) {
        bonusId ??= await ensureSalaryComponent(organisationId, 'FIXED_BONUS', 'Fixed Monthly Bonus', SalaryComponentType.BONUS, true);
        ecData.push({ employeeId: empId, componentId: bonusId, amount: el.fixedMonthlyBonus, effectiveFrom: el.effectiveFrom });
      }
    }
    if (ecData.length > 0) {
      try { await prisma.employeeComponent.createMany({ data: ecData }); }
      catch (e) { errors.push({ row: 0, employee: '', message: `Pay-element insert failed: ${(e as Error).message}` }); }
    }
  }

  return { dryRun: false, created, wouldCreate: toCreate.length, total: rawRows.length, errors, preview };
}

// Find-or-create a per-org salary component by code (used for the inline-import
// convenience components so the user doesn't have to pre-create them).
async function ensureSalaryComponent(
  organisationId: string,
  code: string,
  name: string,
  type: SalaryComponentType,
  isTaxable: boolean,
): Promise<string> {
  const existing = await prisma.salaryComponent.findUnique({
    where: { organisationId_code: { organisationId, code } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const c = await prisma.salaryComponent.create({ data: { organisationId, code, name, type, isTaxable } });
  return c.id;
}

// Bulk-assign recurring pay elements (salary components) to employees by number +
// component code. Each row is validated individually and reported per row.
export async function bulkAssignComponents(organisationId: string, rawRows: unknown[], dryRun = false) {
  const employees = await prisma.employee.findMany({ where: { organisationId }, select: { id: true, employeeNumber: true } });
  const empByNumber = new Map(employees.map((e) => [e.employeeNumber.toLowerCase(), e.id]));
  const components = await prisma.salaryComponent.findMany({ where: { organisationId, isActive: true }, select: { id: true, code: true } });
  const compByCode = new Map(components.map((c) => [c.code.toLowerCase(), c.id]));

  const errors: { row: number; message: string }[] = [];
  const preview: { row: number; employeeNumber: string; componentCode: string; amount: number | null; rate: number | null; effectiveFrom: string }[] = [];
  const toCreate: Prisma.EmployeeComponentCreateManyInput[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const parsed = bulkComponentRowSchema.safeParse(rawRows[i] ?? {});
    if (!parsed.success) { errors.push({ row: i + 2, message: parsed.error.issues[0].message }); continue; }
    const r = parsed.data;
    const employeeId = empByNumber.get(r.employeeNumber.trim().toLowerCase());
    if (!employeeId) { errors.push({ row: i + 2, message: `Employee "${r.employeeNumber}" not found` }); continue; }
    const componentId = compByCode.get(r.componentCode.trim().toLowerCase());
    if (!componentId) { errors.push({ row: i + 2, message: `Component code "${r.componentCode}" not found` }); continue; }
    const hasAmount = r.amount != null && r.amount > 0;
    const hasRate = r.rate != null && r.rate > 0;
    if (hasAmount === hasRate) { errors.push({ row: i + 2, message: 'Provide either amount or rate (exactly one)' }); continue; }
    const amount = hasAmount ? r.amount! : null;
    const rate = hasRate ? r.rate! : null;
    preview.push({ row: i + 2, employeeNumber: r.employeeNumber.trim(), componentCode: r.componentCode.trim(), amount, rate, effectiveFrom: r.effectiveFrom });
    toCreate.push({ employeeId, componentId, amount, rate, effectiveFrom: new Date(r.effectiveFrom) });
  }

  if (dryRun) {
    return { dryRun: true, created: 0, wouldCreate: toCreate.length, total: rawRows.length, errors, preview };
  }

  let created = 0;
  if (toCreate.length > 0) {
    try { const res = await prisma.employeeComponent.createMany({ data: toCreate }); created = res.count; }
    catch (e) { errors.push({ row: 0, message: `Batch insert failed: ${(e as Error).message}` }); }
  }
  return { dryRun: false, created, wouldCreate: toCreate.length, total: rawRows.length, errors, preview };
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
      ...(input.gender                !== undefined && { gender:                input.gender }),
      ...(input.dateOfBirth           !== undefined && { dateOfBirth:           input.dateOfBirth ? new Date(input.dateOfBirth) : null }),
      ...(input.isMarried             !== undefined && { isMarried:             input.isMarried }),
      ...(input.isDisabled            !== undefined && { isDisabled:            input.isDisabled }),
      ...(input.numberOfChildren      !== undefined && { numberOfChildren:      input.numberOfChildren }),
      ...(input.agedDependants        !== undefined && { agedDependants:        input.agedDependants }),
      ...(input.vehicleBenefit        !== undefined && { vehicleBenefit:        input.vehicleBenefit }),
      ...(input.accommodationCode     !== undefined && { accommodationCode:     input.accommodationCode }),
      ...(input.vehicleCode           !== undefined && { vehicleCode:           input.vehicleCode }),
      ...(input.isNsp                 !== undefined && { isNsp:                 input.isNsp }),
      ...(input.activatedReliefs      !== undefined && { activatedReliefs:      input.activatedReliefs }),
    },
    include: {
      department:           { select: { id: true, name: true } },
      costCentre:           { select: { id: true, name: true } },
      salaryExpenseAccount: { select: { id: true, code: true, name: true } },
    },
  });
}

// Change an employee's status. Employees are never deleted; payroll runs cease
// for anyone not ACTIVE. isActive is kept in sync so existing filters still work.
export async function setEmployeeStatus(organisationId: string, id: string, input: SetEmployeeStatusInput) {
  const emp = await prisma.employee.findFirst({ where: { id, organisationId } });
  if (!emp) throw new NotFoundError('Employee not found');
  return prisma.employee.update({
    where: { id },
    data: {
      status: input.status,
      statusReason: input.reason ?? null,
      isActive: input.status === 'ACTIVE',
      ...(input.status !== 'ACTIVE' && input.endDate ? { endDate: new Date(input.endDate) } : {}),
      ...(input.status === 'ACTIVE' ? { endDate: null } : {}),
    },
    include: { department: { select: { id: true, name: true } } },
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

  // Attach the latest payroll approval request (if a workflow is in use) so the UI
  // can show multi-level progress instead of the direct approve button.
  const req = await prisma.approvalRequest.findFirst({
    where:   { entityType: 'PAYROLL', entityId: id, workflow: { organisationId } },
    orderBy: { requestedAt: 'desc' },
    include: {
      workflow: { select: { levels: { orderBy: { levelNumber: 'asc' }, select: { levelNumber: true, name: true } } } },
      decisions: { orderBy: { decidedAt: 'asc' }, select: { levelNumber: true, decision: true, decidedBy: true, decidedAt: true, comments: true } },
    },
  });
  const approval = req && {
    requestId:    req.id,
    status:       req.status,
    currentLevel: req.currentLevel,
    levels:       req.workflow.levels,
    decisions:    req.decisions,
  };

  return { ...run, approval: approval || null };
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

  // Only a designated payroll preparer (or an org admin) may create a run.
  const { preparers } = await getPayrollRoster(organisationId);
  if (preparers.size > 0 && !preparers.has(userId) && !(await isPayrollOrgAdmin(organisationId, userId))) {
    throw new ForbiddenError('Only a designated payroll preparer can create a run');
  }

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
      employmentType: true, accommodationCode: true, vehicleCode: true, isNsp: true,
      isMarried: true, isDisabled: true, numberOfChildren: true, agedDependants: true, dateOfBirth: true,
      activatedReliefs: true,
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

  // Fetch every active loan for the org in one query, grouped by employee —
  // avoids a per-employee round-trip inside the loop (the cause of the timeout).
  const allActiveLoans = await prisma.employeeLoan.findMany({
    where: { organisationId, status: 'ACTIVE', startDate: { lte: paymentDate } },
  });
  const loansByEmployee = new Map<string, typeof allActiveLoans>();
  for (const loan of allActiveLoans) {
    const arr = loansByEmployee.get(loan.employeeId);
    if (arr) arr.push(loan); else loansByEmployee.set(loan.employeeId, [loan]);
  }

  // Payslips and their lines are built in memory and inserted with two batched
  // createMany calls (ids are pre-assigned so lines can reference their payslip).
  const payslipDataList: (Prisma.PayslipCreateManyInput & { id: string })[] = [];
  const payslipLineDataList: Prisma.PayslipLineCreateManyInput[] = [];

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

    // Active loan repayments (resolved from the pre-fetched map)
    const activeLoans = loansByEmployee.get(emp.id) ?? [];
    for (const loan of activeLoans) {
      const instalment = round4(Math.min(Number(loan.instalmentAmount), Number(loan.balance)));
      if (instalment > 0) {
        otherDeductions = round4(otherDeductions + instalment);
        lines.push({ description: `Loan Repayment: ${loan.description}`, type: SalaryComponentType.EMPLOYEE_DEDUCTION, amount: instalment, isEmployer: false, componentId: undefined, loanId: loan.id });
      }
    }

    const tr      = statutory.taxRules;
    const reliefCfg  = statutory.reliefs;
    const benefitCfg = statutory.benefits;

    // National Service Personnel (NSP): everything they are paid is fully
    // non-taxable, and no SSNIT/pension is deducted at all. Their gross = their net.
    const isNsp = emp.isNsp === true;

    const grossPay = round4(basic + overtime + bonuses + allowances + otherEarnings);

    // SSNIT & Tier 2 are on basic salary only (GRA: 5.5% / 13% / 5% of basic) — none for NSP
    const ssnitEmployee = isNsp ? 0 : round4(basic * statutory.ssnitEmployeeRate);
    const ssnitEmployer = isNsp ? 0 : round4(basic * (statutory.ssnitEmployerRate - statutory.tier2Rate));
    const tier2Employer = isNsp ? 0 : round4(basic * statutory.tier2Rate);

    // Tier 3 / Provident Fund — on basic salary; PAYE deductible is combined
    // employee + employer contribution capped at the voluntary pension limit (16.5%)
    const t3EmpRate     = emp.tier3EmployeeRate ? Number(emp.tier3EmployeeRate) : 0;
    const t3ErRate      = emp.tier3EmployerRate ? Number(emp.tier3EmployerRate) : 0;
    const tier3Employee = isNsp ? 0 : round4(basic * t3EmpRate);
    const tier3Employer = isNsp ? 0 : round4(basic * t3ErRate);
    const tier3Deductible = round4(Math.min(tier3Employee + tier3Employer, basic * tr.tier3Cap));

    // Non-cash taxable benefits valued on TCE (total cash emoluments = basic + allowances)
    const tce = round4(basic + allowances);
    const accPct = emp.accommodationCode ? (benefitCfg.accommodation[emp.accommodationCode] ?? 0) : 0;
    const accommodationBenefit = round4(tce * accPct);
    let vehicleBenefit = 0;
    if (emp.vehicleCode && benefitCfg.vehicle[emp.vehicleCode]) {
      const v = benefitCfg.vehicle[emp.vehicleCode];
      vehicleBenefit = round4(Math.min(tce * v.pct, v.cap));
    }
    const taxableBenefits = round4(accommodationBenefit + vehicleBenefit);

    const isResident    = emp.isResident !== false;
    const isJuniorStaff = basic <= tr.juniorStaffOtThreshold;

    // Flat-rate employees (non-resident / casual / part-time) are taxed at a single
    // rate on ALL income — no bands, reliefs, or separate bonus/overtime treatment.
    let flatRate: number | null = null;
    if (!isResident)                      flatRate = statutory.nonResidentFlatRate;
    else if (emp.employmentType === 'CASUAL')    flatRate = tr.casualRate;
    else if (emp.employmentType === 'PART_TIME') flatRate = tr.partTimeRate;

    let payeAmount = 0;
    let overtimeTax = 0, overtimeInPaye = 0;
    let bonusTax = 0, bonusInPaye = 0;
    let reliefApplied = 0;

    if (isNsp) {
      payeAmount = 0; // NSP income is fully non-taxable
    } else if (flatRate !== null) {
      const flatBase = round4(basic + allowances + otherEarnings + overtime + bonuses + taxableBenefits);
      payeAmount = round4(flatBase * flatRate);
    } else {
      // Overtime tax — junior staff: low rate up to the OT threshold, high rate above
      if (overtime > 0) {
        if (isJuniorStaff) {
          const otThreshold = round4(basic * tr.overtimeThreshold);
          const atLow  = round4(Math.min(overtime, otThreshold));
          const atHigh = round4(Math.max(0, overtime - otThreshold));
          overtimeTax = round4(atLow * tr.overtimeRateLow + atHigh * tr.overtimeRateHigh);
        } else {
          overtimeInPaye = overtime;
        }
      }
      // Bonus tax — flat rate on the portion ≤ threshold of basic; excess to PAYE
      if (bonuses > 0) {
        const bonusThreshold = round4(basic * tr.bonusThreshold);
        const atRate = round4(Math.min(bonuses, bonusThreshold));
        bonusTax    = round4(atRate * tr.bonusRate);
        bonusInPaye = round4(Math.max(0, bonuses - bonusThreshold));
      }
      // Personal reliefs (annual → monthly). A relief applies ONLY when the
      // employee is eligible AND it has been activated (GRA-granted) for them —
      // eligibility data alone never auto-applies a relief.
      const active = new Set(emp.activatedReliefs ?? []);
      const age = ageFromDob(emp.dateOfBirth, paymentDate);
      let annualRelief = 0;
      if (emp.isMarried && active.has('MARRIAGE')) annualRelief += reliefCfg.marriageChild;
      if (age !== null && age >= 60 && active.has('OLD_AGE')) annualRelief += reliefCfg.oldAge;
      if (active.has('CHILD_EDUCATION')) annualRelief += Math.min(emp.numberOfChildren, reliefCfg.childEducationMax) * reliefCfg.childEducation;
      if (active.has('AGED_DEPENDANT')) annualRelief += emp.agedDependants * reliefCfg.agedDependant;

      const payeGross        = round4(basic + allowances + otherEarnings + bonusInPaye + overtimeInPaye + taxableBenefits);
      const assessableIncome = round4(Math.max(0, payeGross - ssnitEmployee - tier3Deductible));
      const disabilityRelief = (emp.isDisabled && active.has('DISABILITY')) ? round4(assessableIncome * reliefCfg.disabilityPct) : 0;
      reliefApplied          = round4(annualRelief / 12 + disabilityRelief + statutory.personalRelief);
      const taxableIncome    = round4(Math.max(0, assessableIncome - reliefApplied));
      payeAmount = calculatePaye(taxableIncome, bands, 0);
    }

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

    const payslipId = randomUUID();
    payslipDataList.push({
      id:               payslipId,
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
      // GRA PAYE schedule breakdown
      accommodationBenefit,
      vehicleBenefit,
      nonCashBenefit:   0,
      bonusExcess:      bonusInPaye,
      deductibleReliefs: reliefApplied,
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
    });
    for (const l of lines) {
      payslipLineDataList.push({ payslipId, description: l.description, type: l.type, amount: l.amount, isEmployer: l.isEmployer, componentId: l.componentId, loanId: l.loanId });
    }

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

    // Attach the run id, then insert all payslips and their lines in two batches
    // (one round-trip each) rather than a create-per-employee storm.
    for (const pd of payslipDataList) pd.payrollRunId = created.id;
    await tx.payslip.createMany({ data: payslipDataList });
    await tx.payslipLine.createMany({ data: payslipLineDataList });

    return tx.payrollRun.findUnique({
      where:   { id: created.id },
      include: { payslips: { include: { employee: true, lines: true } }, period: true },
    });
  }, { timeout: 30000 });

  auditLog({ organisationId, userId, action: 'PAYROLL_RUN_CREATED', module: 'PAYROLL', entityType: 'PAYROLL_RUN', entityId: run!.id, entityRef: run!.runNumber, description: `Payroll run ${run!.runNumber} created — ${run!.payslips.length} employees, net pay ${totalNetPay}`, after: { runNumber: run!.runNumber, totalGross, totalNetPay, employeeCount: run!.payslips.length } });
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

// ─── Two-Person Workflow (Preparer + Approver) ────────────────────────────────
// The active PAYROLL approval workflow doubles as the payroll duty roster:
//   • first level (lowest levelNumber) → Preparers — may create & submit a run
//   • the remaining level(s)           → Approvers — may approve, then pay/post
// When no workflow (or no users) is configured, only the route role-guards and the
// four-eyes separation below apply. Org admins bypass roster membership, but the
// preparer can never approve or pay their own run (distinctness is always enforced).
async function getPayrollRoster(organisationId: string) {
  const wf = await prisma.approvalWorkflow.findFirst({
    where:   { organisationId, entityType: 'PAYROLL', isActive: true },
    include: { levels: { orderBy: { levelNumber: 'asc' }, include: { approvers: { select: { userId: true } } } } },
  });
  const preparers = new Set<string>();
  const approvers = new Set<string>();
  const hasWorkflow = !!wf && wf.levels.length > 0;
  if (wf && wf.levels.length > 0) {
    if (wf.levels.length === 1) {
      // Only one level defined → treat it as the approver roster; preparers fall back to role guards.
      for (const a of wf.levels[0].approvers) approvers.add(a.userId);
    } else {
      for (const a of wf.levels[0].approvers) preparers.add(a.userId);
      for (const lvl of wf.levels.slice(1)) for (const a of lvl.approvers) approvers.add(a.userId);
    }
  }
  return { preparers, approvers, hasWorkflow };
}

async function isPayrollOrgAdmin(organisationId: string, userId: string) {
  const m = await prisma.organisationUser.findUnique({
    where:  { organisationId_userId: { organisationId, userId } },
    select: { role: true },
  });
  return m?.role === 'ORG_ADMIN' || m?.role === 'SUPER_ADMIN';
}

export async function submitPayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run)                                  throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.DRAFT) throw new ValidationError('Only DRAFT runs can be submitted');
  // The preparer creates and submits (no four-eyes between create & submit); four-eyes
  // applies at approval and payment below.
  const { preparers } = await getPayrollRoster(organisationId);
  if (preparers.size > 0 && !preparers.has(userId) && !(await isPayrollOrgAdmin(organisationId, userId))) {
    throw new ForbiddenError('Only a designated payroll preparer can submit this run');
  }

  const submitted = await prisma.payrollRun.update({
    where: { id },
    data:  { status: PayrollRunStatus.SUBMITTED, submittedBy: userId, submittedAt: new Date() },
  });

  // If a PAYROLL approval workflow is configured, raise a multi-level approval
  // request; approvers act on it via the Approvals page and the engine flips the
  // run to APPROVED once the final level signs off. Otherwise the built-in
  // two-person approve endpoint handles it.
  const { hasWorkflow } = await createPayrollApprovalRequest(organisationId, id, userId);

  auditLog({ organisationId, userId, action: 'PAYROLL_RUN_SUBMITTED', module: 'PAYROLL', entityType: 'PAYROLL_RUN', entityId: id, entityRef: run.runNumber, description: `Payroll run ${run.runNumber} submitted for approval${hasWorkflow ? ' (multi-level workflow)' : ''}` });
  return submitted;
}

export async function approvePayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run)                                       throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.SUBMITTED)  throw new ValidationError('Only SUBMITTED runs can be approved');
  // Four-eyes: the approver can never be the preparer who created/submitted the run.
  if ([run.createdBy, run.submittedBy].includes(userId)) throw new ForbiddenError('The approver must differ from the preparer who created and submitted the run');
  // When a multi-level approval request is in flight, approval must go through the
  // engine (every level signs off in turn) — block the direct one-shot endpoint.
  // (Checked by live request, not just workflow existence, so a run submitted before
  // a workflow was added can still be approved directly rather than dead-ending.)
  const pendingRequest = await prisma.approvalRequest.findFirst({
    where: { entityType: 'PAYROLL', entityId: id, status: 'PENDING', workflow: { organisationId } },
    select: { id: true },
  });
  if (pendingRequest) {
    throw new ForbiddenError('This run is approved through the payroll approval workflow — approve it from the Approvals page.');
  }
  const { approvers } = await getPayrollRoster(organisationId);
  if (approvers.size > 0 && !approvers.has(userId) && !(await isPayrollOrgAdmin(organisationId, userId))) {
    throw new ForbiddenError('Only a designated payroll approver can approve this run');
  }

  const approved = await prisma.payrollRun.update({
    where: { id },
    data:  { status: PayrollRunStatus.APPROVED, approvedBy: userId, approvedAt: new Date() },
  });
  auditLog({ organisationId, userId, action: 'PAYROLL_RUN_APPROVED', module: 'PAYROLL', entityType: 'PAYROLL_RUN', entityId: id, entityRef: run.runNumber, description: `Payroll run ${run.runNumber} approved` });
  return approved;
}

export async function payPayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({
    where:   { id, organisationId },
    include: { payslips: { include: { employee: { select: { departmentId: true, costCentreId: true, salaryExpenseAccountId: true } } } } },
  });
  if (!run)                                      throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.APPROVED)  throw new ValidationError('Only APPROVED runs can be marked as paid');
  // The approver also posts payment (a separate step). Four-eyes still holds: the
  // preparer who created/submitted the run can never pay it.
  if ([run.createdBy, run.submittedBy].includes(userId)) {
    throw new ForbiddenError('The payer must differ from the preparer who created and submitted the run');
  }
  const { approvers } = await getPayrollRoster(organisationId);
  if (approvers.size > 0 && !approvers.has(userId) && !(await isPayrollOrgAdmin(organisationId, userId))) {
    throw new ForbiddenError('Only a designated payroll approver can post payment for this run');
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

  auditLog({ organisationId, userId, action: 'PAYROLL_RUN_PAID', module: 'PAYROLL', entityType: 'PAYROLL_RUN', entityId: id, entityRef: run.runNumber, description: `Payroll run ${run.runNumber} paid — GL journal ${je.journalNumber} posted`, after: { journalEntryId: je.id, totalNetPay: run.totalNetPay } });
  return updatedRun;
}

// ─── Lock Run ─────────────────────────────────────────────────────────────────

export async function lockPayrollRun(organisationId: string, id: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, organisationId } });
  if (!run) throw new NotFoundError('Payroll run not found');
  if (run.status !== PayrollRunStatus.PAID) throw new ValidationError('Only PAID runs can be locked');

  const lockedRun = await prisma.payrollRun.update({
    where: { id },
    data:  { status: PayrollRunStatus.LOCKED, lockedBy: userId, lockedAt: new Date() },
  });
  auditLog({ organisationId, userId, action: 'PAYROLL_RUN_LOCKED', module: 'PAYROLL', entityType: 'PAYROLL_RUN', entityId: id, entityRef: run.runNumber, description: `Payroll run ${run.runNumber} locked — payment file can no longer be regenerated` });
  return lockedRun;
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
