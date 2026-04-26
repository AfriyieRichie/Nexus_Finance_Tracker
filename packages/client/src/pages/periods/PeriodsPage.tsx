import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Lock, CheckCircle, Circle, Plus, AlertCircle,
  Unlock, ShieldAlert, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listPeriods, createFiscalYear, closePeriod,
  reopenPeriod, lockPeriod, yearEndClose,
  type AccountingPeriod,
} from '@/services/periods.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  OPEN: 'success',
  CLOSED: 'warning',
  LOCKED: 'secondary',
};

const CHECKLIST_ITEMS = [
  'All bank accounts have been reconciled',
  'Accounts receivable aging has been reviewed',
  'Accounts payable aging has been reviewed',
  'Prepaid expenses and accruals are properly recorded',
  'Fixed asset depreciation entries have been posted',
  'Intercompany transactions are reconciled',
  'Trial balance has been reviewed and approved',
  'All supporting documents are filed and archived',
];

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message ?? 'Action failed';
}

// ─── Create Fiscal Year Dialog ────────────────────────────────────────────────

function CreateFiscalYearDialog({ organisationId, onClose }: { organisationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear + 1));
  const [startDate, setStartDate] = useState(`${currentYear + 1}-01-01`);

  const mutation = useMutation({
    mutationFn: () => createFiscalYear(organisationId, { fiscalYear: parseInt(fiscalYear), startDate }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods', organisationId] });
      onClose();
    },
  });

  return (
    <DialogContent className="max-w-sm" title="Create Fiscal Year" description="Auto-generates 12 monthly accounting periods.">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium mb-1.5 block">Fiscal Year</label>
          <Input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} min={2000} max={2099} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Usually 1 Jan for calendar-year organisations</p>
        </div>
        {mutation.isError && (
          <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Period-End Checklist Dialog ──────────────────────────────────────────────

function CloseChecklistDialog({
  period,
  organisationId,
  onClose,
}: {
  period: AccountingPeriod;
  organisationId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<boolean[]>(Array(CHECKLIST_ITEMS.length).fill(false));
  const allChecked = checked.every(Boolean);

  const mutation = useMutation({
    mutationFn: () => closePeriod(organisationId, period.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods', organisationId] });
      onClose();
    },
  });

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <DialogContent
      className="max-w-lg"
      title={`Close Period — ${period.name}`}
      description="Complete the month-end checklist before closing."
    >
      <div className="space-y-4">
        {/* System check note */}
        <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 rounded-md p-3 text-blue-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          The system will automatically block the close if any unposted journal entries remain in this period.
        </div>

        {/* Manual checklist */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month-End Checklist</p>
          {CHECKLIST_ITEMS.map((item, i) => (
            <label
              key={i}
              className={cn(
                'flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors',
                checked[i] ? 'border-green-300 bg-green-50/50' : 'border-border hover:bg-muted/30',
              )}
            >
              <div
                className={cn(
                  'mt-0.5 w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center',
                  checked[i] ? 'bg-green-500 border-green-500' : 'border-muted-foreground',
                )}
              >
                {checked[i] && <CheckCircle size={10} className="text-white fill-white" />}
              </div>
              <input type="checkbox" className="sr-only" checked={checked[i]} onChange={() => toggle(i)} />
              <span className={cn('text-xs', checked[i] ? 'text-green-800 line-through' : 'text-foreground')}>
                {item}
              </span>
            </label>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-right">
          {checked.filter(Boolean).length} / {CHECKLIST_ITEMS.length} items confirmed
        </div>

        {mutation.isError && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {errMsg(mutation.error)}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!allChecked || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Lock size={13} className="mr-1" />
            {mutation.isPending ? 'Closing…' : 'Close Period'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Reopen Dialog ────────────────────────────────────────────────────────────

function ReopenDialog({
  period,
  organisationId,
  onClose,
}: {
  period: AccountingPeriod;
  organisationId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => reopenPeriod(organisationId, period.id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods', organisationId] });
      onClose();
    },
  });

  return (
    <DialogContent
      className="max-w-md"
      title={`Reopen Period — ${period.name}`}
      description="This action is logged to the audit trail."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Reopening allows correction entries to be posted. Close the period again once corrections are complete.
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block">
            Reason for reopening <span className="text-destructive">*</span>
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Missing accrual entry needs to be posted"
          />
          <p className="text-xs text-muted-foreground mt-1">Minimum 5 characters. This will be recorded in the audit trail.</p>
        </div>
        {mutation.isError && (
          <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
            disabled={reason.trim().length < 5 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Unlock size={13} className="mr-1" />
            {mutation.isPending ? 'Reopening…' : 'Reopen Period'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Lock Dialog ──────────────────────────────────────────────────────────────

function LockDialog({
  period,
  organisationId,
  onClose,
}: {
  period: AccountingPeriod;
  organisationId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => lockPeriod(organisationId, period.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods', organisationId] });
      onClose();
    },
  });

  return (
    <DialogContent
      className="max-w-sm"
      title={`Permanently Lock — ${period.name}`}
      description="This action cannot be undone."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          Locking is <strong>permanent and irreversible</strong>. This period will be frozen and no transactions can ever be posted to it.
        </div>
        {mutation.isError && (
          <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Lock size={13} className="mr-1" />
            {mutation.isPending ? 'Locking…' : 'Lock Permanently'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Year-End Close Dialog ────────────────────────────────────────────────────

function YearEndCloseDialog({
  fiscalYear,
  organisationId,
  onClose,
}: {
  fiscalYear: number;
  organisationId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => yearEndClose(organisationId, fiscalYear),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods', organisationId] });
      onClose();
    },
  });

  return (
    <DialogContent
      className="max-w-sm"
      title={`Year-End Close — FY ${fiscalYear}`}
      description="Lock all 12 periods for this fiscal year."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          This will <strong>permanently lock all 12 periods</strong> in FY {fiscalYear}. All periods must be CLOSED first. This action is irreversible.
        </div>
        {mutation.isError && (
          <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <ShieldAlert size={13} className="mr-1" />
            {mutation.isPending ? 'Locking…' : `Lock All FY ${fiscalYear} Periods`}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DialogState =
  | { type: 'create' }
  | { type: 'close'; period: AccountingPeriod }
  | { type: 'reopen'; period: AccountingPeriod }
  | { type: 'lock'; period: AccountingPeriod }
  | { type: 'year-end'; fiscalYear: number }
  | null;

export function PeriodsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const userRole = activeOrg?.role ?? '';
  const isAdmin = userRole === 'ORG_ADMIN';
  const isFinanceManager = ['ORG_ADMIN', 'FINANCE_MANAGER'].includes(userRole);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const { data: periods, isLoading } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isCurrentPeriod(p: AccountingPeriod) {
    const start = new Date(p.startDate);
    const end = new Date(p.endDate);
    return p.status === 'OPEN' && start <= today && today <= end;
  }

  const grouped = (periods ?? []).reduce<Record<number, AccountingPeriod[]>>((acc, p) => {
    if (!acc[p.fiscalYear]) acc[p.fiscalYear] = [];
    acc[p.fiscalYear]!.push(p);
    return acc;
  }, {});

  const fiscalYears = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  // Auto-expand the most recent year on first load
  const latestYear = fiscalYears[0];
  if (latestYear && expandedYears.size === 0) {
    expandedYears.add(latestYear);
  }

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  function yearStats(ps: AccountingPeriod[]) {
    return {
      open: ps.filter((p) => p.status === 'OPEN').length,
      closed: ps.filter((p) => p.status === 'CLOSED').length,
      locked: ps.filter((p) => p.status === 'LOCKED').length,
    };
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Calendar size={18} /> Accounting Periods
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{periods?.length ?? 0} periods across {fiscalYears.length} fiscal year{fiscalYears.length !== 1 ? 's' : ''}</p>
        </div>
        {isFinanceManager && activeOrganisationId && (
          <Button size="sm" onClick={() => setDialog({ type: 'create' })}>
            <Plus size={14} className="mr-1" /> New Fiscal Year
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : !periods?.length ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Calendar size={32} className="mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No accounting periods yet.</p>
            {isFinanceManager && (
              <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'create' })}>
                <Plus size={14} className="mr-1" /> Create your first fiscal year
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fiscalYears.map((year) => {
            const ps = grouped[year] ?? [];
            const stats = yearStats(ps);
            const isExpanded = expandedYears.has(year);
            const allClosed = ps.every((p) => p.status === 'CLOSED');
            const anyLocked = ps.some((p) => p.status === 'LOCKED');

            return (
              <Card key={year}>
                {/* Fiscal year header */}
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <button
                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                      onClick={() => toggleYear(year)}
                    >
                      <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          Fiscal Year {year}
                          {anyLocked && ps.every((p) => p.status === 'LOCKED') && (
                            <Lock size={12} className="text-muted-foreground" />
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-3 mt-1">
                          {stats.open > 0 && (
                            <span className="text-xs text-green-700 flex items-center gap-1">
                              <Circle size={8} className="fill-green-500 text-green-500" /> {stats.open} open
                            </span>
                          )}
                          {stats.closed > 0 && (
                            <span className="text-xs text-amber-700">{stats.closed} closed</span>
                          )}
                          {stats.locked > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Lock size={9} /> {stats.locked} locked
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="ml-2 text-muted-foreground">
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </span>
                    </button>

                    {/* Year-End Close button — ORG_ADMIN only, shown when all periods closed */}
                    {isAdmin && allClosed && !anyLocked && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/5 shrink-0"
                        onClick={() => setDialog({ type: 'year-end', fiscalYear: year })}
                      >
                        <ShieldAlert size={13} className="mr-1" /> Year-End Close
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-0 mt-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="w-28">Start</TableHead>
                          <TableHead className="w-28">End</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead className="w-32 text-muted-foreground text-xs">Closed</TableHead>
                          <TableHead className="w-40 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ps.map((p) => {
                          const isCurrent = isCurrentPeriod(p);
                          return (
                            <TableRow
                              key={p.id}
                              className={cn(isCurrent && 'bg-primary/5 border-l-2 border-l-primary')}
                            >
                              <TableCell className="text-xs text-muted-foreground font-mono">{p.periodNumber}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{p.name}</span>
                                  {isCurrent && (
                                    <Badge variant="info" className="text-[10px] h-4 px-1.5">Current</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(p.startDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(p.endDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {p.status === 'OPEN' && <Circle size={10} className="text-green-500 fill-green-500" />}
                                  {p.status === 'CLOSED' && <CheckCircle size={10} className="text-amber-500" />}
                                  {p.status === 'LOCKED' && <Lock size={10} className="text-muted-foreground" />}
                                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'} className="text-[10px]">
                                    {p.status}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {p.status === 'OPEN' && isFinanceManager && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2"
                                      onClick={() => setDialog({ type: 'close', period: p })}
                                    >
                                      <Lock size={11} className="mr-1" /> Close
                                    </Button>
                                  )}
                                  {p.status === 'CLOSED' && isAdmin && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs px-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                                        onClick={() => setDialog({ type: 'reopen', period: p })}
                                      >
                                        <Unlock size={11} className="mr-1" /> Reopen
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs px-2 text-destructive border-destructive/30 hover:bg-destructive/5"
                                        onClick={() => setDialog({ type: 'lock', period: p })}
                                      >
                                        <ShieldAlert size={11} className="mr-1" /> Lock
                                      </Button>
                                    </>
                                  )}
                                  {p.status === 'LOCKED' && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 pr-1">
                                      <Lock size={11} /> Permanent
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      {activeOrganisationId && (
        <>
          {dialog?.type === 'create' && (
            <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}>
              <CreateFiscalYearDialog organisationId={activeOrganisationId} onClose={() => setDialog(null)} />
            </Dialog>
          )}
          {dialog?.type === 'close' && (
            <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}>
              <CloseChecklistDialog period={dialog.period} organisationId={activeOrganisationId} onClose={() => setDialog(null)} />
            </Dialog>
          )}
          {dialog?.type === 'reopen' && (
            <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}>
              <ReopenDialog period={dialog.period} organisationId={activeOrganisationId} onClose={() => setDialog(null)} />
            </Dialog>
          )}
          {dialog?.type === 'lock' && (
            <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}>
              <LockDialog period={dialog.period} organisationId={activeOrganisationId} onClose={() => setDialog(null)} />
            </Dialog>
          )}
          {dialog?.type === 'year-end' && (
            <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}>
              <YearEndCloseDialog fiscalYear={dialog.fiscalYear} organisationId={activeOrganisationId} onClose={() => setDialog(null)} />
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
