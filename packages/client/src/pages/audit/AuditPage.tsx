import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Download, Search, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listAuditLogs, buildExportUrl } from '@/services/audit.service';
import type { AuditLog, ListAuditParams } from '@/services/audit.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULES = [
  'AUTH', 'JOURNAL', 'CHART_OF_ACCOUNTS', 'APPROVAL',
  'PAYROLL', 'AR', 'AP', 'ASSET', 'INVENTORY', 'BANK', 'BUDGET', 'TAX', 'REPORT',
];

const ENTITY_TYPES = [
  'JOURNAL_ENTRY', 'ACCOUNT', 'USER', 'APPROVAL_REQUEST', 'APPROVAL_WORKFLOW',
  'INVOICE', 'SUPPLIER_INVOICE', 'CUSTOMER', 'SUPPLIER', 'ASSET', 'PAYROLL_RUN', 'EMPLOYEE',
];

const PAGE_SIZE = 50;

// ─── Colour helpers ───────────────────────────────────────────────────────────

type Variant = 'success' | 'info' | 'warning' | 'destructive' | 'secondary';

function actionVariant(action: string): Variant {
  const u = action.toUpperCase();
  if (u.includes('POST') || u.includes('LOGIN') && !u.includes('FAIL')) return 'success';
  if (u.includes('CREATE') || u.includes('REGISTER')) return 'info';
  if (u.includes('UPDATE') || u.includes('SUBMIT') || u.includes('DELEGAT') || u.includes('PASSWORD')) return 'warning';
  if (u.includes('DELETE') || u.includes('REJECT') || u.includes('FAIL') || u.includes('REVERSE')) return 'destructive';
  return 'secondary';
}

function moduleColour(mod: string | null): string {
  switch (mod) {
    case 'AUTH':             return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'JOURNAL':          return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CHART_OF_ACCOUNTS':return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'APPROVAL':         return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'PAYROLL':          return 'bg-green-50 text-green-700 border-green-200';
    case 'AR':               return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'AP':               return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'ASSET':            return 'bg-pink-50 text-pink-700 border-pink-200';
    default:                 return 'bg-muted text-muted-foreground';
  }
}

// ─── Before/after diff viewer ─────────────────────────────────────────────────

