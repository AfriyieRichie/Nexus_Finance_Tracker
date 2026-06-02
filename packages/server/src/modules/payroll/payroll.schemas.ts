import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ─── Statutory Config ─────────────────────────────────────────────────────────

export const upsertStatutoryConfigSchema = z.object({
  taxYear: z.number().int().min(2000).max(2100),
  ssnitEmployeeRate: z.number().min(0).max(1).optional(),
  ssnitEmployerRate: z.number().min(0).max(1).optional(),
  tier2Rate: z.number().min(0).max(1).optional(),
  personalRelief: z.number().nonnegative().optional(),
  payeBands: z.array(z.object({
    min: z.number().nonnegative(),
    max: z.number().positive().nullable(),
    rate: z.number().min(0).max(100),
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
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
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
export type CreateSalaryComponentInput = z.infer<typeof createSalaryComponentSchema>;
export type AssignComponentInput = z.infer<typeof assignComponentSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsSchema>;
