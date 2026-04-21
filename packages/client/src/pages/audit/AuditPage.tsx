import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listAuditLogs } from '@/services/audit.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Badge colouring ──────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'info' | 'warning' | 'destructive' | 'secondary';

function actionVariant(action: string): BadgeVariant {
  const upper = action.toUpperCase();
  if (upper.includes('POST') || upper.includes('POSTED')) return 'success';
  if (upper.includes('CREATE') || upper.includes('CREATED')) return 'info';
  if (upper.includes('UPDATE') || upper.includes('UPDATED') || upper.includes('EDIT')) return 'warning';
  if (
    upper.includes('DELETE') ||
    upper.includes('DELETED') ||
    upper.includes('REJECT') ||
    upper.includes('REJECTED')
  )
    return 'destructive';
  return 'secondary';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  'JOURNAL_ENTRY',
  'ACCOUNT',
  'INVOICE',
  'SUPPLIER_INVOICE',
  'CUSTOMER',
  'SUPPLIER',
  'ASSET',
  'PAYROLL',
  'USER',
];

export function AuditPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  // ── filters ──
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading } = useQuery({
    queryKey: [
      'audit-logs',
      activeOrganisationId,
      actionFilter,
      entityTypeFilter,
      fromDate,
      toDate,
      page,
    ],
    queryFn: () =>
      listAuditLogs(activeOrganisationId!, {
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !!activeOrganisationId,
  });

  const logs = data?.logs ?? [];
  const totalPages = data?.totalPages ?? 1;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = data?.hasPrev ?? false;

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Shield size={18} /> Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Immutable log of all actions performed within this organisation
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Action</label>
          <Input
            className="h-8 text-xs w-44"
            placeholder="e.g. JOURNAL_POSTED"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              resetPage();
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Entity Type</label>
          <select
            className="h-8 text-xs w-44 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={entityTypeFilter}
            onChange={(e) => {
              setEntityTypeFilter(e.target.value);
              resetPage();
            }}
          >
            <option value="">All types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              resetPage();
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              resetPage();
            }}
          />
        </div>

        {(actionFilter || entityTypeFilter || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs self-end"
            onClick={() => {
              setActionFilter('');
              setEntityTypeFilter('');
              setFromDate('');
              setToDate('');
              resetPage();
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center space-y-1">
              <Shield size={32} className="mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No audit logs found</p>
              <p className="text-xs text-muted-foreground">
                Try adjusting your filters or check back later
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.user ? (
                        <div>
                          <span className="font-medium">
                            {log.user.firstName} {log.user.lastName}
                          </span>
                          <span className="block text-muted-foreground">{log.user.email}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(log.action)} className="text-[10px] font-mono">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.entityType.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[140px] truncate">
                      {log.entityId ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {log.ipAddress ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && logs.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={13} />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
