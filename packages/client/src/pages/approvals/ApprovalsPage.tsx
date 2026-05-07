import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Clock, GitBranch, Plus, Settings,
  Trash2, UserPlus, X, ChevronDown, ChevronUp, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as appSvc from '@/services/approvals.service';
import type { ApprovalRequest } from '@/services/approvals.service';
import { getJournal } from '@/services/journals.service';
import { listOrgUsers } from '@/services/organisations.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  'JOURNAL_ENTRY', 'PAYMENT', 'PURCHASE_ORDER', 'SALES_INVOICE',
  'EXPENSE_CLAIM', 'BUDGET', 'PAYROLL', 'BANK_TRANSFER',
];

const APPROVAL_TYPES = [
  { value: 'ANY_ONE',      label: 'Any One Approver' },
  { value: 'ALL_REQUIRED', label: 'All Approvers Required' },
  { value: 'MAJORITY',     label: 'Majority Vote' },
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  APPROVED:  'success',
  PENDING:   'warning',
  REJECTED:  'destructive',
  ESCALATED: 'info',
  WITHDRAWN: 'secondary',
};

const DECISION_BADGE: Record<string, string> = {
  APPROVED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-700',
  DELEGATED: 'bg-blue-100 text-blue-700',
};

function slaStatus(req: ApprovalRequest) {
  if (!req.slaDeadline || req.status !== 'PENDING') return null;
  const deadline = new Date(req.slaDeadline);
  const now      = new Date();
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < 0)  return { label: 'SLA breached',    cls: 'text-red-600 font-semibold' };
  if (hoursLeft < 4)  return { label: `${Math.ceil(hoursLeft)}h left`, cls: 'text-orange-500' };
  if (hoursLeft < 24) return { label: `${Math.ceil(hoursLeft)}h left`, cls: 'text-yellow-600' };
  return null;
}

// ─── New Workflow Dialog ──────────────────────────────────────────────────────

function NewWorkflowDialog({ organisationId, onClose }: { organisationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState('');

  const mutation = useMutation({
    mutationFn: () => appSvc.createWorkflow(organisationId, { name: name.trim(), description: description.trim() || undefined, entityType }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['approval-workflows'] }); onClose(); },
  });

  return (
    <DialogContent className="max-w-md" title="New Workflow" description="Configure a new approval workflow.">
      <div className="space-y-4">
        <div><label className="text-xs font-medium">Workflow Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Journal Entry Approval" className="h-8 text-xs mt-1" />
        </div>
        <div><label className="text-xs font-medium">Applies To *</label>
          <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-8 text-xs mt-1">
            <option value="">Select entity type…</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
        </div>
        <div><label className="text-xs font-medium">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description…" className="h-8 text-xs mt-1" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <DialogClose asChild><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button></DialogClose>
          <Button size="sm" disabled={!name.trim() || !entityType || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Creating…' : 'Create Workflow'}
          </Button>
        </div>
        {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as Error).message}</p>}
      </div>
    </DialogContent>
  );
}

// ─── Workflow Detail Dialog ───────────────────────────────────────────────────

