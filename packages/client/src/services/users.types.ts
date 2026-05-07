export type UserRole =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'FINANCE_MANAGER'
  | 'ACCOUNTANT'
  | 'ACCOUNTS_PAYABLE_CLERK'
  | 'ACCOUNTS_RECEIVABLE_CLERK'
  | 'AUDITOR'
  | 'APPROVER'
  | 'REPORT_VIEWER';

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Org Admin',
  FINANCE_MANAGER: 'Finance Manager',
  ACCOUNTANT: 'Accountant',
  ACCOUNTS_PAYABLE_CLERK: 'AP Clerk',
  ACCOUNTS_RECEIVABLE_CLERK: 'AR Clerk',
  AUDITOR: 'Auditor',
  APPROVER: 'Approver',
  REPORT_VIEWER: 'Report Viewer',
};

export const ASSIGNABLE_ROLES: UserRole[] = [
  'ORG_ADMIN',
  'FINANCE_MANAGER',
  'ACCOUNTANT',
  'ACCOUNTS_PAYABLE_CLERK',
  'ACCOUNTS_RECEIVABLE_CLERK',
  'AUDITOR',
  'APPROVER',
  'REPORT_VIEWER',
];
