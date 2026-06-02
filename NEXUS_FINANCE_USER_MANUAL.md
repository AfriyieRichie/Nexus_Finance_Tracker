# NEXUS FINANCE TRACKER
## Functional & User Manual
### Version 1.0 — May 2026

---

> **Confidential — For Authorised Users Only**
> This document contains proprietary information about the Nexus Finance Tracker system. Reproduction or distribution without written consent is prohibited.

---

# TABLE OF CONTENTS

1. [Introduction & System Overview](#1-introduction--system-overview)
2. [Getting Started](#2-getting-started)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Organisation Setup & Settings](#4-organisation-setup--settings)
5. [Chart of Accounts](#5-chart-of-accounts)
6. [Accounting Periods](#6-accounting-periods)
7. [Journal Entries & General Ledger](#7-journal-entries--general-ledger)
8. [Accounts Receivable (AR)](#8-accounts-receivable-ar)
9. [Accounts Payable (AP)](#9-accounts-payable-ap)
10. [Bank Reconciliation](#10-bank-reconciliation)
11. [Fixed Assets](#11-fixed-assets)
12. [Inventory Management](#12-inventory-management)
13. [Budgets & Cost Centres](#13-budgets--cost-centres)
14. [Payroll](#14-payroll)
15. [Tax Management](#15-tax-management)
16. [Approval Workflows](#16-approval-workflows)
17. [Financial Reports](#17-financial-reports)
18. [Audit Trail](#18-audit-trail)
19. [Dashboard & Analytics](#19-dashboard--analytics)
20. [System Administration](#20-system-administration)
21. [Glossary of Terms](#21-glossary-of-terms)
22. [Appendix A — Account Type Reference](#appendix-a--account-type-reference)
23. [Appendix B — Keyboard Shortcuts & Tips](#appendix-b--keyboard-shortcuts--tips)
24. [Appendix C — Error Messages & Troubleshooting](#appendix-c--error-messages--troubleshooting)

---

# 1. INTRODUCTION & SYSTEM OVERVIEW

## 1.1 About Nexus Finance Tracker

Nexus Finance Tracker is an enterprise-grade, cloud-hosted financial management system designed to serve the complete accounting and financial reporting needs of modern organisations. Built on International Financial Reporting Standards (IFRS) and International Accounting Standards (IAS), the system provides a unified platform for managing every aspect of an organisation's financial life — from day-to-day bookkeeping through to statutory reporting.

The system is built as a **multi-tenant, multi-currency, multi-organisation** platform, meaning a single deployment can serve multiple independent organisations simultaneously, each with complete data isolation, their own chart of accounts, their own user base, and their own reporting calendar.

## 1.2 Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Double-Entry Accounting** | Every financial transaction is recorded with balanced debits and credits. The system enforces this at all entry points. |
| **Period Control** | Financial periods are explicitly managed. Once a period is closed and locked, no posting can alter it, preserving the integrity of historical statements. |
| **Segregation of Duties** | The role-based access control (RBAC) model ensures that the person who creates a transaction cannot also be the one who approves and posts it. |
| **Auditability** | Every action in the system — from a password change to a journal reversal — is recorded in an immutable audit trail. |
| **IFRS Compliance** | Financial statements are presented in accordance with IAS 1 (Presentation of Financial Statements), IAS 2 (Inventories), IAS 16 (Property, Plant and Equipment), IAS 36 (Impairment of Assets), and related standards. |
| **Ghana Statutory Compliance** | Payroll module is pre-configured with Ghana Revenue Authority (GRA) PAYE tax bands, SSNIT contribution rates, and bonus tax treatment. |

## 1.3 Module Overview

Nexus Finance Tracker is organised into the following functional modules:

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEXUS FINANCE TRACKER                       │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  General     │  Receivables │  Payables    │  Banking           │
│  Ledger      │  (AR)        │  (AP)        │  Reconciliation    │
├──────────────┼──────────────┼──────────────┼────────────────────┤
│  Fixed       │  Inventory   │  Payroll     │  Budgets &         │
│  Assets      │  Management  │              │  Cost Centres      │
├──────────────┼──────────────┼──────────────┼────────────────────┤
│  Tax &       │  Approval    │  Financial   │  Audit &           │
│  Compliance  │  Workflows   │  Reports     │  Security          │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

## 1.4 Technical Access

Nexus Finance Tracker is accessible via any modern web browser. No local installation is required.

- **Live System URL:** `https://nexus-finance-tracker-client.vercel.app/login`
- **Supported Browsers:** Google Chrome (v100+), Mozilla Firefox (v100+), Microsoft Edge (v100+), Safari (v15+)
- **Screen Resolution:** Minimum 1280 × 720 pixels recommended
- **Internet Connection:** Required at all times (cloud-hosted system)

---

# 2. GETTING STARTED

## 2.1 Logging In

1. Navigate to the system URL in your web browser.
2. On the **Login** page, enter your **Email Address** and **Password**.
3. Click **Sign In**.

### First-Time Login

If this is your first login and an administrator has set up your account with a temporary password, you will be redirected to a **Change Password** page immediately after login. You must set a new, personal password before proceeding.

**Password Requirements:**
- Minimum 8 characters
- Must contain at least one uppercase letter
- Must contain at least one lowercase letter
- Must contain at least one number
- Must contain at least one special character

### Failed Login Attempts

If you enter the wrong password **five consecutive times**, your account will be automatically locked. Contact your Organisation Administrator to unlock your account.

### Session Management

- Sessions are maintained using secure, short-lived access tokens that automatically refresh.
- You will be automatically logged out after a period of inactivity.
- To log out, click your user avatar in the top-right corner and select **Sign Out**.
- Selecting **Sign Out All Devices** will terminate all active sessions across all browsers and devices.

## 2.2 Navigating the System

Upon successful login, you are presented with the **Dashboard**. The main navigation sidebar on the left provides access to all modules based on your assigned role.

### Sidebar Navigation

| Icon | Module |
|------|--------|
| Dashboard | Real-time financial overview |
| Journals | General ledger journal entries |
| Accounts | Chart of accounts management |
| Receivables | Customer invoices and payments |
| Payables | Supplier invoices and payments |
| Bank | Bank reconciliation |
| Assets | Fixed asset register |
| Inventory | Stock management |
| Payroll | Employee payroll processing |
| Budgets | Budget management |
| Tax | VAT and tax compliance |
| Approvals | Approval requests and workflows |
| Reports | Financial statements |
| Audit | Audit trail and logs |
| Settings | Organisation and system settings |

### Organisation Selector

If you belong to more than one organisation (multi-tenancy), you can switch between organisations using the **Organisation Selector** at the top of the sidebar. All data is strictly scoped to the currently selected organisation.

## 2.3 Common Interface Elements

### Action Buttons

| Button Style | Meaning |
|-------------|---------|
| **Primary (filled)** | Main action for the current screen |
| **Outline** | Secondary action |
| **Destructive (red)** | Irreversible or delete action — confirm carefully |
| **Ghost** | Tertiary action, minimal styling |

### Status Badges

Throughout the system, coloured badges indicate the status of records:

| Colour | Meaning |
|--------|---------|
| Green | Active / Posted / Approved / Paid |
| Orange/Amber | Pending / Draft / Pending Approval |
| Blue | Submitted |
| Red | Rejected / Overdue / Destructive action |
| Grey | Inactive / Cancelled / Reversed |

### Pagination and Search

Most list screens support:
- **Search** — Type in the search box to filter records in real time.
- **Pagination** — Use Next/Previous buttons or page numbers to navigate large data sets.
- **Filters** — Use dropdown filters to narrow by status, type, date, or category.

---

# 3. USER ROLES & PERMISSIONS

## 3.1 Role Hierarchy

Nexus Finance Tracker implements a nine-tier role-based access control (RBAC) system. Roles are assigned per user per organisation — a user may be an `ACCOUNTANT` in one organisation and a `REPORT_VIEWER` in another.

```
SUPER_ADMIN
    └── ORG_ADMIN
            └── FINANCE_MANAGER
                    ├── APPROVER
                    ├── ACCOUNTANT
                    │       ├── ACCOUNTS_PAYABLE_CLERK
                    │       └── ACCOUNTS_RECEIVABLE_CLERK
                    ├── AUDITOR
                    └── REPORT_VIEWER
```

## 3.2 Role Descriptions and Permissions

### SUPER_ADMIN
Reserved for platform administrators. Can manage all organisations and platform-level settings. Not relevant to individual organisation users.

### ORG_ADMIN — Organisation Administrator
The highest role within an organisation. Full access to all functions.

**Exclusive Capabilities:**
- Create and manage user accounts
- Assign and change user roles
- Lock/unlock accounting periods
- Perform year-end close
- Delete accounts from the chart of accounts
- Unlock locked bank reconciliations
- Approve budgets

### FINANCE_MANAGER
Responsible for the overall financial integrity of the books. Can post and reverse journal entries.

**Key Capabilities:**
- Post journal entries to the general ledger
- Reverse posted journal entries
- Manage the chart of accounts (create/edit, but not delete)
- Approve and reject inventory movements
- Run and approve depreciation
- Post stocktake variances
- Approve and configure approval workflows
- Close accounting periods (but not lock them)
- Manage bank accounts and confirm reconciliations

### APPROVER
Designated to review and authorise transactions submitted for approval. Can approve or reject requests assigned to them via approval workflows.

**Key Capabilities:**
- View and action approval requests
- Approve or reject journal entries, invoices, payroll runs
- Delegate approval authority
- View notifications

### ACCOUNTANT
Handles day-to-day transaction entry. Creates journal entries, movements, and invoices but cannot post them without approval.

**Key Capabilities:**
- Create and edit journal entries (in DRAFT status)
- Submit transactions for approval
- Create inventory movements (RECEIPT, ISSUE)
- Record AR payments and credit notes
- Record AP payments
- Create and update stocktake counts

### ACCOUNTS_PAYABLE_CLERK
Specialist role focused on supplier invoice processing and payment.

**Key Capabilities:**
- Manage supplier master data
- Create supplier invoices
- Record supplier payments
- View AP ageing report

### ACCOUNTS_RECEIVABLE_CLERK
Specialist role focused on customer invoicing and collections.

**Key Capabilities:**
- Manage customer master data
- Create customer invoices
- Record customer payments
- Create credit notes
- View and email customer statements
- View AR ageing report

### AUDITOR
Read-only access to the audit trail and all financial records for compliance and audit purposes. Cannot create or modify any records.

**Key Capabilities:**
- View all audit log entries
- Export audit logs to CSV
- View all journals, ledger, reports (read-only)

### REPORT_VIEWER
Lowest access level. Can view all financial reports and records but cannot create or modify anything.

**Key Capabilities:**
- View financial statements (Balance Sheet, Income Statement, Cash Flow, Changes in Equity)
- View chart of accounts, trial balance, ledger
- View inventory valuation, budget variance reports

## 3.3 Permission Quick Reference

| Function | REPORT_VIEWER | ACCOUNTANT | APPROVER | FINANCE_MANAGER | ORG_ADMIN |
|----------|:---:|:---:|:---:|:---:|:---:|
| View reports & ledger | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create journal entries | — | ✓ | — | ✓ | ✓ |
| Approve journal entries | — | — | ✓ | ✓ | ✓ |
| Post to ledger | — | — | — | ✓ | ✓ |
| Reverse journals | — | — | — | ✓ | ✓ |
| Manage accounts (CoA) | — | — | — | ✓ | ✓ |
| Delete accounts | — | — | — | — | ✓ |
| Manage users | — | — | — | — | ✓ |
| Lock periods | — | — | — | — | ✓ |
| Approve budgets | — | — | — | — | ✓ |
| View audit trail | — | — | — | — | ✓ (AUDITOR) |

---

# 4. ORGANISATION SETUP & SETTINGS

## 4.1 Creating an Organisation

When you first register on Nexus Finance Tracker, you are prompted to create your first organisation.

**Required Information:**
- **Organisation Name** — Legal trading name
- **Base Currency** — The primary reporting currency (e.g., GHS, USD, EUR). This cannot be changed after transactions have been posted.
- **Fiscal Year Start Month** — The month your financial year begins (e.g., January = 1, April = 4)

**Optional Information:**
- Registration Number (company registration)
- Tax ID / TIN
- VAT Registration Number
- Address (street, city, country)
- Phone, Email, Website
- Industry
- Company Logo

> **Important:** The Base Currency is the cornerstone of all financial reporting. Ensure it is set correctly before any transactions are entered. Changing it after postings requires full re-reporting of historical data.

## 4.2 Updating Organisation Details

Navigate to **Settings** → **Organisation** to update your organisation's profile at any time. All changes are recorded in the audit trail.

## 4.3 Initial Setup Checklist

Before using the system for live transactions, complete the following setup steps in order:

| Step | Task | Where |
|------|------|-------|
| 1 | Set up the Chart of Accounts | Accounts module |
| 2 | Create the first Fiscal Year (12 periods) | Settings → Periods |
| 3 | Set up Approval Workflows | Approvals → Workflows |
| 4 | Configure Tax Codes | Tax → Tax Codes |
| 5 | Set up Bank Accounts | Bank → Accounts |
| 6 | Configure Inventory Locations (if applicable) | Inventory → Setup |
| 7 | Set up Fixed Asset Categories (if applicable) | Assets → Categories |
| 8 | Configure Payroll (if applicable) | Payroll → Configuration |
| 9 | Create User Accounts and assign roles | Settings → Users |
| 10 | Enter Opening Balances | Journals → New Entry (OPENING_BALANCE type) |

---

# 5. CHART OF ACCOUNTS

## 5.1 Overview

The Chart of Accounts (CoA) is the backbone of the accounting system. It is the complete listing of every account used to record financial transactions. In Nexus Finance Tracker, the CoA is hierarchical — accounts can be grouped under parent accounts for financial statement presentation.

## 5.2 Account Structure

Every account has the following attributes:

| Attribute | Description |
|-----------|-------------|
| **Account Code** | Unique numeric or alphanumeric code (e.g., 100100) |
| **Account Name** | Descriptive name (e.g., "Cash at Bank — GCB") |
| **Class** | Top-level classification: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE |
| **Type** | Detailed type within the class (see Appendix A) |
| **Parent Account** | Optional — groups this account under a control account |
| **Currency** | Account currency (defaults to organisation base currency) |
| **Tax Rate** | Default VAT rate for this account, if applicable |
| **Is Control Account** | If checked, direct journal posting is prohibited; only sub-accounts can be posted to |
| **Is Active** | Inactive accounts cannot receive new postings |
| **Is Locked** | Locked accounts cannot be modified and cannot receive postings |

## 5.3 Account Classes and Normal Balances

| Class | Normal Balance | Increases With | Decreases With |
|-------|----------------|----------------|----------------|
| ASSET | Debit | Debit | Credit |
| LIABILITY | Credit | Credit | Debit |
| EQUITY | Credit | Credit | Debit |
| REVENUE | Credit | Credit | Debit |
| EXPENSE | Debit | Debit | Credit |

## 5.4 Creating an Account

1. Navigate to **Accounts** in the sidebar.
2. Click **New Account**.
3. Complete the required fields:
   - Account Code (must be unique within the organisation)
   - Account Name
   - Class and Type
4. Optionally, set a Parent Account, Currency, and Tax Rate.
5. Click **Save**.

> **Tip:** Use a consistent numbering convention. A common convention for Ghanaian entities:
> - 1xxxxx — Assets
> - 2xxxxx — Liabilities
> - 3xxxxx — Equity
> - 4xxxxx — Revenue
> - 5xxxxx — Cost of Sales
> - 6xxxxx — Operating Expenses

## 5.5 Importing a Chart of Accounts Template

To speed up setup, the system provides pre-built chart of accounts templates for common business types:

1. Navigate to **Accounts**.
2. Click **Import Template**.
3. Select a template: **Retail**, **Technology**, **Services**, or **Agriculture**.
4. Review the preview and click **Import**.

> **Warning:** Importing a template will add accounts to your existing chart. It does not delete existing accounts. If you have already created accounts manually, review for duplicates after import.

## 5.6 Account Hierarchy and Control Accounts

Control accounts act as summary nodes in the hierarchy. For example:

```
1100 — Current Assets (Control)
    1110 — Cash (Control)
        1111 — Petty Cash
        1112 — Cash at Bank — GCB
    1120 — Accounts Receivable (Control)
        1121 — Trade Receivables
        1122 — Other Receivables
```

Direct posting is only allowed to **leaf accounts** (accounts with no children and not marked as control accounts). The system will prevent you from posting directly to a control account.

## 5.7 Viewing the Account Hierarchy

Navigate to **Accounts** → **Hierarchy View** to see the full tree structure of your chart of accounts with balances at each level.

## 5.8 Checking an Account Balance

1. Navigate to **Accounts**.
2. Click on an account to open its detail page.
3. Click **View Balance** to get the current balance as of today, or select a specific date.

## 5.9 Editing and Deactivating Accounts

- **Edit:** Click the pencil icon next to any account. You may update the name, parent, type, and associated settings. You cannot change the account code after transactions have been posted.
- **Deactivate:** Toggle **Is Active** to off. The account remains in the system for historical reporting but cannot receive new postings.
- **Delete:** Only ORG_ADMIN users can delete accounts. An account can only be deleted if it has no posted transactions. If it has transactions, deactivate it instead.

---

# 6. ACCOUNTING PERIODS

## 6.1 Overview

The accounting period system controls when transactions can and cannot be posted. Before any transaction can be entered, at least one accounting period must exist and be in OPEN status.

## 6.2 Period Status Workflow

```
OPEN  ──→  CLOSED  ──→  LOCKED
            ↑
      (Can reopen)
```

| Status | Description |
|--------|-------------|
| **OPEN** | Transactions can be posted to this period. |
| **CLOSED** | No new transactions. Can be reopened by ORG_ADMIN. |
| **LOCKED** | Permanently sealed. Cannot be reopened. Audit-compliant. |

## 6.3 Creating a Fiscal Year

A fiscal year creates all 12 monthly periods at once.

1. Navigate to **Settings** → **Periods**.
2. Click **Create Fiscal Year**.
3. Enter the fiscal year number (e.g., 2026).
4. Enter the start date of the first period.
5. Click **Create**.

The system will automatically create 12 periods aligned to your organisation's fiscal year start month.

> **Example:** If your fiscal year starts in April, periods will be April 2026 through March 2027, all labelled with their respective months.

## 6.4 Closing a Period

At month-end, after all transactions have been posted and reviewed:

1. Navigate to **Settings** → **Periods**.
2. Find the period to close.
3. Click **Close Period**.
4. Confirm the action.

Closing a period prevents any new postings from that date range. The period can be reopened if required.

## 6.5 Locking a Period

Locking is irreversible and should only be done after:
- All month-end journals are posted and approved
- Bank reconciliation is complete and confirmed
- Financial statements have been reviewed and signed off

1. Navigate to **Settings** → **Periods**.
2. Click **Lock Period** on a closed period.
3. Only ORG_ADMIN can perform this action.

> **Warning:** A locked period cannot be unlocked. Any correction to a locked period must be made in the current open period as an adjusting entry.

## 6.6 Year-End Close

Year-end close is the process of finalising a fiscal year's accounts and carrying forward retained earnings.

1. Navigate to **Settings** → **Periods**.
2. Click **Year-End Close**.
3. Select the fiscal year to close.
4. The system will:
   - Lock all periods in the fiscal year
   - Post a CLOSING journal to transfer net income/loss to Retained Earnings
   - Reset revenue and expense accounts to zero for the new year

> **Note:** Year-end close requires ORG_ADMIN permission and cannot be reversed. Ensure all financial statements have been finalised before proceeding.

## 6.7 Reopening a Period

If a closed (but not locked) period needs to be re-opened for corrections:

1. Navigate to **Settings** → **Periods**.
2. Find the closed period.
3. Click **Reopen Period** and enter the reason.
4. The period returns to OPEN status.

---

# 7. JOURNAL ENTRIES & GENERAL LEDGER

## 7.1 Overview

The General Ledger is the complete record of all financial transactions in the organisation. Every financial event — whether a sale, a payment, a depreciation charge, or a payroll run — is ultimately recorded as a journal entry with balanced debits and credits.

## 7.2 Journal Types

Nexus Finance Tracker supports 12 journal types, each representing a distinct category of financial activity:

| Type | Description | Typical Use |
|------|-------------|-------------|
| **GENERAL** | General-purpose entries | Ad-hoc adjustments, corrections |
| **SALES** | Revenue recognition | Auto-posted from AR invoices |
| **PURCHASE** | Purchases recording | Auto-posted from AP invoices |
| **CASH_RECEIPT** | Cash received | Customer payments |
| **CASH_PAYMENT** | Cash disbursed | Supplier payments |
| **BANK** | Bank transactions | Bank reconciliation items |
| **PAYROLL** | Payroll postings | Auto-posted from payroll runs |
| **DEPRECIATION** | Asset depreciation | Auto-posted from depreciation runs |
| **ADJUSTMENT** | Inventory or balance adjustments | Inventory retroactive GL, revaluations |
| **REVERSAL** | Reversing entries | Auto-created when reversing a posted entry |
| **OPENING_BALANCE** | Opening balances | Initial setup entries |
| **CLOSING** | Year-end closing | Auto-posted by year-end close |

## 7.3 Journal Entry Workflow

All journal entries go through a defined status lifecycle:

```
DRAFT  ──→  PENDING_APPROVAL  ──→  APPROVED  ──→  POSTED
  ↑                  │                  │
  └──── REJECTED ────┘                  └──→  REVERSED
```

| Status | Description |
|--------|-------------|
| **DRAFT** | Entry is being prepared. Can be edited or deleted. |
| **PENDING_APPROVAL** | Submitted to approvers. Cannot be edited. |
| **APPROVED** | Approved by all required approvers. Ready to post. |
| **POSTED** | Posted to the general ledger. Cannot be edited. |
| **REJECTED** | Rejected by an approver. Returns to DRAFT for correction. |
| **REVERSED** | A POSTED entry that has been reversed by a reversing entry. |

## 7.4 Creating a Journal Entry

1. Navigate to **Journals** in the sidebar.
2. Click **New Journal Entry**.
3. Complete the **Header** section:
   - **Type** — Select the journal type (default: GENERAL)
   - **Date** — Transaction date (must fall within an open period)
   - **Accounting Period** — Automatically selected based on date, or manually override
   - **Reference** — Optional external reference (e.g., cheque number, invoice number)
   - **Description** — Brief description of the transaction (required)
   - **Currency** — Defaults to organisation base currency; change for foreign currency entries
   - **Exchange Rate** — Required for foreign currency entries
4. Add **Journal Lines** (minimum 2):
   - For each line, select the **Account**
   - Enter either a **Debit** or **Credit** amount (not both)
   - Optionally add a line description, tax code, cost centre, or department
5. The **totals** at the bottom must be balanced (Total Debits = Total Credits).
6. Click **Save as Draft** to save without submitting, or **Submit for Approval** to send directly.

> **Rule:** Every journal entry must be balanced. The system will not allow you to save or submit an unbalanced entry.

## 7.5 Multi-Currency Journal Entries

For transactions in a currency other than your base currency:

1. Select the **Currency** in the journal header.
2. Enter the **Exchange Rate** (units of base currency per 1 unit of foreign currency).
3. Enter line amounts in the **foreign currency**.
4. The system automatically calculates the base currency equivalent for each line.

> **Example:** If your base currency is GHS and you record a USD transaction:
> - Currency: USD, Exchange Rate: 15.50 (15.50 GHS per 1 USD)
> - A line of USD 1,000 debit becomes GHS 15,500 debit in the base currency ledger.

## 7.6 Submitting a Journal for Approval

1. Open the journal entry (status: DRAFT).
2. Review all lines for accuracy.
3. Click **Submit for Approval**.
4. The entry status changes to **PENDING_APPROVAL** and assigned approvers are notified.

## 7.7 Approving a Journal Entry

As an **APPROVER** or **FINANCE_MANAGER**:

1. Navigate to **Approvals** → **Pending Requests**, or open the notification.
2. Open the journal entry.
3. Review the entry details and all supporting lines.
4. Click **Approve** to advance it, or **Reject** to return it to the creator with comments.

## 7.8 Posting a Journal Entry

Once a journal entry is **APPROVED**, it can be posted to the general ledger.

1. Open the approved journal entry.
2. Click **Post to Ledger**.
3. Confirm the action.
4. The entry status changes to **POSTED** and the balances in all affected accounts are immediately updated.

> **Only FINANCE_MANAGER and ORG_ADMIN can post journal entries to the ledger.**

## 7.9 Reversing a Posted Journal Entry

If a posted journal entry contains an error, you cannot delete or edit it. Instead, create a reversing entry:

1. Open the POSTED journal entry.
2. Click **Reverse**.
3. Enter:
   - **Reversal Date** — The date the reversal will be effective
   - **Period** — The accounting period for the reversal
   - **Description** — Optional note explaining the reversal
4. Click **Create Reversal**.
5. The system creates a new journal entry of type REVERSAL with debits and credits swapped, and marks the original entry as REVERSED.

## 7.10 Viewing the General Ledger

### Trial Balance

The Trial Balance shows all accounts with their total debits, credits, and closing balance for a selected period.

1. Navigate to **Accounts** → **Trial Balance**.
2. Select the period.
3. The trial balance is displayed with opening balance, period movements, and closing balance per account.

### Account Ledger

To view all transactions for a specific account:

1. Navigate to **Accounts** → click on an account.
2. Click **View Ledger**.
3. Use date filters to narrow the range.
4. Each line shows: Date, Journal Number, Description, Debit, Credit, Running Balance.

### Ledger Summary

To view a period-level summary of all accounts:

1. Navigate to **Journals** → **Ledger Summary**.
2. Select a period.
3. The system shows total debits, credits, and net movement per account for the period.

## 7.11 Journal Numbering

Journal entries are automatically numbered using the format: **JE-YYYY-NNNNN**

- **YYYY** — The calendar year of the entry date
- **NNNNN** — A sequential 5-digit number, unique per organisation per year

> **Example:** JE-2026-00047 is the 47th journal entry dated in 2026.

---

# 8. ACCOUNTS RECEIVABLE (AR)

## 8.1 Overview

The Accounts Receivable module manages all money owed to your organisation by customers — from initial invoice creation through payment collection and bad debt management.

## 8.2 Customer Master Data

### Creating a Customer

1. Navigate to **Receivables** → **Customers**.
2. Click **New Customer**.
3. Complete the required fields:
   - **Customer Code** — Unique identifier (e.g., CUST-001)
   - **Name** — Legal or trading name
   - **Email** — Contact email
4. Complete optional fields:
   - Phone, address, tax ID/VAT number
   - Payment terms (e.g., Net 30)
   - Credit limit
5. Click **Save**.

### Managing Customers

- **Edit:** Click a customer to open and edit their details.
- **Deactivate:** Toggle the status to inactive when a customer relationship ends. Past transactions remain intact.
- **View Statement:** Click **View Statement** on any customer to see their transaction history and outstanding balance.

## 8.3 Customer Invoices

### Creating an Invoice

1. Navigate to **Receivables** → **Invoices**.
2. Click **New Invoice**.
3. Select the **Customer**.
4. Set the **Invoice Date** and **Due Date**.
5. Select the **Accounting Period**.
6. Add line items:
   - Description, Account, Quantity, Unit Price
   - Tax code (if applicable — the system auto-calculates VAT)
7. Review the total.
8. Click **Save as Draft** or **Submit for Approval**.

### Invoice Workflow

```
DRAFT  ──→  PENDING_APPROVAL  ──→  APPROVED  ──→  SENT  ──→  PARTIALLY_PAID  ──→  PAID
                                                              ↓
                                                          OVERDUE
```

- **SENT** — Invoice has been communicated to the customer
- **PARTIALLY_PAID** — Some payment has been received
- **PAID** — Fully settled
- **OVERDUE** — Past due date with unpaid balance
- **VOID** — Cancelled invoice (replaced by a credit note)

### Posting an Invoice to the General Ledger

When an approved invoice is posted, the system automatically creates a SALES journal entry:
- **Debit:** Accounts Receivable (trade debtors)
- **Credit:** Revenue account(s) as specified on the invoice lines
- **Credit:** VAT/Tax Payable (if applicable)

## 8.4 Recording Customer Payments

1. Navigate to **Receivables** → **Invoices** → open the invoice.
2. Click **Record Payment**.
3. Enter:
   - Payment Date
   - Amount received
   - Payment method reference (cheque number, bank transfer ref)
4. Click **Save**.

For **partial payments**, enter the amount actually received. The invoice status changes to PARTIALLY_PAID and the outstanding balance is updated.

### GL Posting of Payments

Recording a payment automatically posts a CASH_RECEIPT journal:
- **Debit:** Bank / Cash account
- **Credit:** Accounts Receivable

## 8.5 Credit Notes

A credit note is issued to reduce a customer's balance — for returns, allowances, or disputes.

1. Navigate to **Receivables** → **Credit Notes**.
2. Click **New Credit Note**.
3. Select the customer and the original invoice (if applicable).
4. Enter the lines being credited.
5. Post the credit note.

**GL Posting:**
- **Debit:** Revenue account (reversal of the original sale)
- **Credit:** Accounts Receivable

## 8.6 Bad Debt Write-Offs

When a receivable is deemed uncollectable:

1. Open the invoice.
2. Click **Write Off**.
3. Select the Bad Debt Expense account.
4. Enter the amount being written off.
5. Confirm.

**GL Posting:**
- **Debit:** Bad Debt Expense
- **Credit:** Accounts Receivable

## 8.7 AR Ageing Report

The AR Ageing Report shows all outstanding customer balances categorised by how long they have been outstanding:

1. Navigate to **Receivables** → **Ageing**.
2. The report shows each customer's balance in buckets:
   - **Current** (not yet due)
   - **1–30 days** overdue
   - **31–60 days** overdue
   - **61–90 days** overdue
   - **90+ days** overdue
   - **Total Outstanding**

Use this report for collections management and provisioning for doubtful debts.

## 8.8 Customer Statements

A customer statement summarises all transactions with a customer over a period.

1. Open a customer record.
2. Click **View Statement**.
3. Review the statement of transactions and balance.
4. Click **Email Statement** to send it directly to the customer's email address.

---

# 9. ACCOUNTS PAYABLE (AP)

## 9.1 Overview

The Accounts Payable module manages all money owed by your organisation to suppliers, including invoice processing, payment scheduling, and AP ageing.

## 9.2 Supplier Master Data

### Creating a Supplier

1. Navigate to **Payables** → **Suppliers**.
2. Click **New Supplier**.
3. Complete required fields:
   - **Supplier Code** — Unique identifier (e.g., SUPP-001)
   - **Name** — Legal or trading name
4. Optional: phone, address, tax ID, payment terms, bank details.
5. Click **Save**.

## 9.3 Supplier Invoices

### Creating a Supplier Invoice

1. Navigate to **Payables** → **Invoices**.
2. Click **New Invoice**.
3. Select the **Supplier**.
4. Enter the **Invoice Date**, **Due Date**, and **Invoice Reference** (the supplier's invoice number).
5. Add line items (description, account, amount, tax code).
6. Click **Save** or **Post to Ledger**.

### GL Posting of Supplier Invoices

When a supplier invoice is posted:
- **Debit:** Expense or Asset account(s) per the invoice lines
- **Debit:** VAT/Tax Receivable (if applicable — input tax)
- **Credit:** Accounts Payable (trade creditors)

## 9.4 Recording Supplier Payments

1. Open the supplier invoice.
2. Click **Record Payment**.
3. Enter the payment date, amount, and reference.
4. Click **Save**.

**GL Posting:**
- **Debit:** Accounts Payable
- **Credit:** Bank / Cash account

## 9.5 AP Ageing Report

The AP Ageing Report shows all outstanding supplier balances by age:

1. Navigate to **Payables** → **Ageing**.
2. Review balances in Current, 30-day, 60-day, 90-day, and 90+ day buckets.

Use this report to prioritise payments and manage cash flow.

---

# 10. BANK RECONCILIATION

## 10.1 Overview

Bank reconciliation is the process of matching your organisation's internal ledger records with your bank's records (as shown on your bank statement). This ensures the integrity of your cash balances and identifies any discrepancies, uncleared items, or errors.

## 10.2 Setting Up Bank Accounts

Before you can reconcile, you must link your GL bank accounts to bank accounts in the reconciliation module.

1. Navigate to **Bank** → **Accounts**.
2. Click **Add Bank Account**.
3. Enter:
   - **Account Name** (e.g., "GCB Current Account")
   - **Bank Name** and **Account Number**
   - **GL Account** — Link to the corresponding Bank account in your chart of accounts
   - **Currency** — Account currency
4. Click **Save**.

## 10.3 Importing a Bank Statement

1. Navigate to **Bank** → click on a bank account.
2. Click **Import Statement**.
3. Upload your bank statement file (CSV format).
4. Enter the **Statement Date** and confirm the **Opening Balance** and **Closing Balance**.
5. Click **Import**.

The system parses the CSV and creates statement lines for each transaction.

> **Note:** If a statement for the same date already exists (e.g., from a previous partial import), the system will replace it automatically (unless it is locked).

### CSV Statement Format

Your bank statement CSV must include columns for:
- Date (YYYY-MM-DD or DD/MM/YYYY)
- Description / Narration
- Debit Amount
- Credit Amount
- Reference (optional)

## 10.4 Reconciling — Matching Transactions

After importing a statement, you are presented with two panels:

- **Left Panel:** Bank statement lines (from the imported CSV)
- **Right Panel:** Unmatched GL ledger entries for the bank account

### Automatic Matching

Click **Auto-Match** to have the system attempt to match statement lines to GL entries based on amount and date proximity. Matches are suggested but not confirmed until you review them.

### Manual Matching

1. Select a bank statement line on the left.
2. Select the corresponding GL entry on the right.
3. Click **Match**.
4. The matched pair is highlighted and removed from the unmatched pool.

### Creating a Journal from a Statement Line

If a bank statement line has no corresponding GL entry (e.g., a bank charge you haven't recorded):

1. Select the unmatched statement line.
2. Click **Create Journal**.
3. Enter the debit/credit account for the other side of the entry.
4. Select the accounting period.
5. Click **Post**.

The system creates the journal entry and automatically matches the statement line to the new entry.

## 10.5 Completing a Reconciliation

Once all statement lines are matched (or accounted for with journals):

1. Click **Confirm Reconciliation**.
2. Review the reconciliation summary:
   - Statement closing balance
   - Outstanding deposits (GL entries not yet on statement)
   - Outstanding payments (statement lines not in GL)
   - Reconciled balance
3. If the reconciled balance agrees with the GL book balance, click **Confirm**.

## 10.6 Reconciliation Summary and Report

The reconciliation summary shows:
- Total matched items
- Total unmatched statement lines
- Total unmatched GL entries
- Opening and closing balances
- Any variance

Access the report at any time via **Bank** → **Statements** → select a statement → **View Report**.

## 10.7 Locked Reconciliations

Once a reconciliation is confirmed, it is locked. No further changes can be made to the matched items. Only **ORG_ADMIN** can unlock a reconciliation for corrections.

---

# 11. FIXED ASSETS

## 11.1 Overview

The Fixed Assets module provides a complete asset register in compliance with **IAS 16 (Property, Plant and Equipment)** and **IAS 36 (Impairment of Assets)**. It manages the full lifecycle of assets from acquisition through disposal, including all depreciation methods and revaluation.

## 11.2 Asset Categories

Categories group assets with similar accounting treatment and depreciation parameters.

### Creating an Asset Category

1. Navigate to **Assets** → **Categories**.
2. Click **New Category**.
3. Enter:
   - **Name** (e.g., "Motor Vehicles", "Computer Equipment")
   - **Asset Account** — Balance sheet account for the cost
   - **Accumulated Depreciation Account** — Contra asset account
   - **Depreciation Expense Account** — P&L account for the charge
   - **Gain/Loss on Disposal Account** — P&L account for disposal results
   - **Retained Earnings Account** — Equity account used when transferring revaluation surplus to retained earnings each depreciation period (IAS 16.41)
4. Click **Save**.

## 11.3 Asset Records

### Creating an Asset

1. Navigate to **Assets** → click **New Asset**.
2. Complete the **Asset Details** section:
   - **Asset Code** — Unique identifier (e.g., VEH-001)
   - **Name / Description**
   - **Serial Number** (optional)
   - **Category** — Links to the GL accounts configured for that category
   - **Location** (optional)
3. Complete the **Financial Details** section:
   - **Acquisition Date** — Date the asset was purchased
   - **Acquisition Cost** — Original cost of the asset (capitalised value)
   - **Residual Value** — Expected value at end of useful life
   - **Useful Life (months)** — Estimated productive life
   - **Depreciation Method** — Select from four methods (see below)
   - **Reducing Balance Rate** *(optional, Reducing Balance method only)* — Annual rate as a decimal (e.g., 0.25 for 25%). If omitted, the system uses the Double Declining Balance formula.
4. Click **Save**.

### Asset Status

| Status | Description |
|--------|-------------|
| **ACTIVE** | In use and depreciating |
| **INACTIVE** | Temporarily not in use |
| **FULLY_DEPRECIATED** | Carrying amount equals residual value |
| **DISPOSED** | Asset has been sold or scrapped |

## 11.4 Depreciation Methods

### Straight-Line Method
Depreciates the asset evenly over its useful life.

**Formula:** Annual Depreciation = (Cost − Residual Value) ÷ Useful Life (years)

**Best for:** Buildings, furniture, intangibles with consistent utility.

### Reducing Balance (Diminishing Value) Method
Applies a fixed percentage to the carrying amount each period.

**Formula:** Depreciation = Carrying Amount × Rate%

**Best for:** Motor vehicles, technology assets that lose value quickly early in life.

### Sum of Years Digits (SYD)
Accelerated depreciation heavier in early years.

**Formula:** Depreciation = (Cost − Residual) × (Remaining Life ÷ Sum of All Years Digits)

**Best for:** Assets whose economic benefits are consumed more rapidly early in their life.

### Units of Production
Depreciation is proportional to actual output or usage.

**Formula:** Depreciation per Unit = (Cost − Residual) ÷ Total Estimated Units; Period Charge = Units Used × Depreciation per Unit

**Best for:** Plant and machinery, mining equipment.

## 11.5 Running Depreciation

Depreciation is run monthly, at or after period end.

1. Navigate to **Assets** → **Depreciation** → **Run Depreciation**.
2. Select the **Accounting Period**.
3. Click **Preview** to see the calculated charges without posting.
4. Review the depreciation schedule.
5. Click **Post Depreciation** to create and post the DEPRECIATION journal entry.

**GL Posting:**
- **Debit:** Depreciation Expense Account
- **Credit:** Accumulated Depreciation Account

> **Important:** Depreciation can only be run once per period per asset. Running depreciation for a period that already has a depreciation run will produce an error.

> **First-Period Proration:** For assets acquired mid-month, the first depreciation charge is automatically prorated by the number of days the asset was active in that month (IAS 16 compliant). Subsequent periods receive a full charge.

### Depreciation Schedule

To project future depreciation without posting:

1. Open the asset record.
2. Click **Depreciation Schedule**.
3. Enter the number of months to project (default: 60).
4. The system returns a period-by-period table showing projected depreciation charge, accumulated depreciation, and carrying value.

> This is a read-only projection and does **not** post any journal entries.

### Reversing Depreciation

If depreciation was incorrectly run:

1. Navigate to **Assets** → **Depreciation** → **Depreciation Runs**.
2. Find the run to reverse.
3. Click **Reverse Run**.
4. The system creates a REVERSAL journal and marks the run as reversed, allowing a corrected run.

## 11.6 Asset Disposal

When an asset is sold, scrapped, or otherwise retired:

1. Open the asset record.
2. Click **Dispose Asset**.
3. Enter:
   - **Disposal Date**
   - **Disposal Proceeds** (sale price, or 0 for scrapping)
   - **Proceeds Account** (bank account or proceeds receivable)
   - **Accounting Period**
4. Click **Post Disposal**.

**GL Posting:**
- **Debit:** Proceeds Account (for sale proceeds)
- **Debit:** Accumulated Depreciation Account (clearing the contra asset)
- **Credit:** Asset Account (removing the cost)
- **Debit/Credit:** Gain/Loss on Disposal (the balancing amount — gain if proceeds > net book value, loss if less)

## 11.7 Asset Revaluation

Under IAS 16's revaluation model, assets can be upwardly restated to fair value:

1. Open the asset record.
2. Click **Revalue**.
3. Enter:
   - **New Carrying Amount**
   - **Revaluation Date**
   - **Accounting Period**
   - **Revaluation Reserve Account** (equity account)
4. Click **Post Revaluation**.

**GL Posting (upward revaluation):**
- **Debit:** Asset Account
- **Credit:** Revaluation Reserve (equity)

## 11.8 Impairment (IAS 36)

When the recoverable amount of an asset falls below its carrying amount:

1. Open the asset record.
2. Click **Impair Asset**.
3. Enter:
   - **Recoverable Amount** — The higher of fair value less costs to sell and value in use. The system computes the impairment loss as `Carrying Value − Recoverable Amount`.
   - **Impairment Date and Period**
   - **Impairment Loss Account** (P&L)
4. Click **Post Impairment**.

**GL Posting:**
- **Debit:** Impairment Loss (P&L)
- **Credit:** Accumulated Depreciation / Asset Account (reducing the carrying amount)

## 11.9 Impairment Reversal (IAS 36.111)

If circumstances that caused an impairment loss have reversed, you can record a partial or full reversal:

1. Open the asset record.
2. Click **Reverse Impairment**.
3. Enter:
   - **Reversal Date and Period**
   - **Reversal Amount** — The amount to reverse (cannot exceed the original impairment loss, and the restored carrying value cannot exceed what it would have been had no impairment occurred)
   - **Impairment Account** (P&L account to credit the recovery)
4. Click **Post Reversal**.

**GL Posting:**
- **Debit:** Asset / Accumulated Depreciation Account (restoring carrying value)
- **Credit:** Impairment Reversal (P&L)

The reversal is recorded in `asset_impairment_reversals` and the asset's carrying value is updated.

## 11.10 Revaluation Surplus Transfer (IAS 16.41)

When an asset that has been revalued upward is subsequently depreciated, a portion of the revaluation surplus is automatically transferred to Retained Earnings each period:

- The transfer amount = `Revaluation Surplus Remaining ÷ Remaining Useful Life Periods`
- **GL Posting each depreciation period:**
  - **Debit:** Revaluation Reserve Account (equity)
  - **Credit:** Retained Earnings Account (equity)

This transfer happens automatically during the depreciation run when the asset has a `revaluationSurplusRemaining` balance and a `revaluationReserveAccountId` configured. No manual action is required.

## 11.11 Bulk Asset Import

To import multiple assets from a spreadsheet:

1. Navigate to **Assets** → **Bulk Import**.
2. Download the import template CSV.
3. Complete the template with your asset data.
4. Upload the completed file.
5. Review any validation errors.
6. Confirm the import.

---

# 12. INVENTORY MANAGEMENT

## 12.1 Overview

The Inventory module provides complete stock management in compliance with **IAS 2 (Inventories)**. It supports multiple costing methods, multi-location tracking, movement approvals, physical stocktakes, and full integration with the general ledger.

## 12.2 Setup — Categories and Locations

### Inventory Categories

1. Navigate to **Inventory** → **Setup** tab.
2. Click **New Category**.
3. Enter a name and description.
4. Save.

Categories are used to group similar stock items for reporting.

### Inventory Locations

Locations represent physical storage places (warehouses, storerooms, shelves).

1. Navigate to **Inventory** → **Setup** tab.
2. Click **New Location**.
3. Enter a name and description.
4. Save.

If no locations are created, all stock is tracked at a "default" global level.

## 12.3 Inventory Items

### Creating an Inventory Item

1. Navigate to **Inventory** → **Stock Items** tab.
2. Click **New Item**.
3. Complete required fields:
   - **SKU / Code** — Unique stock keeping unit code
   - **Name** — Descriptive name
4. Complete optional fields:
   - **Category**
   - **Unit of Measure** — pcs, kg, litre, box, carton, etc.
   - **Opening Unit Cost**
   - **Reorder Level** — Quantity that triggers a low-stock alert
   - **Reorder Quantity** — Suggested order quantity
   - **Costing Method** — FIFO, Weighted Average (AVCO), or Standard Cost
5. Complete **GL Account Links** (required for GL posting):
   - **Inventory Control Account** — Asset account where stock is valued on the balance sheet
   - **COGS / Cost of Sales Account** — Expense account for cost of goods sold
   - **Purchase Price Variance Account** *(Standard Cost only)* — Account to absorb the difference between standard and actual purchase price
6. Click **Save Item**.

> **Important:** GL Account Links must be configured before any inventory movement can be posted to the general ledger. Without these, stock balances will update but no accounting entry will be created.

### Costing Methods

| Method | Description | Best For |
|--------|-------------|---------|
| **Weighted Average (AVCO)** | Unit cost is the running average of all purchases | General merchandise, commodities |
| **FIFO** | First In, First Out — oldest costs are expensed first | Items with expiry dates, perishables |
| **Standard Cost** | A pre-set standard cost is used regardless of purchase price | Manufacturing, stable-cost items |

> **Warning:** The costing method cannot be changed once movements have been recorded on an item. To change it, you must write off existing stock and re-enter it under a new item.

## 12.4 Stock Movements

All changes to stock quantities are recorded as movements. There are eight movement types:

| Type | Direction | Approval Required | Description |
|------|-----------|-------------------|-------------|
| **RECEIPT** | In | No (auto-posted) | Goods received from a supplier |
| **ISSUE** | Out | No (auto-posted) | Goods issued for consumption or sale |
| **OPENING** | In | No (auto-posted) | Opening stock balance on system go-live |
| **ADJUSTMENT_IN** | In | **Yes** | Inventory count increase — upward correction |
| **ADJUSTMENT_OUT** | Out | **Yes** | Inventory count decrease — write-off or correction |
| **TRANSFER_IN** | In | **Yes** | Stock received from another location |
| **TRANSFER_OUT** | Out | **Yes** | Stock moved to another location |
| **STOCKTAKE_IN** | In | No (posted by stocktake) | Auto-generated by stocktake post |
| **STOCKTAKE_OUT** | Out | No (posted by stocktake) | Auto-generated by stocktake post |

### Creating a Movement

1. Navigate to **Inventory** → **Stock Items** tab.
2. Find the item and click **+ Movement**.
3. Select the movement **Type**.
4. Enter:
   - **Quantity**
   - **Unit Cost** (for inbound movements)
   - **Date**
   - **Location** (if applicable)
   - **Contra Account** (for GL posting)
   - **Accounting Period** (for GL posting)
   - **Reference** and **Description** (optional)
5. Click **Submit**.

Movements that auto-post (RECEIPT, ISSUE, OPENING) are immediately processed and their status set to POSTED. ADJUSTMENT and TRANSFER movements require FINANCE_MANAGER approval before posting.

### GL Posting of Movements

| Movement Type | Debit | Credit |
|--------------|-------|--------|
| RECEIPT | Inventory Account | Contra Account (AP or Bank) |
| ISSUE | COGS Account | Inventory Account |
| ADJUSTMENT_IN | Inventory Account | Contra Account |
| ADJUSTMENT_OUT | Contra Account | Inventory Account |

## 12.5 Retroactive GL Posting (Post GL)

If a movement was created without a Contra Account or Period (so no GL was posted at the time), you can retroactively post it:

**Pre-requisite:** The item must have an Inventory Control Account set. Edit the item via the **Edit** button on the Stock Items tab if not already set.

1. Navigate to **Inventory** → **Movements** tab.
2. Find the POSTED movement with an orange **Post GL** button (indicates no journal entry).
3. Click **Post GL**.
4. Select the **Contra Account** and **Accounting Period**.
5. Click **Post Journal**.

## 12.6 Physical Stocktake

A physical stocktake compares actual counted quantities against system quantities and posts variances as adjustments.

### Creating a Stocktake Session

1. Navigate to **Inventory** → **Stocktake** tab.
2. Click **New Stocktake**.
3. Enter:
   - **Session Name** (e.g., "Q2 2026 Full Count")
   - **Count Date**
   - **Location** (optional — leave blank for all locations)
   - **Notes**
4. Click **Create Session**.

The system takes a snapshot of all current stock quantities. These become the "system quantities" for comparison.

### Entering Physical Counts

1. Open the stocktake session.
2. Click **Enter Counts**.
3. For each item, enter the **Counted Quantity** (the actual physical count).
4. Save each line.

As counts are entered, the session status advances to COUNTING.

### Reviewing Variances

After all counts are entered, the session shows:
- **System Quantity** — What the system recorded
- **Counted Quantity** — What was physically found
- **Variance** — Difference (positive = surplus, negative = shortage)
- **Variance Value** — Financial impact at average cost

### Posting Stocktake Variances

1. Select the **Accounting Period**.
2. Click **Post Variances**.
3. The system automatically creates STOCKTAKE_IN (for surpluses) or STOCKTAKE_OUT (for shortages) movements for each item with a non-zero variance.
4. Each variance movement posts to the GL.

### Cancelling a Stocktake

If a session was started in error:
1. Open the session.
2. Click **Cancel Session** (only available for OPEN sessions).

## 12.7 Inventory Valuation Report

1. Navigate to **Inventory** → **Valuation** tab.
2. The report shows, for each stock item:
   - Quantity on Hand
   - Unit Cost (at the applicable costing method rate)
   - Total Value
3. The Grand Total represents the total inventory balance on the Balance Sheet.

> **This total should agree with the sum of all Inventory Control Accounts in the Balance Sheet.**

---

# 13. BUDGETS & COST CENTRES

## 13.1 Overview

The Budgets module enables financial planning and control. It supports multiple budget types, period-level budget lines, variance analysis against actuals, and commitment tracking (for purchase orders and contracts).

## 13.2 Cost Centres and Departments

### Cost Centres

Cost centres are organisational units used to track expenditure by responsibility area.

| Level | Description |
|-------|-------------|
| COMPANY | Highest level — whole organisation |
| DIVISION | Major business division |
| DEPARTMENT | Sub-unit of a division |
| TEAM | Smallest tracking unit |

**Creating a Cost Centre:**
1. Navigate to **Budgets** → **Cost Centres**.
2. Click **New Cost Centre**.
3. Enter name, level, and optional parent cost centre.
4. Save.

### Departments

Departments are a separate, flatter classification (not necessarily hierarchical).

**Creating a Department:**
1. Navigate to **Budgets** → **Departments**.
2. Click **New Department**.
3. Enter name and optional cost centre assignment.
4. Save.

## 13.3 Budget Types

| Type | Description |
|------|-------------|
| **ORIGINAL** | The initial annual budget, approved at the start of the year |
| **REVISED** | An amendment to the original budget, approved mid-year |
| **ROLLING_FORECAST** | A continuously updated forward-looking forecast (not a fixed annual plan) |

## 13.4 Creating a Budget

1. Navigate to **Budgets** → click **New Budget**.
2. Enter:
   - **Budget Name** (e.g., "FY2026 Annual Operating Budget")
   - **Type** — ORIGINAL, REVISED, or ROLLING_FORECAST
   - **Fiscal Year**
   - **Parent Budget** (if this is a revised version of an existing budget)
   - **Description**
3. Click **Save**.

## 13.5 Setting Budget Lines

Budget lines define the expected amount per account per period.

1. Open the budget.
2. Click **Edit Lines**.
3. For each account, enter the budgeted amount for each accounting period (monthly columns).
4. Click **Save Lines**.

### Importing Budget Lines from CSV

1. Open the budget → **Import Lines**.
2. Download the template CSV.
3. Complete: Account Code, Period, Amount.
4. Upload the completed file.

## 13.6 Copying a Budget with Uplifting

To create a new budget based on an existing one (with an inflationary adjustment):

1. Open the source budget.
2. Click **Copy Budget**.
3. Enter:
   - New budget name
   - Target fiscal year
   - Uplifting percentage (e.g., 5% for inflation)
4. Click **Copy**.

The new budget is created with all lines increased by the specified percentage.

## 13.7 Budget Approval

Budgets must be approved by ORG_ADMIN before they take effect for variance reporting.

1. Open the budget.
2. Click **Submit for Approval**.
3. The ORG_ADMIN reviews and clicks **Approve**.

## 13.8 Budget vs Actual — Variance Report

The variance report compares actual posted GL balances against budgeted amounts.

1. Open the budget.
2. Click **Variance Report**.
3. The report shows:
   - Budget amount per period
   - Actual posted amount per period
   - Variance (Actual − Budget)
   - Variance % ((Actual − Budget) ÷ Budget × 100)
   - YTD Budget, YTD Actual, YTD Variance

Items **over budget** by a configured threshold are highlighted.

## 13.9 Commitments

Commitments represent legally committed but not yet invoiced expenditure (purchase orders, signed contracts). They reduce the available budget balance.

### Creating a Commitment

1. Open a budget.
2. Navigate to **Commitments** tab.
3. Click **New Commitment**.
4. Enter:
   - Description
   - Type: PURCHASE_ORDER, REQUISITION, or CONTRACT
   - Account and Amount
   - Reference number
5. Save.

### Commitment Status

| Status | Description |
|--------|-------------|
| OPEN | Committed, no invoice received |
| PARTIALLY_INVOICED | Some invoices received |
| FULLY_INVOICED | All committed amount invoiced |
| CANCELLED | Commitment cancelled |

## 13.10 Segment Report

The segment report shows expenditure and budget allocation by cost centre and department.

1. Navigate to **Budgets** → **Segment Report**.
2. Select the period and cost centre.
3. View breakdown of actual spending vs budget by segment.

---

# 14. PAYROLL

## 14.1 Overview

The Payroll module processes employee compensation in full compliance with Ghana's statutory requirements, including **PAYE taxation** under the Ghana Revenue Authority (GRA) tax bands, **SSNIT** contributions (Tiers 1 and 2), and **bonus tax** treatment. All payroll calculations are auditable and generate GL journals.

## 14.2 Configuration

### Statutory Configuration

Before running payroll, configure the statutory rates for the tax year.

1. Navigate to **Payroll** → **Configuration** → **Statutory Config**.
2. Click **Add / Update Config** for the relevant tax year.
3. Set:
   - **Tax Year** (e.g., 2026)
   - **SSNIT Employee Rate** — Employee's SSNIT Tier 1 contribution %
   - **SSNIT Employer Rate** — Employer's SSNIT Tier 1 contribution %
   - **Tier 2 Rate** — Employer's mandatory occupational pension %
   - **PAYE Tax Bands** — Progressive income tax bands per GRA schedule
   - **Personal Relief** — Annual relief deduction per employee
4. Save.

### Salary Components

Salary components define the building blocks of employee pay.

1. Navigate to **Payroll** → **Salary Components**.
2. Click **New Component**.
3. Enter:
   - **Name** (e.g., "Housing Allowance", "Transport Allowance")
   - **Type** — Select from:
     - BASIC_SALARY
     - OVERTIME
     - BONUS
     - COMMISSION
     - ALLOWANCE
     - OTHER_EARNING
     - EMPLOYEE_DEDUCTION
     - EMPLOYER_CONTRIBUTION
   - **Is Taxable** — Whether this component is subject to PAYE
   - **GL Account** — P&L account for this component
4. Save.

## 14.3 Employee Management

### Creating an Employee

1. Navigate to **Payroll** → **Employees**.
2. Click **New Employee**.
3. Complete **Personal Details**:
   - First name, last name, email, phone
   - National ID, TIN, SSNIT Number
4. Complete **Employment Details**:
   - Job title
   - Employment type: FULL_TIME, PART_TIME, CONTRACT, CASUAL
   - Pay frequency: MONTHLY, FORTNIGHTLY, WEEKLY
   - Start date
   - Department and cost centre
5. Complete **Bank Details** (for payment):
   - Bank name, branch, account number
6. Complete **GL Details**:
   - Salary expense account
7. Click **Save**.

The system auto-generates an employee number in the format **EMP-NNNN**.

### Assigning Salary Components to Employees

1. Open the employee record.
2. Click **Add Component**.
3. Select the salary component.
4. Enter:
   - Amount or rate
   - Effective from date
   - Optional effective to date
5. Save.

An employee can have multiple components active simultaneously (e.g., Basic Salary + Housing Allowance + Transport Allowance).

### Employee Loans

1. Open the employee record.
2. Click **Loans** tab → **New Loan**.
3. Enter:
   - Loan amount
   - Monthly repayment amount
   - Start date
   - GL account (loan asset)
4. Save.

Loan repayments are automatically deducted in payroll calculations.

## 14.4 Payroll Runs

### Creating a Payroll Run

1. Navigate to **Payroll** → **Runs**.
2. Click **New Run**.
3. Select the **Period** (must be an open accounting period).
4. The system automatically calculates payslips for all active employees.

### Payroll Calculation Logic

For each employee, the payroll engine calculates:

1. **Gross Earnings** = Basic Salary + All active earning components
2. **Overtime** = Calculated per overtime configuration (fixed amount or rate-based)
3. **Total Gross** = Gross Earnings + Overtime
4. **SSNIT Employee** = Total Gross × Employee SSNIT Rate
5. **SSNIT Employer** = Total Gross × Employer SSNIT Rate
6. **Tier 2** = Total Gross × Tier 2 Rate
7. **Chargeable Income** = Total Gross − SSNIT Employee − Personal Relief
8. **PAYE Tax** = Applied progressively per GRA tax bands
9. **Other Deductions** = Loan repayments + employee deductions
10. **Net Pay** = Total Gross − SSNIT Employee − PAYE Tax − Other Deductions

### Bonus Tax

Bonuses are taxed separately under GRA rules:
- Bonus within GRA threshold: taxed at the marginal rate on bonus
- Bonus exceeding threshold: excess taxed at 35%

### Reviewing Payslips

1. Open the payroll run.
2. Click on any employee to view their payslip detail.
3. Review all components, deductions, and net pay.
4. Make overrides if necessary (e.g., one-time overtime, advance).

### Payroll Workflow

```
DRAFT  ──→  SUBMITTED  ──→  APPROVED  ──→  PAID  ──→  LOCKED
```

1. **DRAFT** — Initial calculation; payslips can be adjusted.
2. **Submit** — Send for approval. Payslips are finalised.
3. **Approve** — Authorised approver confirms the run.
4. **Pay** — Processing payment. The system posts the payroll GL journal.
5. **LOCKED** — Finalised for audit.

### GL Posting of Payroll

When a payroll run is paid, the system automatically posts a PAYROLL journal:

**Debits:**
- Salary Expense (basic salary)
- Allowance Expense (per component)
- Employer SSNIT Contribution Expense
- Employer Tier 2 Contribution Expense

**Credits:**
- Salaries Payable / Bank Account (net pay)
- PAYE Tax Payable
- SSNIT Deductions Payable (employee + employer)
- Tier 2 Payable

### Downloading the Payment File

After approval, download the payment file for your bank's bulk payment system:

1. Open the approved payroll run.
2. Click **Download Payment File**.
3. Upload to your internet banking portal for bulk processing.

---

# 15. TAX MANAGEMENT

## 15.1 Overview

The Tax module manages tax codes for transaction processing, VAT return generation, exchange rate management for multi-currency operations, and foreign currency revaluation.

## 15.2 Tax Codes

Tax codes define the VAT/withholding tax treatment for transactions.

### Creating a Tax Code

1. Navigate to **Tax** → **Tax Codes**.
2. Click **New Tax Code**.
3. Enter:
   - **Code** (e.g., "VAT-STD", "EXEMPT")
   - **Name** (e.g., "Standard Rate VAT", "Exempt Supply")
   - **Treatment**:
     - STANDARD — Taxable at the standard rate
     - ZERO_RATED — Taxable at 0% (still a VATable supply)
     - EXEMPT — Not subject to VAT
     - REVERSE_CHARGE — Customer accounts for VAT (B2B cross-border)
     - IMPORT_VAT — VAT on imports
     - WITHHOLDING — Income withholding tax
   - **Rate (%)** — The applicable tax percentage
   - **Is Inclusive** — If checked, amounts entered include the tax; if unchecked, tax is added on top
   - **GL Account** — Account for the tax balance (VAT Payable or VAT Receivable)
4. Save.

### Using Tax Codes on Transactions

Tax codes are applied at the line level on journal entries, customer invoices, and supplier invoices. When a tax code is selected:
- The system calculates the tax amount (automatically for inclusive rates, or added on top for exclusive rates)
- The tax amount posts to the tax GL account
- The net amount posts to the main account

## 15.3 Exchange Rates

### Adding an Exchange Rate

1. Navigate to **Tax** → **Exchange Rates**.
2. Click **Add Rate**.
3. Enter:
   - **From Currency** (e.g., USD)
   - **To Currency** (e.g., GHS)
   - **Rate** — Units of To Currency per 1 unit of From Currency
   - **Rate Type**: SPOT, MONTHLY_AVERAGE, or PERIOD_CLOSING
   - **Effective Date**
4. Save.

### Getting the Latest Rate

Navigate to **Tax** → **Exchange Rates** → **Latest Rates** to view the most recent rate for all currency pairs configured.

## 15.4 VAT Returns

### Generating a VAT Return

1. Navigate to **Tax** → **VAT Returns**.
2. Click **Generate Return**.
3. Select the accounting period.
4. The system aggregates all posted transactions with VAT codes in that period and generates a draft return.

### VAT Return Content

The VAT return shows:
- **Output Tax** — VAT collected from customers (taxable sales × rate)
- **Input Tax** — VAT paid to suppliers (taxable purchases × rate)
- **Net VAT Payable / Refundable** — Output minus Input

### VAT Return Status

| Status | Description |
|--------|-------------|
| DRAFT | Generated, under review |
| SUBMITTED | Submitted to tax authority |
| FILED | Filed and acknowledged |

### Deleting a VAT Return

Only DRAFT status VAT returns can be deleted. If errors are found after generating a return:
1. Delete the draft.
2. Post any correcting journals.
3. Regenerate the return.

## 15.5 FX Revaluation

At period end, foreign currency balances (bank accounts, receivables, payables) must be revalued to the closing exchange rate. This recognises unrealised foreign exchange gains and losses.

### Running an FX Revaluation

1. Navigate to **Tax** → **FX Revaluation**.
2. Click **New Revaluation**.
3. Select the **Period** and the **Closing Exchange Rate**.
4. The system calculates the revaluation adjustment for all foreign currency balances.
5. Click **Post Revaluation**.

**GL Posting:**
- **Debit/Credit:** Foreign currency asset/liability accounts (adjusting to closing rate)
- **Credit/Debit:** Foreign Exchange Gain or Loss account (P&L)

### Reversing an FX Revaluation

If an incorrect rate was used:
1. Open the revaluation.
2. Click **Reverse Revaluation**.
3. The system posts a reversing entry and marks the original as reversed.
4. Run a new revaluation with the correct rate.

---

# 16. APPROVAL WORKFLOWS

## 16.1 Overview

The Approval Workflows module implements configurable multi-level approval processes for key financial transactions. This enforces segregation of duties and provides a clear audit trail of who authorised what.

## 16.2 Workflow Configuration

### Creating an Approval Workflow

1. Navigate to **Approvals** → **Workflows**.
2. Click **New Workflow**.
3. Enter:
   - **Name** (e.g., "Journal Entry Approval")
   - **Entity Type** — The transaction type this workflow controls:
     - JOURNAL_ENTRY
     - PAYMENT
     - PURCHASE_ORDER
     - BUDGET
     - SALES_INVOICE
     - EXPENSE_CLAIM
     - PAYROLL
     - BANK_TRANSFER
4. Save.

> **Note:** Only one active workflow can exist per entity type per organisation. Creating a new one will deactivate the previous one.

### Adding Approval Levels

Each workflow can have multiple sequential levels. All level 1 approvers must act before level 2 approvers are notified, and so on.

1. Open the workflow.
2. Click **Add Level**.
3. Configure:
   - **Level Number** (1, 2, 3...)
   - **Approval Type**:
     - ANY_ONE — Any single approver in this level can approve
     - ALL_REQUIRED — Every approver in this level must approve
     - MAJORITY — More than half of the approvers must approve
4. Add **Approvers** — Select users to be approvers at this level.
5. Save.

### Example — Three-Level Journal Approval

```
Level 1: Accountant Supervisor (ANY_ONE)
    └── Level 2: Finance Manager (ANY_ONE)
            └── Level 3: Director (ANY_ONE) [for entries over GHS 50,000]
```

## 16.3 Delegations

An approver who is unavailable can delegate their approval authority to another user.

### Creating a Delegation

1. Navigate to **Approvals** → **Delegations**.
2. Click **New Delegation**.
3. Enter:
   - **Delegate To** — The user to receive delegated authority
   - **Valid From** and **Valid To** dates
   - **Reason** (e.g., "Annual leave 15-22 May 2026")
   - **Workflow** — Leave blank to delegate all workflows, or select a specific one
4. Save.

Delegations can be revoked at any time by clicking **Revoke**.

## 16.4 Processing Approval Requests

### As an Approver

1. Navigate to **Approvals** → **Requests**.
2. The list shows all pending requests assigned to you.
3. Click a request to open it.
4. Review the transaction details and supporting information.
5. Select a decision:
   - **Approve** — Advances the request to the next level or posts it if all levels are complete.
   - **Reject** — Returns the transaction to DRAFT status with comments.
   - **Delegate** — Reassigns this specific request to another user.
6. Enter a comment (required for rejection).
7. Click **Confirm**.

### Notification Inbox

All approval events generate notifications viewable in the **Approvals** → **Notifications** section:
- New approval requests assigned to you
- Approvals approved or rejected
- Escalations

The notification bell icon in the top bar shows an unread count.

## 16.5 Escalation

If an approval request is not acted upon within the SLA deadline, it is automatically marked as ESCALATED. Escalated requests remain visible and actionable by the approver.

---

# 17. FINANCIAL REPORTS

## 17.1 Overview

The Reports module generates the four primary financial statements required under **IAS 1 (Presentation of Financial Statements)**, along with supporting reports. All statements can be viewed on-screen, with comparative period analysis.

## 17.2 Balance Sheet (Statement of Financial Position)

The Balance Sheet presents the financial position of the organisation at a point in time.

**Structure (IAS 1 format):**

```
ASSETS
    Non-Current Assets
        Property, Plant & Equipment
        Intangible Assets
        Right-of-Use Assets
        Long-term Investments
    Current Assets
        Inventories
        Trade Receivables
        Other Receivables
        Cash and Cash Equivalents
TOTAL ASSETS

LIABILITIES AND EQUITY
    Current Liabilities
        Trade Payables
        Tax Payables
        Short-term Borrowings
    Non-Current Liabilities
        Long-term Debt
        Deferred Tax
    TOTAL LIABILITIES

    EQUITY
        Share Capital
        Retained Earnings
        Revaluation Reserve
    TOTAL EQUITY

TOTAL LIABILITIES AND EQUITY
```

**Generating the Balance Sheet:**
1. Navigate to **Reports** → **Balance Sheet**.
2. Select the **As-of Date** (reporting date).
3. Select a **Comparative Date** (optional — prior year or prior period for comparison).
4. The report is generated and displayed.

**Reading the Report:**
- Each account class shows the total balance.
- The balance of TOTAL ASSETS must equal TOTAL LIABILITIES AND EQUITY. If not, there is an unbalanced entry — use the Drilldown feature to investigate.

**Drilldown:**
Click on any line to drill down to the individual account balances and from there to individual transaction lines.

## 17.3 Income Statement (Profit & Loss)

The Income Statement shows financial performance over a period.

**Structure:**

```
REVENUE
    Sales Revenue
    Other Income
TOTAL REVENUE

COST OF SALES
    Cost of Goods Sold
GROSS PROFIT

OPERATING EXPENSES
    Salaries and Wages
    Depreciation
    Other Operating Expenses
OPERATING PROFIT (EBIT)

FINANCE COSTS
    Interest Expense
NET PROFIT BEFORE TAX

INCOME TAX EXPENSE
NET PROFIT AFTER TAX
```

**Generating the Income Statement:**
1. Navigate to **Reports** → **Income Statement**.
2. Select the **Period** (current month) and optionally **YTD** toggle.
3. Select a comparative period.
4. View the report.

The report includes a **% of Revenue** column showing each line as a proportion of total revenue — useful for margin analysis.

## 17.4 Cash Flow Statement

The Cash Flow Statement shows how cash moved during the period, classified into three activities:

- **Operating Activities** — Cash from core business operations
- **Investing Activities** — Cash from buying/selling assets
- **Financing Activities** — Cash from debt and equity financing

**Generating:**
1. Navigate to **Reports** → **Cash Flow**.
2. Select the reporting period.
3. View the statement.

The net change in cash for the period should reconcile with the change in the Cash and Cash Equivalents balance on the Balance Sheet.

## 17.5 Statement of Changes in Equity

Shows the movement in each equity component during the period:

| Component | Opening | Net Profit | Dividends | Revaluation | Closing |
|-----------|---------|-----------|-----------|-------------|---------|
| Share Capital | × | — | — | — | × |
| Retained Earnings | × | + | − | — | × |
| Revaluation Reserve | × | — | — | + | × |
| **Total Equity** | **×** | **+** | **−** | **+** | **×** |

**Generating:**
1. Navigate to **Reports** → **Changes in Equity**.
2. Select the period.
3. View the statement.

## 17.6 Trial Balance

The trial balance is a pre-financial-statement check listing all accounts and their debit/credit balances.

1. Navigate to **Accounts** → **Trial Balance**.
2. Select the period.
3. Total debits should equal total credits.

Use the trial balance to verify data integrity before generating financial statements.

## 17.7 Inventory Valuation Report

(See Section 12.7 — Inventory Valuation Report)

The total inventory value per the valuation report should agree with the Inventories line on the Balance Sheet.

## 17.8 Budget Variance Report

(See Section 13.8 — Budget vs Actual)

---

# 18. AUDIT TRAIL

## 18.1 Overview

Every action performed in Nexus Finance Tracker is recorded in an immutable audit trail. This provides a complete history of who did what and when — essential for compliance, internal controls, and external audits.

## 18.2 What is Logged

The audit trail captures:

| Category | Events Recorded |
|----------|----------------|
| **Authentication** | Login success/failure, logout, password changes, account lockout |
| **Journal Entries** | Create, update, submit, approve, reject, post, reverse |
| **Chart of Accounts** | Create, update, delete, lock/unlock accounts |
| **Users** | Create, role changes, activate/deactivate, reset password, unlock |
| **Approvals** | Workflow changes, approval decisions, delegations |
| **Payroll** | Run creation, submit, approve, pay, lock |
| **Bank Reconciliation** | Import, match, confirm, unlock |
| **Fixed Assets** | Create, depreciation run, disposal, revaluation, impairment |
| **Inventory** | Item create/update, movement create/approve, stocktake post |
| **Budgets** | Create, approve, line updates |
| **Tax** | VAT return generation, FX revaluation |
| **Periods** | Close, reopen, lock, year-end close |

## 18.3 Viewing the Audit Trail

1. Navigate to **Audit** in the sidebar.
2. The audit log list is displayed with filters:
   - **Date Range**
   - **User**
   - **Module** (JOURNAL, PAYROLL, etc.)
   - **Action** (CREATED, UPDATED, APPROVED, etc.)
   - **Entity Type**
3. Click any log entry to view full details including before/after state.

> **Access:** Only users with the **AUDITOR** role or **ORG_ADMIN** can access the audit trail.

## 18.4 Exporting the Audit Trail

For external audit submission or compliance archiving:

1. Navigate to **Audit**.
2. Apply any date/module filters.
3. Click **Export to CSV**.
4. The CSV file downloads with all visible entries.

## 18.5 Interpreting Audit Log Entries

Each entry shows:
- **Timestamp** — Exact date and time (UTC)
- **User** — Who performed the action
- **Action** — What was done (e.g., JOURNAL_POSTED)
- **Module** — Which system area
- **Entity** — The specific record affected (with ID and reference)
- **Description** — Human-readable description
- **Before** — Previous state (for updates)
- **After** — New state (for updates)
- **IP Address** — Client IP (for security investigation)

---

# 19. DASHBOARD & ANALYTICS

## 19.1 Overview

The Dashboard provides a real-time financial overview tailored to your role. Upon login, the dashboard displays the metrics most relevant to your work.

## 19.2 Dashboard Elements

### Key Metrics (KPI Cards)

| Metric | Description |
|--------|-------------|
| **Total Assets** | Sum of all asset accounts as of today |
| **Total Liabilities** | Sum of all liability accounts as of today |
| **Net Equity** | Assets minus liabilities |
| **Net Income — Month** | Revenue minus expenses for the current calendar month |
| **Net Income — YTD** | Revenue minus expenses year-to-date |
| **Cash Balance** | Sum of all bank and cash accounts |
| **AR Outstanding** | Total unpaid customer invoices |
| **AP Outstanding** | Total unpaid supplier invoices |

### Pending Approvals

Shows the count of transactions awaiting your approval. Click to navigate directly to the approvals queue.

### Budget Alerts

Highlights budget lines where actual spending has exceeded the budgeted amount or is within a threshold of the budget limit.

### Recent Journals

A list of the most recent journal entries posted, showing entry date, journal number, description, and amount.

### Revenue vs Expense Chart

A bar or line chart showing monthly revenue and expenses for the current fiscal year — useful for spotting trends.

## 19.3 Role-Specific Views

The dashboard adapts to your role:
- **Finance Manager** — Full GL summary, all KPIs
- **AR Clerk** — AR ageing summary, overdue invoice count
- **AP Clerk** — AP ageing summary, upcoming payment due dates
- **Approver** — Pending approvals prominently displayed, notification count
- **Report Viewer** — Summarised financial metrics without action buttons

---

# 20. SYSTEM ADMINISTRATION

## 20.1 User Management

Only **ORG_ADMIN** users can manage other users within the organisation.

### Adding a New User

1. Navigate to **Settings** → **Users**.
2. Click **Add User**.
3. Enter the new user's email address.
4. Select their **Role**.
5. Click **Create User**.

The system creates the account and generates a temporary password. The user must change it on first login.

### Changing a User's Role

1. Open the user's record.
2. Click **Change Role**.
3. Select the new role.
4. Save.

> **Warning:** Changing a role takes immediate effect. Reduce a user's access with care if they are currently in the middle of a workflow.

### Deactivating a User

When an employee leaves:

1. Open the user's record.
2. Click **Deactivate**.

The user cannot log in but all their historical records (journals created, approvals given) remain intact. Do not delete users.

### Resetting a User's Password

1. Open the user's record.
2. Click **Reset Password**.
3. The system generates a temporary password and forces a change on next login.

### Unlocking a Locked Account

If a user has been locked out (5 failed attempts):

1. Open the user's record.
2. Click **Unlock Account**.

## 20.2 Multi-Organisation Access

If your user account belongs to multiple organisations:

1. Click the organisation name in the top-left of the sidebar.
2. A dropdown appears showing all organisations you have access to.
3. Click the organisation to switch to it.

All data, users, periods, and accounts are completely separate between organisations.

## 20.3 Security Best Practices

| Practice | Recommendation |
|----------|---------------|
| **Passwords** | Use long, unique passwords. Never share credentials. |
| **Session** | Always log out from shared computers. |
| **Roles** | Apply the principle of least privilege — assign the minimum role needed. |
| **Period Locking** | Lock periods promptly after month-end to protect historical data. |
| **Audit Review** | Review the audit trail monthly for unusual activity. |
| **User Access Review** | Conduct quarterly reviews of user accounts and roles. |
| **Bank Reconciliation** | Complete and lock bank reconciliations monthly. |

---

# 21. GLOSSARY OF TERMS

| Term | Definition |
|------|------------|
| **Accumulated Depreciation** | The total depreciation charged against an asset since its acquisition. A contra asset account on the Balance Sheet. |
| **AVCO (Weighted Average Cost)** | An inventory costing method where the unit cost is the weighted average of all units purchased. Recalculated on each new purchase. |
| **Base Currency** | The primary currency in which the organisation's books are kept and financial statements are reported. |
| **Carrying Amount** | The net book value of an asset: original cost less accumulated depreciation and impairment losses. |
| **Chart of Accounts (CoA)** | The complete, structured list of all accounts used by the organisation to record financial transactions. |
| **Contra Account** | An account that offsets another account (e.g., Accumulated Depreciation offsets the Asset account). |
| **Control Account** | A summary account in the general ledger that is not posted to directly; subsidiary ledgers post to supporting accounts. |
| **Credit** | An accounting entry that increases liability, equity, or revenue accounts and decreases asset or expense accounts. |
| **Debit** | An accounting entry that increases asset or expense accounts and decreases liability, equity, or revenue accounts. |
| **Double-Entry Accounting** | The accounting system where every transaction has equal and opposite entries (debits = credits). |
| **EBIT** | Earnings Before Interest and Taxes — operating profit before finance costs and taxation. |
| **FX Revaluation** | The periodic restatement of foreign currency balances to the current exchange rate, recognising unrealised gains/losses. |
| **FIFO** | First In, First Out — an inventory costing method where the oldest stock is assumed sold first. |
| **General Ledger (GL)** | The complete record of all financial transactions, organised by account. The source of truth for all financial statements. |
| **IAS** | International Accounting Standards — accounting standards issued by the International Accounting Standards Board (IASB). |
| **IFRS** | International Financial Reporting Standards — the global standard for financial reporting. |
| **Impairment** | A reduction in the carrying amount of an asset when its recoverable amount falls below its book value (IAS 36). |
| **Journal Entry** | A record of a financial transaction in the general ledger, comprising balanced debit and credit lines. |
| **Net Book Value (NBV)** | Cost of an asset less accumulated depreciation. Also called carrying amount. |
| **PAYE** | Pay As You Earn — the system by which income tax is deducted from employee salaries by the employer and remitted to GRA. |
| **Period** | An accounting period — typically one calendar month. Periods can be open, closed, or locked. |
| **Posting** | The act of recording a journal entry into the permanent general ledger, after which it cannot be changed (only reversed). |
| **Residual Value** | The estimated value of an asset at the end of its useful life, used in depreciation calculations. |
| **Retained Earnings** | Cumulative net profits not yet distributed to shareholders — carried forward from year to year. |
| **RBAC** | Role-Based Access Control — the security model that restricts system access based on the user's assigned role. |
| **Segregation of Duties** | The internal control principle that no single person should control all aspects of a transaction (e.g., create, approve, and post). |
| **SSNIT** | Social Security and National Insurance Trust — Ghana's mandatory social security scheme. |
| **Standard Cost** | A predetermined cost for inventory items, used as a management tool for variance analysis. |
| **TIN** | Taxpayer Identification Number — unique identifier assigned by GRA to taxpayers. |
| **Trial Balance** | A listing of all general ledger account balances; total debits must equal total credits. |
| **Useful Life** | The estimated period over which an asset is expected to provide economic benefits. |
| **VAT** | Value Added Tax — a consumption tax levied at each stage of the supply chain. |
| **Year-End Close** | The accounting process at the end of a fiscal year: locking all periods, transferring net income to retained earnings, and resetting P&L accounts. |

---

# APPENDIX A — ACCOUNT TYPE REFERENCE

## Asset Account Types

| Type | Description | Normal Balance |
|------|-------------|----------------|
| BANK | Bank current and savings accounts | Debit |
| CASH | Petty cash and cash on hand | Debit |
| RECEIVABLE | Trade debtors and other receivables | Debit |
| INVENTORY | Stock and work-in-progress | Debit |
| PREPAYMENT | Prepaid expenses (current asset) | Debit |
| FIXED_ASSET | Property, plant and equipment (cost) | Debit |
| ACCUMULATED_DEPRECIATION | Contra account to fixed assets | Credit |
| INTANGIBLE | Patents, licences, goodwill | Debit |
| RIGHT_OF_USE_ASSET | IFRS 16 lease assets | Debit |
| TAX_RECEIVABLE | Input VAT and deferred tax asset | Debit |
| INTERCOMPANY | Amounts due from related companies | Debit |
| OTHER_ASSET | Assets not fitting other categories | Debit |

## Liability Account Types

| Type | Description | Normal Balance |
|------|-------------|----------------|
| PAYABLE | Trade creditors and accruals | Credit |
| TAX_PAYABLE | Output VAT, PAYE payable, SSNIT payable | Credit |
| LOAN | Bank loans and overdrafts | Credit |
| INTERCOMPANY | Amounts due to related companies | Credit |
| OTHER_LIABILITY | Liabilities not fitting other categories | Credit |

## Equity Account Types

| Type | Description | Normal Balance |
|------|-------------|----------------|
| SHARE_CAPITAL | Issued and paid-up share capital | Credit |
| RETAINED_EARNINGS | Accumulated profits/losses | Credit |
| RESERVE | Revaluation reserve, other reserves | Credit |

## Revenue Account Types

| Type | Description | Normal Balance |
|------|-------------|----------------|
| REVENUE | Sales and service revenue | Credit |
| OTHER_INCOME | Non-trading income | Credit |

## Expense Account Types

| Type | Description | Normal Balance |
|------|-------------|----------------|
| COST_OF_SALES | Direct costs of goods/services sold | Debit |
| EXPENSE | Operating expenses | Debit |
| DEPRECIATION_EXPENSE | Periodic depreciation charge | Debit |
| INTEREST_EXPENSE | Finance costs | Debit |
| TAX_EXPENSE | Income tax expense | Debit |
| INVENTORY | (Can appear in EXPENSE class for write-offs) | Debit |

---

# APPENDIX B — KEYBOARD SHORTCUTS & TIPS

## Efficiency Tips

### Searching Lists
- In any list view, clicking the **Search** bar and typing immediately filters results in real time — no need to press Enter.
- Use the **Status** filter buttons above lists to quickly show only Pending, Posted, Approved, etc. items.

### Quick Navigation
- Click the **organisation name** in the sidebar to switch organisations instantly.
- The **Refresh** button (circular arrow icon) in the sidebar header forces a refresh of all data from the server — useful when another user has just made changes.

### Journal Entry Tips
- Add a minimum of 2 lines. The system validates balance in real time — the totals at the bottom turn green when balanced.
- Use the **Tab** key to move between fields efficiently when entering many journal lines.
- The **Description** on the header propagates to all lines if no individual line description is entered. Add line-level descriptions to clarify complex entries.
- For recurring entries (month-end accruals), create the journal once, save as Draft, then copy it next month using the journal's Copy function.

### Reports
- The **Drilldown** feature on Balance Sheet and Income Statement allows you to click any line and see the underlying account balances and then individual transactions — essential for financial review.
- Change the **As-of Date** on the Balance Sheet to any past date to see a historical snapshot.

### Payroll
- Always run **Preview** before posting a payroll run. Verify totals against your manual estimate before committing.
- Download the payment file BEFORE locking the run, as the file cannot be regenerated after locking.

### Inventory
- Ensure **GL Account Links** (Inventory Control Account and COGS Account) are set on every item before creating movements. Items without these links will not produce GL entries.
- Run the **Valuation Report** at month-end and compare the Grand Total to the Inventories line on your Balance Sheet. Any difference indicates unlinked or unposted movements.

---

# APPENDIX C — ERROR MESSAGES & TROUBLESHOOTING

## Common Error Messages

### "Journal entry is not balanced"
**Cause:** The total of debit amounts does not equal the total of credit amounts.
**Fix:** Review each journal line. Check that every line has either a debit OR a credit, not both. Adjust amounts until the totals at the bottom of the entry are equal.

### "Period is closed — cannot post entries"
**Cause:** You are attempting to post to a period that has been closed or locked.
**Fix:** Either (a) change the journal date to fall within an open period, or (b) ask your ORG_ADMIN to reopen the period (if not locked). Locked periods cannot be reopened.

### "Account not found in this organisation"
**Cause:** The account ID used in a transaction does not exist in the current organisation's chart of accounts.
**Fix:** Verify the account is set up in the Chart of Accounts. If you are setting up GL links (e.g., on an inventory item), select accounts from the dropdown — do not type IDs manually.

### "Only POSTED movements can have their GL retroactively posted"
**Cause:** You attempted to use Post GL on a movement that has not yet been fully processed and posted.
**Fix:** Check the movement status. Only POSTED movements (green badge) with no journal entry (orange Post GL button) qualify for retroactive posting.

### "This item has no Inventory GL account configured"
**Cause:** The inventory item does not have an Inventory Control Account linked.
**Fix:** Go to **Inventory** → **Stock Items** → find the item → click **Edit** → scroll to **GL Account Links** → select an asset account from the Inventory Control Account dropdown → Save Changes. Then retry Post GL.

### "A locked reconciliation already exists for this date"
**Cause:** You are trying to reimport a bank statement for a date that has already been reconciled and locked.
**Fix:** Ask your ORG_ADMIN to unlock the reconciliation first (**Bank** → **Statements** → select statement → **Unlock**), then reimport.

### "Cannot change cost method after movements have been recorded"
**Cause:** You attempted to change the costing method (FIFO/AVCO/Standard) on an inventory item that already has movements.
**Fix:** The costing method is immutable once movements exist. If it was set incorrectly, you must: (1) Raise an ADJUSTMENT_OUT to write off all stock, (2) Create a new item with the correct costing method, (3) Raise a RECEIPT on the new item for the opening balance.

### "An unexpected error occurred. Please try again later."
**Cause:** A server-side error occurred. This should not happen under normal operation.
**Fix:** (1) Refresh the page and try again. (2) Check that all required fields are completed (especially GL accounts and accounting periods). (3) If the error persists, contact your system administrator with the time of the error and the action you were performing.

### "Insufficient stock for item 'X'"
**Cause:** You are trying to issue more stock than is currently on hand.
**Fix:** Check the current quantity on hand for the item in **Inventory** → **Stock Items**. Either reduce the issue quantity, or receive additional stock first.

### "Depreciation has already been run for period"
**Cause:** A depreciation run has already been posted for the selected period.
**Fix:** You cannot run depreciation twice for the same period. If the first run was incorrect, reverse it first (**Assets** → **Depreciation** → **Runs** → find the run → **Reverse**), then re-run with correct parameters.

### "Cannot delete item — stock on hand is X"
**Cause:** You are trying to delete an inventory item that still has stock.
**Fix:** Write off all remaining stock using an ADJUSTMENT_OUT movement before deleting the item.

---

## Getting Help

If you encounter an issue not covered by this manual:

1. **Check the Audit Trail** — Navigate to **Audit** to see if an error event was logged with more detail.
2. **Check the Period** — Confirm the accounting period for the transaction is OPEN.
3. **Check Roles** — Confirm you have the correct role to perform the action. Refer to Section 3.2.
4. **Contact Support** — Provide the following information:
   - Your name and email
   - Organisation name
   - Module and action you were attempting
   - Exact error message
   - Date and time of the error
   - Steps to reproduce the issue

---

*End of Document*

---

**Document Information**

| Field | Value |
|-------|-------|
| Document Title | Nexus Finance Tracker — Functional & User Manual |
| Version | 1.0 |
| Date | May 2026 |
| Classification | Confidential |
| Applicable Modules | All Modules (v1.0) |
| Standards Reference | IFRS, IAS 1, IAS 2, IAS 16, IAS 36, GRA Payroll Guidelines |

---

*© 2026 Nexus Finance Tracker. All rights reserved.*
