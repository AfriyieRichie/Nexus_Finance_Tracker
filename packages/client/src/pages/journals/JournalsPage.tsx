import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { listJournals } from '@/services/journals.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const navigate = useNavigate();
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [myDrafts, setMyDrafts] = useState(false);
  const [page, setPage] = useState(1);

  const effectiveStatus = myDrafts ? 'DRAFT' : statusFilter || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['journals', activeOrganisationId, effectiveStatus, search, fromDate, toDate, myDrafts, page],
    queryFn: () =>
      listJournals(activeOrganisationId!, {
        status: effectiveStatus,
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        createdByMe: myDrafts || undefined,
        page,
        pageSize: 20,
      }),
    enabled: !!activeOrganisationId,
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 0;

  function resetFilters() {
    setSearch('');
    setFromDate('');
    setToDate('');
    setStatusFilter('');
    setMyDrafts(false);
    setPage(1);
  }

  const hasActiveFilters = search || fromDate || toDate || statusFilter || myDrafts;

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
          <Button size="sm">
            <Plus size={14} className="mr-1" /> New Entry
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          {/* Status filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setMyDrafts(true); setStatusFilter(''); setPage(1); }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                myDrafts
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent',
              )}
            >
              My Drafts
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s || 'all'}
                onClick={() => { setStatusFilter(s); setMyDrafts(false); setPage(1); }}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  !myDrafts && statusFilter === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent',
                )}
              >
                {s ? s.replace(/_/g, ' ') : 'All'}
              </button>
            ))}
          </div>

          {/* Search + date range row */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="Search by number or description…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
              <Input
                type="date"
                className="h-8 text-xs w-36"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
              <Input
                type="date"
                className="h-8 text-xs w-36"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X size={12} /> Clear
              </button>
            )}
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
                    <TableRow
                      key={j.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => void navigate(`/journals/${j.id}`)}
                    >
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
