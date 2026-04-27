import { useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Send, CheckCircle, XCircle, BookOpen, RotateCcw,
  Edit, Trash2, AlertCircle, ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  getJournal, submitJournal, approveJournal, rejectJournal,
  postJournal, reverseJournal, deleteJournal,
} from '@/services/journals.service';
import { listPeriods } from '@/services/periods.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  POSTED: 'success',
  APPROVED: 'info',
  PENDING_APPROVAL: 'warning',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
  REVERSED: 'secondary',
};

const TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General', SALES: 'Sales', PURCHASE: 'Purchase',
  CASH_RECEIPT: 'Cash Receipt', CASH_PAYMENT: 'Cash Payment',
  PAYROLL: 'Payroll', DEPRECIATION: 'Depreciation', ADJUSTMENT: 'Adjustment',
  OPENING_BALANCE: 'Opening Balance', REVERSAL: 'Reversal',
};

function fmt(n: string | number) { return parseFloat(String(n)).toFixed(2); }

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message ?? 'Action failed';
}

export function JournalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Drill-down context — set when navigating from Account Ledger
  const drillFrom = searchParams.get('from');        // full URL of the account ledger page
  const drillFromLabel = searchParams.get('fromLabel'); // e.g. "111200 · Main Bank Account"
  const drillTbLabel = searchParams.get('tbLabel');  // e.g. "April 2024"

  function handleBack() {
    if (drillFrom) navigate(drillFrom);
    else navigate('/journals');
  }
  const qc = useQueryClient();
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  const [actionPanel, setActionPanel] = useState<'approve' | 'reject' | 'reverse' | null>(null);
  const [comments, setComments] = useState('');
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().slice(0, 10));
  const [reversePeriodId, setReversePeriodId] = useState('');
  const [reverseDesc, setReverseDesc] = useState('');
  const [actionError, setActionError] = useState('');

  const { data: journal, isLoading } = useQuery({
    queryKey: ['journal', activeOrganisationId, id],
    queryFn: () => getJournal(activeOrganisationId!, id!),
    enabled: !!activeOrganisationId && !!id,
  });

  const { data: periods } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId && actionPanel === 'reverse',
  });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['journal', activeOrganisationId, id] });
    void qc.invalidateQueries({ queryKey: ['journals', activeOrganisationId] });
  }

  const submitMut = useMutation({
    mutationFn: () => submitJournal(activeOrganisationId!, id!),
    onSuccess: () => { invalidate(); setActionError(''); },
    onError: (e) => setActionError(errMsg(e)),
  });

  const approveMut = useMutation({
    mutationFn: () => approveJournal(activeOrganisationId!, id!, { comments: comments || undefined }),
    onSuccess: () => { invalidate(); setActionPanel(null); setComments(''); setActionError(''); },
    onError: (e) => setActionError(errMsg(e)),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectJournal(activeOrganisationId!, id!, { comments }),
    onSuccess: () => { invalidate(); setActionPanel(null); setComments(''); setActionError(''); },
    onError: (e) => setActionError(errMsg(e)),
  });

  const postMut = useMutation({
    mutationFn: () => postJournal(activeOrganisationId!, id!),
    onSuccess: () => { invalidate(); setActionError(''); },
    onError: (e) => setActionError(errMsg(e)),
  });

  const reverseMut = useMutation({
    mutationFn: () =>
      reverseJournal(activeOrganisationId!, id!, {
        reverseDate,
        periodId: reversePeriodId,
        description: reverseDesc || undefined,
      }),
    onSuccess: (rev) => { invalidate(); void navigate(`/journals/${rev.id}`); },
    onError: (e) => setActionError(errMsg(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteJournal(activeOrganisationId!, id!),
    onSuccess: () => void navigate('/journals'),
    onError: (e) => setActionError(errMsg(e)),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!journal) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Journal entry not found.</div>;
  }

  const lines = journal.lines ?? [];
  const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debitAmount || '0'), 0);
  const totalCredit = lines.reduce((s, l) => s + parseFloat(l.creditAmount || '0'), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0001;
  const isDraft = journal.status === 'DRAFT';
  const isPending = journal.status === 'PENDING_APPROVAL';
  const isApproved = journal.status === 'APPROVED';
  const isPosted = journal.status === 'POSTED';

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* Breadcrumb — only shown when drilled down from account ledger */}
      {drillFrom && drillFromLabel && (
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
          <Link to="/ledger/trial-balance" className="hover:text-foreground transition-colors">
            Trial Balance
          </Link>
          {drillTbLabel && (
            <>
              <ChevronRight size={13} className="shrink-0" />
              <span>{drillTbLabel}</span>
            </>
          )}
          <ChevronRight size={13} className="shrink-0" />
          <button
            onClick={() => navigate(drillFrom)}
            className="hover:text-foreground transition-colors"
          >
            {drillFromLabel}
          </button>
          <ChevronRight size={13} className="shrink-0" />
          <span className="text-foreground font-medium">{journal.journalNumber}</span>
        </nav>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} title="Back">
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold font-mono">{journal.journalNumber}</h1>
              <Badge variant={STATUS_VARIANT[journal.status] ?? 'secondary'}>
                {journal.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-lg">{journal.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {isDraft && (
            <>
              <Link to={`/journals/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit size={13} className="mr-1" /> Edit
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive border-destructive/30"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (confirm('Delete this draft? This cannot be undone.')) deleteMut.mutate();
                }}
              >
                <Trash2 size={13} className="mr-1" /> Delete
              </Button>
              <Button size="sm" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
                <Send size={13} className="mr-1" />
                {submitMut.isPending ? 'Submitting…' : 'Submit for Approval'}
              </Button>
            </>
          )}
          {isPending && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActionPanel(actionPanel === 'reject' ? null : 'reject')}
              >
                <XCircle size={13} className="mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => setActionPanel(actionPanel === 'approve' ? null : 'approve')}
              >
                <CheckCircle size={13} className="mr-1" /> Approve
              </Button>
            </>
          )}
          {isApproved && (
            <Button size="sm" onClick={() => postMut.mutate()} disabled={postMut.isPending}>
              <BookOpen size={13} className="mr-1" />
              {postMut.isPending ? 'Posting…' : 'Post to Ledger'}
            </Button>
          )}
          {isPosted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActionPanel(actionPanel === 'reverse' ? null : 'reverse')}
            >
              <RotateCcw size={13} className="mr-1" /> Reverse
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3 border border-destructive/20">
          <AlertCircle size={14} /> {actionError}
          <button className="ml-auto text-xs underline" onClick={() => setActionError('')}>Dismiss</button>
        </div>
      )}

      {/* Approve panel */}
      {actionPanel === 'approve' && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800">Approve Journal Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Comments (optional)</label>
              <Input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add approval notes…" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                {approveMut.isPending ? 'Approving…' : 'Confirm Approval'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setActionPanel(null); setComments(''); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reject panel */}
      {actionPanel === 'reject' && (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-800">Reject Journal Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Reason for rejection *</label>
              <Input
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="State reason for rejection…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={!comments.trim() || rejectMut.isPending}
                onClick={() => rejectMut.mutate()}
              >
                {rejectMut.isPending ? 'Rejecting…' : 'Confirm Rejection'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setActionPanel(null); setComments(''); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reverse panel */}
      {actionPanel === 'reverse' && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800">Reverse Journal Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A new journal entry will be created with all debits and credits swapped.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block">Reversal Date *</label>
                <Input type="date" value={reverseDate} onChange={(e) => setReverseDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
                <Select value={reversePeriodId} onChange={(e) => setReversePeriodId(e.target.value)}>
                  <option value="">Select period…</option>
                  {openPeriods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.fiscalYear})</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block">Description (optional)</label>
                <Input
                  value={reverseDesc}
                  onChange={(e) => setReverseDesc(e.target.value)}
                  placeholder="Reason for reversal…"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!reverseDate || !reversePeriodId || reverseMut.isPending}
                onClick={() => reverseMut.mutate()}
              >
                {reverseMut.isPending ? 'Reversing…' : 'Create Reversal Entry'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setActionPanel(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reversal link notice */}
      {journal.reversalEntry && (
        <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-md px-4 py-2 border">
          <RotateCcw size={13} className="text-muted-foreground" />
          Reversed by{' '}
          <Link
            to={`/journals/${journal.reversalEntry.id}`}
            className="font-mono text-primary hover:underline flex items-center gap-1"
          >
            {journal.reversalEntry.journalNumber} <ExternalLink size={11} />
          </Link>
        </div>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        {[
          { label: 'Type', value: TYPE_LABELS[journal.type] ?? journal.type },
          { label: 'Entry Date', value: new Date(journal.entryDate).toLocaleDateString() },
          {
            label: 'Period',
            value: journal.period ? `${journal.period.name} (${journal.period.fiscalYear})` : '—',
          },
          { label: 'Currency', value: journal.currency },
          journal.reference ? { label: 'Reference', value: journal.reference } : null,
          journal.creator
            ? { label: 'Created By', value: `${journal.creator.firstName} ${journal.creator.lastName}` }
            : null,
          journal.createdAt
            ? { label: 'Created At', value: new Date(journal.createdAt).toLocaleString() }
            : null,
          journal.approver
            ? { label: 'Approved By', value: `${journal.approver.firstName} ${journal.approver.lastName}` }
            : null,
          journal.approvedAt
            ? { label: 'Approved At', value: new Date(journal.approvedAt).toLocaleString() }
            : null,
          journal.poster
            ? { label: 'Posted By', value: `${journal.poster.firstName} ${journal.poster.lastName}` }
            : null,
          journal.postedAt
            ? { label: 'Posted At', value: new Date(journal.postedAt).toLocaleString() }
            : null,
        ]
          .filter(Boolean)
          .map((item) => (
            <div key={item!.label}>
              <p className="text-xs text-muted-foreground">{item!.label}</p>
              <p className="text-sm font-medium">{item!.value}</p>
            </div>
          ))}
      </div>

      {/* Lines table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Journal Lines</CardTitle>
            <div
              className={cn(
                'text-xs font-mono px-2 py-1 rounded-md',
                isBalanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
              )}
            >
              DR {totalDebit.toFixed(2)} / CR {totalCredit.toFixed(2)} {isBalanced ? '✓' : '— unbalanced'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground w-32">
                    Debit ({journal.currency})
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground w-32">
                    Credit ({journal.currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{line.lineNumber}</td>
                    <td className="px-4 py-2">
                      {line.account ? (
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-mono text-xs text-primary">{line.account.code}</span>
                          <span className="text-sm">{line.account.name}</span>
                          <span className="text-xs text-muted-foreground">({line.account.class})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">{line.accountId}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{line.description ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {parseFloat(line.debitAmount) > 0 ? fmt(line.debitAmount) : ''}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {parseFloat(line.creditAmount) > 0 ? fmt(line.creditAmount) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20">
                  <td colSpan={3} className="px-4 py-2 text-xs font-medium text-muted-foreground">Total</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{totalDebit.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{totalCredit.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