function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  if (before == null && after == null) return null;

  const fmt = (v: unknown) => {
    if (v == null) return null;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  };

  const bStr = fmt(before);
  const aStr = fmt(after);

  if (!bStr && !aStr) return null;

  return (
    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
      {bStr && (
        <div>
          <p className="text-[10px] font-sans font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Before</p>
          <pre className="bg-destructive/5 border border-destructive/20 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap text-destructive/80">
            {bStr}
          </pre>
        </div>
      )}
      {aStr && (
        <div className={!bStr ? 'col-span-2' : ''}>
          <p className="text-[10px] font-sans font-semibold text-muted-foreground mb-1 uppercase tracking-wide">After</p>
          <pre className="bg-green-50 border border-green-200 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap text-green-800">
            {aStr}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Expandable log row ───────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const hasDiff = log.previousValue != null || log.newValue != null;
  const hasExtra = hasDiff || !!log.userAgent || !!log.description;

  return (
    <>
      <TableRow
        className={hasExtra ? 'cursor-pointer hover:bg-accent/40' : ''}
        onClick={() => hasExtra && setOpen((o) => !o)}
      >
        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap w-[160px]">
          {new Date(log.timestamp).toLocaleString()}
        </TableCell>
        <TableCell className="text-xs w-[160px]">
          {log.user ? (
            <div>
              <span className="font-medium">{log.user.firstName} {log.user.lastName}</span>
              <span className="block text-[10px] text-muted-foreground">{log.user.email}</span>
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="w-[120px]">
          {log.module && (
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${moduleColour(log.module)}`}>
              {log.module.replace(/_/g, ' ')}
            </span>
          )}
        </TableCell>
        <TableCell className="w-[160px]">
          <Badge variant={actionVariant(log.action)} className="text-[10px] font-mono">
            {log.action}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-[180px]">
          <span className="truncate block">{log.description ?? log.entityType.replace(/_/g, ' ')}</span>
          {log.entityRef && (
            <span className="block text-[10px] font-mono text-muted-foreground/70">{log.entityRef}</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground font-mono w-[100px]">
          {log.ipAddress ?? '—'}
        </TableCell>
        <TableCell className="w-6">
          {hasExtra && (
            <span className="text-muted-foreground">
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          )}
        </TableCell>
      </TableRow>

      {open && hasExtra && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="py-3 px-4">
            <div className="space-y-3">
              {log.description && (
                <p className="text-xs text-foreground">{log.description}</p>
              )}
              {hasDiff && (
                <JsonDiff before={log.previousValue} after={log.newValue} />
              )}
              {log.userAgent && (
                <p className="text-[10px] text-muted-foreground font-mono break-all">
                  <span className="font-sans font-medium">User-Agent:</span> {log.userAgent}
                </p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AuditPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  const [search, setSearch]           = useState('');
  const [module, setModule]           = useState('');
  const [actionFilter, setAction]     = useState('');
  const [entityType, setEntityType]   = useState('');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [page, setPage]               = useState(1);

  const params: ListAuditParams = {
    search:     search     || undefined,
    module:     module     || undefined,
    action:     actionFilter || undefined,
    entityType: entityType || undefined,
    fromDate:   fromDate   || undefined,
    toDate:     toDate     || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', activeOrganisationId, params],
    queryFn:  () => listAuditLogs(activeOrganisationId!, params),
    enabled:  !!activeOrganisationId,
  });

  const logs       = data?.logs       ?? [];
  const totalPages = data?.totalPages ?? 1;
  const hasNext    = data?.hasNext    ?? false;
  const hasPrev    = data?.hasPrev    ?? false;

  const hasFilters = !!(search || module || actionFilter || entityType || fromDate || toDate);

  function resetPage() { setPage(1); }
  function clearFilters() {
    setSearch(''); setModule(''); setAction(''); setEntityType('');
    setFromDate(''); setToDate(''); setPage(1);
  }

  const exportUrl = buildExportUrl(activeOrganisationId ?? '', params);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Shield size={18} /> Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable, append-only record of every action in this organisation
          </p>
        </div>
        <a href={exportUrl} download>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download size={13} /> Export CSV
          </Button>
        </a>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 items-end">
            {/* Full-text search */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 text-xs w-52 pl-7"
                  placeholder="Description, ref, action…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                />
              </div>
            </div>

            {/* Module */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Module</label>
              <select
                className="h-8 text-xs w-44 rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                value={module}
                onChange={(e) => { setModule(e.target.value); resetPage(); }}
              >
                <option value="">All modules</option>
                {MODULES.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* Action */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <Input
                className="h-8 text-xs w-40"
                placeholder="e.g. JOURNAL_POSTED"
                value={actionFilter}
                onChange={(e) => { setAction(e.target.value); resetPage(); }}
              />
            </div>

            {/* Entity Type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Entity Type</label>
              <select
                className="h-8 text-xs w-44 rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); resetPage(); }}
              >
                <option value="">All types</option>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* Date range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input type="date" className="h-8 text-xs w-36"
                value={fromDate} onChange={(e) => { setFromDate(e.target.value); resetPage(); }} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input type="date" className="h-8 text-xs w-36"
                value={toDate} onChange={(e) => { setToDate(e.target.value); resetPage(); }} />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs self-end gap-1" onClick={clearFilters}>
                <X size={12} /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center space-y-1">
              <Shield size={32} className="mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No audit logs found</p>
              <p className="text-xs text-muted-foreground">
                {hasFilters ? 'Try adjusting your filters' : 'Activity will appear here as users take actions'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Timestamp</TableHead>
                  <TableHead className="w-[160px]">User</TableHead>
                  <TableHead className="w-[120px]">Module</TableHead>
                  <TableHead className="w-[160px]">Action</TableHead>
                  <TableHead>Description / Ref</TableHead>
                  <TableHead className="w-[100px]">IP</TableHead>
                  <TableHead className="w-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => <LogRow key={log.id} log={log} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && logs.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages} — {data?.total ?? 0} total entries</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={!hasPrev} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={13} /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
