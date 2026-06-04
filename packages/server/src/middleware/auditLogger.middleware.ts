import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

type MutatingMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const AUDITED_METHODS: Set<string> = new Set<MutatingMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

// Token refresh is plumbing, not a business event — don't spam the trail with it.
const SKIP_PATHS = [/\/auth\/refresh$/];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

// Route slug -> audit module code (the AuditPage colours/filters on these codes).
const MODULE_CODES: Record<string, string> = {
  ar: 'AR', ap: 'AP', journals: 'JOURNAL', payroll: 'PAYROLL', inventory: 'INVENTORY',
  assets: 'ASSET', 'fixed-assets': 'ASSET', budgets: 'BUDGET', tax: 'TAX', bank: 'BANK',
  approvals: 'APPROVAL', accounts: 'CHART_OF_ACCOUNTS', periods: 'PERIODS',
  users: 'USERS', auth: 'AUTH', organisations: 'ORGANISATION', reports: 'REPORTS',
};

// Trailing action segments -> readable past-tense verb (override the method default).
const ACTION_VERBS: Record<string, string> = {
  post: 'Posted', approve: 'Approved', reject: 'Rejected', void: 'Voided',
  submit: 'Submitted', reverse: 'Reversed', email: 'Emailed', send: 'Sent',
  pay: 'Paid', activate: 'Activated', deactivate: 'Deactivated', lock: 'Locked',
  unlock: 'Unlocked', close: 'Closed', reopen: 'Reopened', login: 'Logged in',
  logout: 'Logged out', register: 'Registered', 'change-password': 'Changed password',
  import: 'Imported', export: 'Exported', repost: 'Reposted', run: 'Ran',
  reconcile: 'Reconciled', match: 'Matched', delegate: 'Delegated',
};

// Resource slug -> singular, title-cased noun for the description.
const ENTITY_NOUNS: Record<string, string> = {
  suppliers: 'Supplier', customers: 'Customer', invoices: 'Invoice', journals: 'Journal Entry',
  payments: 'Payment', 'credit-notes': 'Credit Note', accounts: 'Account', employees: 'Employee',
  items: 'Inventory Item', movements: 'Stock Movement', stocktakes: 'Stocktake', budgets: 'Budget',
  'cost-centres': 'Cost Centre', workflows: 'Approval Workflow', approvers: 'Approvers',
  requests: 'Approval Request', delegations: 'Delegation', 'tax-codes': 'Tax Code',
  'exchange-rates': 'Exchange Rate', statement: 'Statement', categories: 'Category',
  components: 'Salary Component', loans: 'Loan', periods: 'Accounting Period',
  statements: 'Bank Statement', transactions: 'Transaction', 'vat-returns': 'VAT Return',
};

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function singularNoun(slug: string): string {
  if (ENTITY_NOUNS[slug]) return ENTITY_NOUNS[slug];
  const t = titleCase(slug);
  return t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.endsWith('s') ? t.slice(0, -1) : t;
}

interface Parsed { moduleCode: string; entityType: string; verb: string; selfDescribing: boolean; }

function parseRoute(method: string, path: string): Parsed {
  const segs = path.split('/').filter(Boolean);
  const orgIdx = segs.indexOf('organisations');

  let moduleSlug: string;
  let subs: string[];
  if (orgIdx >= 0) {
    // /api/v1/organisations/:orgId/:module/...
    moduleSlug = segs[orgIdx + 2] ?? 'organisations';
    subs = segs.slice(orgIdx + 3);
  } else {
    // /api/v1/:module/...  (auth, users, etc.)
    const vIdx = segs.findIndex((s) => /^v\d+$/.test(s));
    moduleSlug = segs[vIdx + 1] ?? segs[0] ?? 'unknown';
    subs = segs.slice(vIdx >= 0 ? vIdx + 2 : 1);
  }

  const nonId = subs.filter((s) => !isUuid(s));
  const trailing = nonId[nonId.length - 1];
  const verbOverride = trailing ? ACTION_VERBS[trailing] : undefined;

  // Entity = deepest resource that isn't an action keyword.
  const resourceSlug = [...nonId].reverse().find((s) => !ACTION_VERBS[s]);

  const verb = verbOverride
    ?? (method === 'POST' ? 'Created' : method === 'DELETE' ? 'Deleted' : 'Updated');

  return {
    moduleCode: MODULE_CODES[moduleSlug] ?? moduleSlug.toUpperCase(),
    entityType: singularNoun(resourceSlug ?? moduleSlug),
    verb,
    // e.g. "Logged in", "Logged out" — the verb already tells the whole story.
    selfDescribing: !!verbOverride && !resourceSlug,
  };
}

// A human reference for the record (document number, code, name…), not a UUID.
function extractEntityRef(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  for (const key of ['journalNumber', 'entryNumber', 'invoiceNumber', 'creditNoteNumber',
    'runNumber', 'number', 'reference', 'code', 'name', 'title']) {
    const v = d[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function extractEntityId(req: Request, body: unknown): string | null {
  if (req.params.id) return req.params.id;
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data?: Record<string, unknown> }).data;
    if (typeof data?.id === 'string') return data.id;
  }
  return null;
}

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  if (!AUDITED_METHODS.has(req.method) || SKIP_PATHS.some((re) => re.test(req.path))) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const user = req.user;
      const organisationId =
        req.params.organisationId ?? (req.body as Record<string, unknown>)?.organisationId as string | undefined;

      const { moduleCode, entityType, verb, selfDescribing } = parseRoute(req.method, req.path);
      const entityRef = extractEntityRef(body);
      const description = (selfDescribing ? verb : `${verb} ${entityType}`) + (entityRef ? ` (${entityRef})` : '');

      prisma.auditLog
        .create({
          data: {
            userId:         user?.sub ?? null,
            organisationId: organisationId ?? null,
            action:         verb,
            module:         moduleCode,
            entityType:     entityType,
            entityId:       extractEntityId(req, body),
            entityRef:      entityRef,
            description,
            newValue:       sanitiseForAudit(body) as Prisma.InputJsonValue,
            ipAddress:      req.ip ?? null,
            userAgent:      req.headers['user-agent'] ?? null,
          },
        })
        .catch((err: unknown) => logger.error('Audit log write failed', { err }));
    }
    return originalJson(body);
  };

  next();
}

function sanitiseForAudit(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const sanitised = { ...(body as Record<string, unknown>) };
  delete sanitised.password;
  delete sanitised.passwordHash;
  delete sanitised.refreshToken;
  delete sanitised.accessToken;
  return sanitised;
}
