import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { listJournals } from '@/services/journals.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = ['', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REVERSED', 'REJECTED'];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  POSTED: 'success',
  APPROVED: 'info',
  PENDING_APPROVAL: 'warning',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
  REVERSED: 'secondary',
};

const TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General',
  SALES: 'Sales',
  PURCHASE: 'Purchase',
  CASH_RECEIPT: 'Cash Receipt',
  CASH_PAYMENT: 'Cash Payment',
  PAYROLL: 'Payroll',
  DEPRECIATION: 'Depreciation',
  ADJUSTMENT: 'Adjustment',
  OPENING_BALANCE: 'Opening Balance',
  REVERSAL: 'Reversal',
};

export function JournalsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['journals', activeOrganisationId, statusFilter, page],
    queryFn: () =>
      listJournals(activeOrganisationId!, {
        status: statusFilter || undefined,
        page,
        pageSize: 20,
      }),
    enabled: !!activeOrganisationId,
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText size={18} /> Journal Entries
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} entries</p>
        </div>
        <Link to="/journals/new">
          <Button size="sm"><Plus size={14} /> New Entry</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s || 'all'}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent',
                )}
              >
                {s ? s.replace('_', ' ') : 'All'}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data?.entries.length ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No journal entries found.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Number</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-24">Period</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead className="w-20 text-right">Lines</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {j.journalNumber}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-sm">{j.description}</p>
                        {j.creator && (
                          <p className="text-xs text-muted-foreground">
                            {j.creator.firstName} {j.creator.lastName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{TYPE_LABELS[j.type] ?? j.type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(j.entryDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {j.period?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[j.status] ?? 'secondary'}>
                          {j.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {j._count?.lines ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <span>Page {page} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1 rounded border text-xs disabled:opacity-40 hover:bg-accent"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 rounded border text-xs disabled:opacity-40 hover:bg-accent"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