function WorkflowDetailDialog({ organisationId, workflowId, onClose }: { organisationId: string; workflowId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showAddLevel, setShowAddLevel] = useState(false);
  const [expandedLevelId, setExpandedLevelId] = useState<string | null>(null);
  const [levelName, setLevelName] = useState('');
  const [approvalType, setApprovalType] = useState('ANY_ONE');
  const [escalationHours, setEscalationHours] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [approverPickerId, setApproverPickerId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: workflow, isLoading } = useQuery({
    queryKey: ['approval-workflow-detail', workflowId],
    queryFn:  () => appSvc.getWorkflow(organisationId, workflowId),
  });

  const { data: orgUsers } = useQuery({
    queryKey: ['org-users', organisationId],
    queryFn:  () => listOrgUsers(organisationId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['approval-workflow-detail', workflowId] });
    void qc.invalidateQueries({ queryKey: ['approval-workflows'] });
  };

  const toggleActive  = useMutation({ mutationFn: () => appSvc.updateWorkflow(organisationId, workflowId, { isActive: !workflow?.isActive }), onSuccess: invalidate });
  const addLevelMut   = useMutation({
    mutationFn: () => appSvc.addLevel(organisationId, workflowId, {
      levelNumber:       (workflow?.levels?.length ?? 0) + 1,
      name:              levelName.trim(),
      approvalType,
      escalationHours:   escalationHours ? parseInt(escalationHours) : undefined,
      amountThresholdMin: amountMin ? Number(amountMin) : undefined,
      amountThresholdMax: amountMax ? Number(amountMax) : undefined,
    }),
    onSuccess: () => { invalidate(); setLevelName(''); setApprovalType('ANY_ONE'); setEscalationHours(''); setAmountMin(''); setAmountMax(''); setShowAddLevel(false); },
  });
  const removeLevelMut    = useMutation({ mutationFn: (id: string) => appSvc.removeLevel(organisationId, workflowId, id), onSuccess: invalidate });
  const addApproverMut    = useMutation({
    mutationFn: ({ levelId, userId }: { levelId: string; userId: string }) => appSvc.addApprover(organisationId, workflowId, levelId, userId),
    onSuccess:  () => { invalidate(); setSelectedUserId(''); setApproverPickerId(null); },
  });
  const removeApproverMut = useMutation({
    mutationFn: ({ levelId, userId }: { levelId: string; userId: string }) => appSvc.removeApprover(organisationId, workflowId, levelId, userId),
    onSuccess:  invalidate,
  });

  const levels = [...(workflow?.levels ?? [])].sort((a, b) => a.levelNumber - b.levelNumber);

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" title="Workflow Configuration" description="Manage approval levels and approvers.">
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : workflow ? (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b">
            <div>
              <h3 className="font-semibold">{workflow.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{workflow.entityType.replace(/_/g, ' ')} · {workflow.description ?? 'No description'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={workflow.isActive ? 'success' : 'secondary'}>{workflow.isActive ? 'Active' : 'Inactive'}</Badge>
              <Button size="sm" variant="outline" onClick={() => toggleActive.mutate()} disabled={toggleActive.isPending}>
                {workflow.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Approval Levels</p>
              <Button size="sm" variant="outline" onClick={() => setShowAddLevel((v) => !v)}><Plus size={13} /> Add Level</Button>
            </div>

            {levels.length === 0 && !showAddLevel && (
              <div className="py-8 text-center border-2 border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">No levels yet. Add at least one to activate this workflow.</p>
              </div>
            )}

            {levels.map((level, idx) => {
              const isExpanded = expandedLevelId === level.id;
              const existingIds = new Set(level.approvers.map((a) => a.userId));
              const available   = (orgUsers ?? []).filter((u) => !existingIds.has(u.userId));
              return (
                <div key={level.id} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">{level.levelNumber}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{level.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {APPROVAL_TYPES.find((t) => t.value === level.approvalType)?.label} · {level.approvers.length} approver{level.approvers.length !== 1 ? 's' : ''}
                        {level.escalationHours ? ` · escalates after ${level.escalationHours}h` : ''}
                        {level.amountThresholdMin || level.amountThresholdMax ? ` · GHS ${level.amountThresholdMin ?? 0}–${level.amountThresholdMax ?? '∞'}` : ''}
                      </p>
                    </div>
                    {idx < levels.length - 1 && <ArrowRight size={13} className="text-muted-foreground shrink-0" />}
                    <button onClick={() => setExpandedLevelId(isExpanded ? null : level.id)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => removeLevelMut.mutate(level.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 py-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Approvers</p>
                        {level.approvers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No approvers assigned.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {level.approvers.map((a) => (
                              <div key={a.userId} className="flex items-center gap-1.5 bg-accent rounded-full pl-3 pr-1.5 py-1">
                                <span className="text-xs font-medium">{a.user.firstName} {a.user.lastName}</span>
                                <button onClick={() => removeApproverMut.mutate({ levelId: level.id, userId: a.userId })} className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-destructive/20 text-muted-foreground hover:text-destructive"><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {approverPickerId === level.id ? (
                        <div className="flex gap-2 items-center">
                          <Select className="h-8 text-xs flex-1" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                            <option value="">Select a user…</option>
                            {available.map((u) => <option key={u.userId} value={u.userId}>{u.user.firstName} {u.user.lastName} ({u.role.replace(/_/g, ' ')})</option>)}
                          </Select>
                          <Button size="sm" disabled={!selectedUserId || addApproverMut.isPending} onClick={() => addApproverMut.mutate({ levelId: level.id, userId: selectedUserId })}>Add</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setApproverPickerId(null); setSelectedUserId(''); }}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { setApproverPickerId(level.id); setSelectedUserId(''); }} disabled={available.length === 0}>
                          <UserPlus size={13} /> Add Approver{available.length === 0 ? ' (all members added)' : ''}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {showAddLevel && (
              <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level {(workflow.levels?.length ?? 0) + 1}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium">Level Name *</label><Input value={levelName} onChange={(e) => setLevelName(e.target.value)} placeholder="e.g. Manager Approval" className="h-8 text-xs mt-1" /></div>
                  <div><label className="text-xs font-medium">Approval Type *</label>
                    <Select value={approvalType} onChange={(e) => setApprovalType(e.target.value)} className="h-8 text-xs mt-1">
                      {APPROVAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>
                  <div><label className="text-xs font-medium">Escalate after (hours)</label><Input type="number" min={1} value={escalationHours} onChange={(e) => setEscalationHours(e.target.value)} placeholder="e.g. 48" className="h-8 text-xs mt-1" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs font-medium">Min Amount</label><Input type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="0" className="h-8 text-xs mt-1" /></div>
                    <div><label className="text-xs font-medium">Max Amount</label><Input type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="∞" className="h-8 text-xs mt-1" /></div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowAddLevel(false)}>Cancel</Button>
                  <Button size="sm" disabled={!levelName.trim() || addLevelMut.isPending} onClick={() => addLevelMut.mutate()}>
                    {addLevelMut.isPending ? 'Adding…' : 'Add Level'}
                  </Button>
                </div>
                {addLevelMut.isError && <p className="text-xs text-destructive">{(addLevelMut.error as Error).message}</p>}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <DialogClose asChild><Button variant="outline" size="sm" onClick={onClose}>Done</Button></DialogClose>
          </div>
        </div>
      ) : null}
    </DialogContent>
  );
}

// ─── Request Detail Dialog ────────────────────────────────────────────────────

function RequestDetailDialog({ organisationId, requestId, onClose }: { organisationId: string; requestId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [pendingDecision, setPendingDecision] = useState<'APPROVED' | 'REJECTED' | 'DELEGATED' | null>(null);
  const [delegateTo, setDelegateTo] = useState('');

  const { data: request, isLoading } = useQuery({
    queryKey: ['approval-request', requestId],
    queryFn:  () => appSvc.getRequest(organisationId, requestId),
  });

  const isJournal = request?.entityType === 'JOURNAL_ENTRY';
  const { data: journal, isLoading: journalLoading } = useQuery({
    queryKey: ['journal', organisationId, request?.entityId],
    queryFn:  () => getJournal(organisationId, request!.entityId),
    enabled:  isJournal && !!request?.entityId,
  });

  const { data: orgUsers } = useQuery({
    queryKey: ['org-users', organisationId],
    queryFn:  () => listOrgUsers(organisationId),
    enabled:  pendingDecision === 'DELEGATED',
  });

  const mutation = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED' | 'DELEGATED') =>
      appSvc.decide(organisationId, requestId, {
        decision,
        comments:    comment  || undefined,
        delegatedTo: decision === 'DELEGATED' ? delegateTo : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['approval-notifications-count'] });
      onClose();
    },
  });

  const journalLines  = journal?.lines ?? [];
  const totalDebit    = journalLines.reduce((s, l) => s + parseFloat(l.debitAmount  || '0'), 0);
  const totalCredit   = journalLines.reduce((s, l) => s + parseFloat(l.creditAmount || '0'), 0);
  const isPending     = request?.status === 'PENDING';
  const sla           = request ? slaStatus(request) : null;

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" title="Approval Request" description="Review the entry in full before approving or rejecting.">
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : request ? (
        <div className="space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pb-4 border-b">
            <div><span className="text-muted-foreground">Type</span><p className="font-semibold mt-0.5">{request.entityType.replace(/_/g, ' ')}</p></div>
            <div><span className="text-muted-foreground">Status</span><div className="mt-0.5 flex items-center gap-1">
              <Badge variant={STATUS_VARIANT[request.status] ?? 'secondary'}>{request.status}</Badge>
              {request.status === 'ESCALATED' && <span title="Escalated"><AlertTriangle size={12} className="text-orange-500" /></span>}
            </div></div>
            <div><span className="text-muted-foreground">Level</span><p className="font-semibold mt-0.5">{request.currentLevel}</p></div>
            <div><span className="text-muted-foreground">Requested By</span><p className="font-medium mt-0.5">{request.requester?.firstName} {request.requester?.lastName}</p></div>
            <div><span className="text-muted-foreground">Workflow</span><p className="font-medium mt-0.5">{request.workflow?.name ?? '—'}</p></div>
            <div><span className="text-muted-foreground">Submitted</span><p className="font-medium mt-0.5">{new Date(request.requestedAt).toLocaleDateString()}</p></div>
            {request.slaDeadline && (
              <div>
                <span className="text-muted-foreground">SLA Deadline</span>
                <p className={cn('font-medium mt-0.5', sla?.cls)}>{new Date(request.slaDeadline).toLocaleString()}{sla ? ` (${sla.label})` : ''}</p>
              </div>
            )}
          </div>

          {/* Journal detail */}
          {isJournal && (journalLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : journal ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Journal Entry Detail</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/30 rounded-lg p-3">
                <div><span className="text-muted-foreground">Number</span><p className="font-mono font-semibold text-primary mt-0.5">{journal.journalNumber}</p></div>
                <div><span className="text-muted-foreground">Type</span><p className="font-medium mt-0.5">{journal.type.replace(/_/g, ' ')}</p></div>
                <div><span className="text-muted-foreground">Entry Date</span><p className="font-medium mt-0.5">{new Date(journal.entryDate).toLocaleDateString()}</p></div>
                <div><span className="text-muted-foreground">Period</span><p className="font-medium mt-0.5">{journal.period?.name ?? '—'}</p></div>
                <div className="col-span-4"><span className="text-muted-foreground">Description</span><p className="font-medium mt-0.5">{journal.description}</p></div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/40 border-b">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Debit ({journal.currency})</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Credit ({journal.currency})</th>
                  </tr></thead>
                  <tbody>
                    {journalLines.map((line) => (
                      <tr key={line.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{line.lineNumber}</td>
                        <td className="px-3 py-2">
                          {line.account ? <span className="flex items-baseline gap-1.5"><span className="font-mono text-primary">{line.account.code}</span><span>{line.account.name}</span></span>
                            : <span className="font-mono text-muted-foreground">{line.accountId}</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{line.description ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{parseFloat(line.debitAmount)  > 0 ? parseFloat(line.debitAmount).toFixed(2)  : ''}</td>
                        <td className="px-3 py-2 text-right font-mono">{parseFloat(line.creditAmount) > 0 ? parseFloat(line.creditAmount).toFixed(2) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t bg-muted/20 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-muted-foreground">Total</td>
                    <td className="px-3 py-2 text-right font-mono">{totalDebit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{totalCredit.toFixed(2)}</td>
                  </tr></tfoot>
                </table>
              </div>

              <div className={cn('text-xs px-3 py-1.5 rounded-md font-medium', Math.abs(totalDebit - totalCredit) < 0.0001 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                {Math.abs(totalDebit - totalCredit) < 0.0001 ? '✓ Entry is balanced' : `⚠ Unbalanced by ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
              </div>
            </div>
          ) : null)}

          {/* Decision history */}
          {(request.decisions ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Decision History</p>
              <div className="space-y-2">
                {(request.decisions ?? []).map((d) => (
                  <div key={d.id} className="text-xs border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Level {d.levelNumber} — {d.decider?.firstName} {d.decider?.lastName}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', DECISION_BADGE[d.decision] ?? 'bg-gray-100 text-gray-600')}>{d.decision}</span>
                    </div>
                    {d.decision === 'DELEGATED' && d.delegatee && (
                      <p className="text-muted-foreground mt-1">Delegated to: {d.delegatee.firstName} {d.delegatee.lastName}</p>
                    )}
                    {d.comments && <p className="text-muted-foreground mt-1">"{d.comments}"</p>}
                    <p className="text-muted-foreground mt-1">{new Date(d.decidedAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action area */}
          {isPending && (
            <div className="pt-3 border-t space-y-3">
              {pendingDecision === 'REJECTED' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-destructive">Rejection reason <span className="text-destructive">*</span></label>
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="State reason for rejection (required)…" className="h-8 text-xs border-destructive/50" autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={!comment.trim() || mutation.isPending} onClick={() => mutation.mutate('REJECTED')}>
                      <XCircle size={13} className="mr-1" />{mutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setPendingDecision(null); setComment(''); }}>Cancel</Button>
                  </div>
                </div>
              )}

              {pendingDecision === 'APPROVED' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium">Comments (optional)</label>
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add approval notes…" className="h-8 text-xs" autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate('APPROVED')}>
                      <CheckCircle size={13} className="mr-1" />{mutation.isPending ? 'Approving…' : 'Confirm Approval'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setPendingDecision(null); setComment(''); }}>Cancel</Button>
                  </div>
                </div>
              )}

              {pendingDecision === 'DELEGATED' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium">Delegate to</label>
                  <Select value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} className="h-8 text-xs">
                    <option value="">Select user…</option>
                    {(orgUsers ?? []).map((u) => <option key={u.userId} value={u.userId}>{u.user.firstName} {u.user.lastName}</option>)}
                  </Select>
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason for delegation (optional)…" className="h-8 text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!delegateTo || mutation.isPending} onClick={() => mutation.mutate('DELEGATED')}>
                      {mutation.isPending ? 'Delegating…' : 'Confirm Delegation'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setPendingDecision(null); setDelegateTo(''); setComment(''); }}>Cancel</Button>
                  </div>
                </div>
              )}

              {!pendingDecision && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setPendingDecision('REJECTED')}><XCircle size={14} className="mr-1" /> Reject</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setPendingDecision('DELEGATED')}>Delegate</Button>
                  <Button size="sm" className="flex-1" onClick={() => setPendingDecision('APPROVED')}><CheckCircle size={14} className="mr-1" /> Approve</Button>
                </div>
              )}

              {mutation.isError && (
                <p className="text-xs text-destructive">
                  {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to submit decision'}
                </p>
              )}
            </div>
          )}

          {!isPending && (
            <div className="flex justify-end pt-2 border-t">
              <DialogClose asChild><Button variant="outline" size="sm" onClick={onClose}>Close</Button></DialogClose>
            </div>
          )}
        </div>
      ) : null}
    </DialogContent>
  );
}

// ─── Delegations Tab ──────────────────────────────────────────────────────────

function DelegationsTab({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ delegatedTo: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', reason: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: delegations = [], isLoading } = useQuery({
    queryKey: ['approval-delegations', organisationId],
    queryFn:  () => appSvc.listDelegations(organisationId, true),
  });

  const { data: orgUsers } = useQuery({
    queryKey: ['org-users', organisationId],
    queryFn:  () => listOrgUsers(organisationId),
    enabled:  open,
  });

  const create = useMutation({
    mutationFn: () => appSvc.createDelegation(organisationId, { delegatedTo: form.delegatedTo, validFrom: form.validFrom, validTo: form.validTo, reason: form.reason || undefined }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['approval-delegations', organisationId] }); setOpen(false); },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => appSvc.revokeDelegation(organisationId, id),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['approval-delegations', organisationId] }),
  });

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Delegate your approval authority to a colleague for a fixed period. All delegations are permanently logged.</p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> New Delegation</Button>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Delegated To</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
            <TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {delegations.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No delegations — you can delegate while on leave or unavailable</TableCell></TableRow>
            )}
            {delegations.map((d) => {
              const now     = new Date();
              const isLive  = d.isActive && new Date(d.validFrom) <= now && new Date(d.validTo) >= now;
              const expired = new Date(d.validTo) < now;
              return (
                <TableRow key={d.id} className={!d.isActive || expired ? 'opacity-50' : ''}>
                  <TableCell>{d.delegatee?.firstName} {d.delegatee?.lastName}</TableCell>
                  <TableCell className="text-xs">{new Date(d.validFrom).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">{new Date(d.validTo).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.reason ?? '—'}</TableCell>
                  <TableCell>
                    {!d.isActive ? <Badge variant="secondary">Revoked</Badge>
                      : expired    ? <Badge variant="secondary">Expired</Badge>
                      : isLive     ? <Badge variant="success">Active</Badge>
                      : <Badge variant="warning">Upcoming</Badge>}
                  </TableCell>
                  <TableCell>
                    {d.isActive && !expired && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke.mutate(d.id)} disabled={revoke.isPending}>Revoke</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" title="New Delegation">
          <div className="space-y-3">
            <div><label className="text-xs font-medium">Delegate To *</label>
              <Select value={form.delegatedTo} onChange={(e) => set('delegatedTo', e.target.value)} className="h-8 text-xs mt-1">
                <option value="">Select user…</option>
                {(orgUsers ?? []).map((u) => <option key={u.userId} value={u.userId}>{u.user.firstName} {u.user.lastName}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Valid From *</label><Input type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} className="h-8 text-xs mt-1" /></div>
              <div><label className="text-xs font-medium">Valid To *</label><Input type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} className="h-8 text-xs mt-1" /></div>
            </div>
            <div><label className="text-xs font-medium">Reason</label><Input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Annual leave" className="h-8 text-xs mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.delegatedTo || !form.validFrom || !form.validTo || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Creating…' : 'Create Delegation'}
            </Button>
          </div>
          {create.isError && <p className="text-xs text-destructive">{(create.error as Error).message}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'requests' | 'workflows' | 'delegations';

export function ApprovalsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<Tab>('requests');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const orgId = activeOrganisationId!;

  const { data: requestData, isLoading } = useQuery({
    queryKey: ['approvals', orgId, statusFilter],
    queryFn:  () => appSvc.listRequests(orgId, { status: statusFilter || undefined }),
    enabled:  !!orgId && tab === 'requests',
  });

  const { data: workflows, isLoading: workflowsLoading } = useQuery({
    queryKey: ['approval-workflows', orgId],
    queryFn:  () => appSvc.listWorkflows(orgId),
    enabled:  !!orgId && tab === 'workflows',
  });

  const pendingCount = (requestData?.requests ?? []).filter((r) => r.status === 'PENDING').length;

  const tabs = [
    { id: 'requests'    as Tab, label: `Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: Clock },
    { id: 'workflows'   as Tab, label: 'Workflows',   icon: GitBranch },
    { id: 'delegations' as Tab, label: 'Delegations', icon: UserPlus },
  ];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><CheckCircle size={18} /> Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Internal control engine — multi-level workflows, SLA tracking, segregation of duties</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {tab === 'workflows' && (
          <Button size="sm" onClick={() => setShowNewWorkflow(true)}><Plus size={14} /> New Workflow</Button>
        )}
      </div>

      {/* Requests Tab */}
      {tab === 'requests' && (
        <>
          <div className="flex gap-2">
            {['', 'PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1 text-xs rounded-full border transition-colors',
                  statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent')}>
                {s || 'All'}
              </button>
            ))}
          </div>
          <Card><CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (requestData?.requests ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No {statusFilter.toLowerCase() || ''} approval requests.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Type</TableHead><TableHead>Workflow</TableHead><TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead><TableHead>Level</TableHead><TableHead>SLA</TableHead><TableHead>Status</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {(requestData?.requests ?? []).map((req) => {
                    const sla = slaStatus(req);
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="text-sm font-medium">{req.entityType.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{req.workflow?.name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{req.requester?.firstName} {req.requester?.lastName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(req.requestedAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">{req.currentLevel}</TableCell>
                        <TableCell className="text-xs">{sla ? <span className={sla.cls}>{sla.label}</span> : '—'}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>{req.status}</Badge></TableCell>
                        <TableCell>
                          <button onClick={() => setSelectedRequestId(req.id)} className="text-xs text-primary hover:underline">
                            {req.status === 'PENDING' ? 'Review' : 'View'}
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </>
      )}

      {/* Workflows Tab */}
      {tab === 'workflows' && (
        <Card><CardContent className="p-0">
          {workflowsLoading ? (
            <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (workflows ?? []).length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <GitBranch size={28} className="mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No approval workflows yet.</p>
              <Button size="sm" variant="outline" onClick={() => setShowNewWorkflow(true)}><Plus size={14} /> Create your first workflow</Button>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Applies To</TableHead><TableHead>Levels</TableHead>
                <TableHead>Approvers</TableHead><TableHead>Requests</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {(workflows ?? []).map((w) => {
                  const totalApprovers = (w.levels ?? []).reduce((s, l) => s + (l.approvers?.length ?? 0), 0);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm font-medium">{w.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.entityType.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs">{w.levels?.length ?? 0}</TableCell>
                      <TableCell className="text-xs">{totalApprovers}</TableCell>
                      <TableCell className="text-xs">{w._count?.requests ?? 0}</TableCell>
                      <TableCell><Badge variant={w.isActive ? 'success' : 'secondary'}>{w.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setSelectedWorkflowId(w.id)}><Settings size={12} /> Configure</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      )}

      {/* Delegations Tab */}
      {tab === 'delegations' && <DelegationsTab organisationId={orgId} />}

      {/* Dialogs */}
      {selectedRequestId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedRequestId(null); }}>
          <RequestDetailDialog organisationId={orgId} requestId={selectedRequestId} onClose={() => setSelectedRequestId(null)} />
        </Dialog>
      )}
      {showNewWorkflow && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowNewWorkflow(false); }}>
          <NewWorkflowDialog organisationId={orgId} onClose={() => setShowNewWorkflow(false)} />
        </Dialog>
      )}
      {selectedWorkflowId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedWorkflowId(null); }}>
          <WorkflowDetailDialog organisationId={orgId} workflowId={selectedWorkflowId} onClose={() => setSelectedWorkflowId(null)} />
        </Dialog>
      )}
    </div>
  );
}
