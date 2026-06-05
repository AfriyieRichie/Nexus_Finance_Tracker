import { api } from './api';

// ── Enums ─────────────────────────────────────────────────────────────────────

export type EmploymentType  = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CASUAL';
export type PayFrequency    = 'MONTHLY' | 'FORTNIGHTLY' | 'WEEKLY';
export type OvertimeType    = 'NONE' | 'FIXED' | 'RATE_BASED';
export type SalaryComponentType =
  | 'BASIC_SALARY' | 'OVERTIME' | 'BONUS' | 'COMMISSION'
  | 'ALLOWANCE' | 'OTHER_EARNING' | 'EMPLOYEE_DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
export type PayrollRunStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'LOCKED';
export type PayslipStatus   = 'DRAFT' | 'FINALISED' | 'PAID';

// ── Statutory Config ──────────────────────────────────────────────────────────

export interface PayeBand { min: number; max: number | null; rate: number }

export interface StatutoryConfig {
  id: string;
  organisationId: string;
  taxYear: number;
  ssnitEmployeeRate: string;
  ssnitEmployerRate: string;
  tier2Rate: string;
  payeBands: PayeBand[];
  personalRelief: string;
}

// ── Employee ──────────────────────────────────────────────────────────────────

export interface EmployeeComponent {
  id: string;
  employeeId: string;
  componentId: string;
  amount: string | null;
  rate: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  component: { id: string; code: string; name: string; type: SalaryComponentType };
}

export interface Employee {
  id: string;
  organisationId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  tinNumber: string | null;
  ssnitNumber: string | null;
  employmentType: EmploymentType;
  payFrequency: PayFrequency;
  startDate: string;
  endDate: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  costCentreId: string | null;
  basicSalary: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  tier3EmployeeRate: string | null;
  tier3EmployerRate: string | null;
  salaryExpenseAccountId: string | null;
  overtimeType: OvertimeType;
  overtimeFixedAmount: string | null;
  overtimeMultiplier: string | null;
  isResident: boolean;
  isActive: boolean;
  department: { id: string; name: string } | null;
  costCentre: { id: string; name: string } | null;
  salaryExpenseAccount: { id: string; code: string; name: string } | null;
  components?: EmployeeComponent[];
}

// ── Salary Component ──────────────────────────────────────────────────────────

export interface SalaryComponent {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  type: SalaryComponentType;
  isTaxable: boolean;
  glAccountId: string | null;
  description: string | null;
  isActive: boolean;
  glAccount: { id: string; code: string; name: string } | null;
}

// ── Payslip ───────────────────────────────────────────────────────────────────

export interface PayslipLine {
  id: string;
  payslipId: string;
  componentId: string | null;
  description: string;
  type: SalaryComponentType;
  amount: string;
  isEmployer: boolean;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  organisationId: string;
  status: PayslipStatus;
  basicSalary: string;
  overtimePay: string;
  bonuses: string;
  allowances: string;
  otherEarnings: string;
  grossPay: string;
  payeAmount: string;
  ssnitEmployee: string;
  tier3Employee: string;
  overtimeTax: string;
  bonusTax: string;
  otherDeductions: string;
  totalDeductions: string;
  netPay: string;
  ssnitEmployer: string;
  tier2Employer: string;
  tier3Employer: string;
  totalEmployerCost: string;
  ytdGross: string;
  ytdPaye: string;
  ytdSsnit: string;
  ytdNetPay: string;
  departmentId: string | null;
  costCentreId: string | null;
  employee?: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    bankName: string | null;
    bankAccountNumber: string | null;
    departmentId: string | null;
    costCentreId: string | null;
  };
  lines?: PayslipLine[];
}

// ── Payroll Run ───────────────────────────────────────────────────────────────

export interface PayrollRun {
  id: string;
  organisationId: string;
  runNumber: string;
  periodId: string;
  paymentDate: string;
  description: string;
  status: PayrollRunStatus;
  isSupplementary: boolean;
  parentRunId: string | null;
  wagesPayableAccountId: string;
  payePayableAccountId: string;
  ssnitPayableAccountId: string;
  pensionPayableAccountId: string;
  totalGross: string;
  totalPaye: string;
  totalSsnitEmployee: string;
  totalSsnitEmployer: string;
  totalTier2: string;
  totalTier3Employee: string;
  totalTier3Employer: string;
  totalOtherDeductions: string;
  totalNetPay: string;
  totalEmployerCost: string;
  createdBy: string;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  journalEntryId: string | null;
  notes: string | null;
  createdAt: string;
  period?: { name: string; fiscalYear: { year: number } };
  payslips?: Payslip[];
  _count?: { payslips: number };
}

