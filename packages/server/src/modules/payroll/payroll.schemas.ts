import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ─── Statutory Config ─────────────────────────────────────────────────────────

export const upsertStatutoryConfigSchema = z.object({
  // The client submits rates as strings (e.g. "0.055"); coerce so they validate.
  taxYear: z.coerce.number().int().min(2000).max(2100),
  ssnitEmployeeRate: z.coerce.number().min(0).max(1).optional(),
  ssnitEmployerRate: z.coerce.number().min(0).max(1).optional(),
  tier2Rate: z.coerce.number().min(0).max(1).optional(),
  personalRelief: z.coerce.number().nonnegative().optional(),
  nonResidentFlatRate: z.coerce.number().min(0).max(1).optional(),
  reliefs: z.record(z.any()).optional(),
  benefits: z.record(z.any()).optional(),
  taxRules: z.record(z.any()).optional(),
  payeBands: z.array(z.object({
    min: z.coerce.number().nonnegative(),
    max: z.coerce.number().positive().nullable(),
    rate: z.coerce.number().min(0).max(100),
  })).optional(),
});

// ─── Employees ────────────────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  employeeNumber: z.string().min(1).max(30),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  nationalId: z.string().max(30).optional(),
  tinNumber: z.string().max(30).optional(),
  ssnitNumber: z.string().max(30).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'CASUAL']).optional(),
  payFrequency: z.enum(['MONTHLY', 'FORTNIGHTLY', 'WEEKLY']).optional(),
  startDate: z.string().regex(dateRegex),
  endDate: z.string().regex(dateRegex).optional(),
  jobTitle: z.string().max(100).optional(),
  departmentId: z.string().uuid().optional(),
  costCentreId: z.string().uuid().optional(),
  basicSalary: z.number().positive(),
  bankName: z.string().max(100).optional(),
  bankAccountNumber: z.string().max(30).optional(),
  bankBranch: z.string().max(100).optional(),
  tier3EmployeeRate: z.number().min(0).max(1).optional(),
  tier3EmployerRate: z.number().min(0).max(1).optional(),
  salaryExpenseAccountId: z.string().uuid().optional(),
  overtimeType: z.enum(['NONE', 'FIXED', 'RATE_BASED']).optional(),
  overtimeFixedAmount: z.number().nonnegative().optional(),
  overtimeMultiplier: z.number().positive().optional(),
  isResident: z.boolean().optional(),
  // Personal / relief attributes
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.string().regex(dateRegex).optional(),
  isMarried: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
  numberOfChildren: z.coerce.number().int().min(0).optional(),
  agedDependants: z.coerce.number().int().min(0).optional(),
  vehicleBenefit: z.coerce.number().nonnegative().optional(),
  accommodationCode: z.enum(['AF', 'AO', 'FO', 'SA']).nullable().optional(),
  vehicleCode: z.enum(['FVD', 'VF', 'V', 'F']).nullable().optional(),
  isNsp: z.boolean().optional(),
  activatedReliefs: z.array(z.enum(['MARRIAGE', 'CHILD_EDUCATION', 'OLD_AGE', 'AGED_DEPENDANT', 'DISABILITY'])).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const setEmployeeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISMISSED']),
  reason: z.string().max(300).optional(),
  endDate: z.string().regex(dateRegex).optional(),
});

// Bulk onboarding — department is given by NAME (resolved server-side); employee
// number is optional (auto-generated when blank); UUID-only fields are excluded.
// Email is lenient (contact info shouldn't block onboarding).
export const bulkEmployeeRowSchema = createEmployeeSchema
  .omit({ departmentId: true, costCentreId: true, salaryExpenseAccountId: true })
  .extend({
    employeeNumber: z.string().optional(),
    department: z.string().optional(),
    email: z.string().optional(),
    // Inline standing pay elements (convenience). cashAllowance → a taxable
    // Cash Allowance component; fixedMonthlyBonus → a recurring Bonus component
    // (taxed via the concessional bonus engine, stacking with per-run bonuses).
    cashAllowance: z.coerce.number().nonnegative().optional(),
    fixedMonthlyBonus: z.coerce.number().nonnegative().optional(),
  });

// The outer payload is parsed loosely so one bad row can't 400 the whole import;
// each row is validated individually in the service and reported per row.
export const bulkCreateEmployeesSchema = z.object({
  employees: z.array(z.record(z.any())).min(1).max(2000),
});

// ─── Bulk Pay-Element (component) assignment ──────────────────────────────────
export const bulkComponentRowSchema = z.object({
  employeeNumber: z.string().min(1),
  componentCode:  z.string().min(1),
  amount:         z.coerce.number().nonnegative().optional(),
  rate:           z.coerce.number().min(0).max(10).optional(),
  effectiveFrom:  z.string().regex(dateRegex),
});

export const bulkAssignComponentsSchema = z.object({
  assignments: z.array(z.record(z.any())).min(1).max(5000),
});

// ─── Salary Components ────────────────────────────────────────────────────────

export const createSalaryComponentSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  type: z.enum([
    'BASIC_SALARY', 'ALLOWANCE', 'BONUS', 'COMMISSION', 'OVERTIME',
    'OTHER_EARNING', 'EMPLOYEE_DEDUCTION', 'EMPLOYER_CONTRIBUTION',
  ]),
  isTaxable: z.boolean().optional(),
  glAccountId: z.string().uuid().optional(),
  description: z.string().optional(),
});

export const updateSalaryComponentSchema = createSalaryComponentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Component Assignment ─────────────────────────────────────────────────────

export const assignComponentSchema = z.object({
  componentId: z.string().uuid(),
  amount: z.number().nonnegative().optional(),
  rate: z.number().min(0).max(10).optional(),
  effectiveFrom: z.string().regex(dateRegex),
  effectiveTo: z.string().regex(dateRegex).optional(),
});

// ─── Loans ────────────────────────────────────────────────────────────────────

export const createLoanSchema = z.object({
  description: z.string().min(1).max(200),
  principalAmount: z.number().positive(),
  instalmentAmount: z.number().positive(),
  startDate: z.string().regex(dateRegex),
  glAccountId: z.string().uuid().optional(),
});

export const updateLoanSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'SUSPENDED']).optional(),
  instalmentAmount: z.number().positive().optional(),
  balance: z.number().nonnegative().optional(),
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export const createPayrollRunSchema = z.object({
  periodId: z.string().uuid(),
  paymentDate: z.string().regex(dateRegex),
  description: z.string().min(1).max(300),
  isSupplementary: z.boolean().optional(),
  parentRunId: z.string().uuid().optional(),
  wagesPayableAccountId: z.string().uuid(),
  payePayableAccountId: z.string().uuid(),
  ssnitPayableAccountId: z.string().uuid(),
  pensionPayableAccountId: z.string().uuid(),
  notes: z.string().optional(),
  overrides: z.array(z.object({
    employeeId: z.string().uuid(),
    overtimePay: z.number().nonnegative().optional(),
    overtimeHours: z.number().nonnegative().optional(),
    bonuses: z.number().nonnegative().optional(),
  })).optional(),
});

export const listPayrollRunsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type UpsertStatutoryConfigInput = z.infer<typeof upsertStatutoryConfigSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type SetEmployeeStatusInput = z.infer<typeof setEmployeeStatusSchema>;
export type BulkCreateEmployeesInput = z.infer<typeof bulkCreateEmployeesSchema>;
export type CreateSalaryComponentInput = z.infer<typeof createSalaryComponentSchema>;
export type AssignComponentInput = z.infer<typeof assignComponentSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsSchema>;
