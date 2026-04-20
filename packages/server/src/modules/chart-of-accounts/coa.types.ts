import { AccountClass, AccountType } from '@prisma/client';

export interface AccountTemplateEntry {
  code: string;
  name: string;
  description?: string;
  class: AccountClass;
  subClass?: string;
  type: AccountType;
  parentCode: string | null;
  isControlAccount?: boolean;
  isBankAccount?: boolean;
  isLocked?: boolean;
  currency?: string;
  level: number;
}

export interface CoaTemplate {
  name: string;
  description: string;
  industry: string;
  accounts: AccountTemplateEntry[];
}

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  class: AccountClass;
  subClass: string | null;
  type: AccountType;
  parentId: string | null;
  isControlAccount: boolean;
  isBankAccount: boolean;
  isActive: boolean;
  isLocked: boolean;
  level: number;
  children: AccountNode[];
}