// ── Employee Loan ─────────────────────────────────────────────────────────────

export type LoanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUSPENDED';

export interface EmployeeLoan {
  id: string;
  organisationId: string;
  employeeId: string;
  description: string;
  principalAmount: string;
  balance: string;
  instalmentAmount: string;
  startDate: string;
  glAccountId: string | null;
  status: LoanStatus;
  createdBy: string;
  createdAt: string;
  glAccount: { id: string; code: string; name: string } | null;
}

// ── API Functions ─────────────────────────────────────────────────────────────

// Statutory Config
export const listStatutoryConfigs = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/payroll/statutory-config`).then((r) => r.data.data as StatutoryConfig[]);

export const upsertStatutoryConfig = (organisationId: string, data: Partial<StatutoryConfig> & { taxYear: number }) =>
  api.post(`/organisations/${organisationId}/payroll/statutory-config`, data).then((r) => r.data.data as StatutoryConfig);

// Employees
export const listEmployees = (organisationId: string, isActive?: boolean) =>
  api.get(`/organisations/${organisationId}/payroll/employees`, { params: isActive !== undefined ? { isActive } : undefined })
    .then((r) => r.data.data as Employee[]);

export const getEmployee = (organisationId: string, id: string) =>
  api.get(`/organisations/${organisationId}/payroll/employees/${id}`).then((r) => r.data.data as Employee);

export const createEmployee = (organisationId: string, data: Partial<Employee> & { employeeNumber: string; firstName: string; lastName: string; startDate: string; basicSalary: number }) =>
  api.post(`/organisations/${organisationId}/payroll/employees`, data).then((r) => r.data.data as Employee);

export const updateEmployee = (organisationId: string, id: string, data: Partial<Employee>) =>
  api.patch(`/organisations/${organisationId}/payroll/employees/${id}`, data).then((r) => r.data.data as Employee);

export const assignComponent = (organisationId: string, employeeId: string, data: { componentId: string; amount?: number; rate?: number; effectiveFrom: string; effectiveTo?: string }) =>
  api.post(`/organisations/${organisationId}/payroll/employees/${employeeId}/components`, data).then((r) => r.data.data as EmployeeComponent);

export const removeComponent = (organisationId: string, employeeId: string, assignmentId: string) =>
  api.delete(`/organisations/${organisationId}/payroll/employees/${employeeId}/components/${assignmentId}`);

// Salary Components
export const listSalaryComponents = (organisationId: string, isActive?: boolean) =>
  api.get(`/organisations/${organisationId}/payroll/salary-components`, { params: isActive !== undefined ? { isActive } : undefined })
    .then((r) => r.data.data as SalaryComponent[]);

export const createSalaryComponent = (organisationId: string, data: { code: string; name: string; type: SalaryComponentType; isTaxable?: boolean; glAccountId?: string; description?: string }) =>
  api.post(`/organisations/${organisationId}/payroll/salary-components`, data).then((r) => r.data.data as SalaryComponent);

export const updateSalaryComponent = (organisationId: string, id: string, data: Partial<SalaryComponent>) =>
  api.patch(`/organisations/${organisationId}/payroll/salary-components/${id}`, data).then((r) => r.data.data as SalaryComponent);

// Payroll Runs
export const listPayrollRuns = (organisationId: string, params?: { page?: number; pageSize?: number }) =>
  api.get(`/organisations/${organisationId}/payroll/runs`, { params }).then((r) => ({
    runs:       r.data.data as PayrollRun[],
    pagination: r.data.pagination,
  }));

export const getPayrollRun = (organisationId: string, id: string) =>
  api.get(`/organisations/${organisationId}/payroll/runs/${id}`).then((r) => r.data.data as PayrollRun);

export const createPayrollRun = (
  organisationId: string,
  data: {
    periodId: string;
    paymentDate: string;
    description: string;
    wagesPayableAccountId: string;
    payePayableAccountId: string;
    ssnitPayableAccountId: string;
    pensionPayableAccountId: string;
    isSupplementary?: boolean;
    parentRunId?: string;
    overrides?: { employeeId: string; overtimePay?: number; overtimeHours?: number; bonuses?: number }[];
    notes?: string;
  },
) =>
  api.post(`/organisations/${organisationId}/payroll/runs`, data).then((r) => r.data.data as PayrollRun);

export const deletePayrollRun = (organisationId: string, id: string) =>
  api.delete(`/organisations/${organisationId}/payroll/runs/${id}`);

export const submitPayrollRun = (organisationId: string, id: string) =>
  api.post(`/organisations/${organisationId}/payroll/runs/${id}/submit`).then((r) => r.data.data as PayrollRun);

export const approvePayrollRun = (organisationId: string, id: string) =>
  api.post(`/organisations/${organisationId}/payroll/runs/${id}/approve`).then((r) => r.data.data as PayrollRun);

export const payPayrollRun = (organisationId: string, id: string) =>
  api.post(`/organisations/${organisationId}/payroll/runs/${id}/pay`).then((r) => r.data.data as PayrollRun);

export const lockPayrollRun = (organisationId: string, id: string) =>
  api.post(`/organisations/${organisationId}/payroll/runs/${id}/lock`).then((r) => r.data.data as PayrollRun);

export const downloadPaymentFile = (organisationId: string, id: string) =>
  api.get(`/organisations/${organisationId}/payroll/runs/${id}/payment-file`, { responseType: 'blob' });

// Loans
export const listLoans = (organisationId: string, employeeId: string) =>
  api.get(`/organisations/${organisationId}/payroll/employees/${employeeId}/loans`).then((r) => r.data.data as EmployeeLoan[]);

export const createLoan = (
  organisationId: string,
  employeeId: string,
  data: { description: string; principalAmount: number; instalmentAmount: number; startDate: string; glAccountId?: string },
) =>
  api.post(`/organisations/${organisationId}/payroll/employees/${employeeId}/loans`, data).then((r) => r.data.data as EmployeeLoan);

export const updateLoan = (
  organisationId: string,
  employeeId: string,
  loanId: string,
  data: { status?: LoanStatus; instalmentAmount?: number; balance?: number },
) =>
  api.patch(`/organisations/${organisationId}/payroll/employees/${employeeId}/loans/${loanId}`, data).then((r) => r.data.data as EmployeeLoan);

// Legacy journal-based
export const processPayroll = (organisationId: string, data: object) =>
  api.post(`/organisations/${organisationId}/payroll`, data).then((r) => r.data.data);

export const listPayrollEntries = (organisationId: string, params?: { page?: number; pageSize?: number }) =>
  api.get(`/organisations/${organisationId}/payroll`, { params: { pageSize: 50, ...params } }).then((r) => ({
    entries: r.data.data,
    total:   r.data.pagination?.total ?? 0,
  }));

// ─── Reports ────────────────────────────────────────────────────────────────

export interface PayrollReportMeta {
  type: 'run' | 'period';
  runNumber?: string;
  description?: string;
  paymentDate?: string;
  status?: string;
  year?: number;
  month?: number | null;
}

export type ReportRow = Record<string, string | number | boolean>;

export interface PayrollReport {
  meta: PayrollReportMeta;
  rows: ReportRow[];
  totals: Record<string, number | boolean>;
}

export interface PayrollGlReport {
  meta: PayrollReportMeta;
  lines: { account: string; description: string; debit: number; credit: number }[];
  totals: { totalDebit: number; totalCredit: number; balanced: boolean };
}

export interface ReportParams {
  runId?: string;
  year?: number;
  month?: number;
  departmentId?: string;
  employeeId?: string;
}

const reportGet = <T>(organisationId: string, path: string, params: ReportParams) =>
  api.get(`/organisations/${organisationId}/payroll/reports/${path}`, { params }).then((r) => r.data.data as T);

export const reportRegister     = (orgId: string, p: ReportParams) => reportGet<PayrollReport>(orgId, 'register', p);
export const reportStatutory    = (orgId: string, p: ReportParams) => reportGet<PayrollReport>(orgId, 'statutory', p);
export const reportBank         = (orgId: string, p: ReportParams) => reportGet<PayrollReport>(orgId, 'bank', p);
export const reportDepartment   = (orgId: string, p: ReportParams) => reportGet<PayrollReport>(orgId, 'department', p);
export const reportEmployeeYtd  = (orgId: string, p: ReportParams) => reportGet<PayrollReport>(orgId, 'employee-ytd', p);
export const reportGlSummary    = (orgId: string, p: ReportParams) => reportGet<PayrollGlReport>(orgId, 'gl-summary', p);
