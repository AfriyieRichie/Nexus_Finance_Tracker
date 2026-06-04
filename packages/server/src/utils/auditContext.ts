import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request-scoped audit context.
 *
 * Two audit paths exist:
 *  - Service-level `auditLog()` writes rich, specific entries (with before/after
 *    and business phrasing) for important actions.
 *  - The HTTP audit middleware writes one generic, readable entry per mutating
 *    request as a fallback for routes services don't explicitly audit.
 *
 * To avoid double-logging, `auditLog()` calls `markAudited()`; the middleware
 * skips its generic write when the request was already audited by a service.
 * The middleware also stashes the request IP / user-agent here so service-level
 * entries (which have no `req`) still record where the action came from.
 */
interface AuditMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  // Resolved lazily: the audit middleware mounts before per-route auth, so the
  // user isn't known yet when the context is created — but it is by the time a
  // service handler calls auditLog().
  getUserId?: () => string | undefined;
}

const als = new AsyncLocalStorage<{ audited: boolean; meta: AuditMeta }>();

/** Run a request handler chain inside a fresh audit context. */
export function runWithAuditContext<T>(meta: AuditMeta, fn: () => T): T {
  return als.run({ audited: false, meta }, fn);
}

/** Mark the current request as already audited by a service-level entry. */
export function markAudited(): void {
  const store = als.getStore();
  if (store) store.audited = true;
}

/** Whether a service-level audit entry was already written for this request. */
export function wasAudited(): boolean {
  return als.getStore()?.audited ?? false;
}

/** Request IP / user-agent for the current request, if inside one. */
export function getAuditMeta(): AuditMeta {
  return als.getStore()?.meta ?? {};
}
