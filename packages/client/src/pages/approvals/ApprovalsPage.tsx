import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, GitBranch, Plus, Settings, Trash2, UserPlus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listRequests, getRequest, decide, listWorkflows, createWorkflow,
  getWorkflow, updateWorkflow, addLevel, removeLevel, addApprover, removeApprover,
} from '@/services/approvals.service';
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

const ENTITY_TYPES = [
  'JOURNAL_ENTRY', 'PAYMENT', 'PURCHASE_ORDER', 'SALES_INVOICE',
  'EXPENSE_CLAIM', 'BUDGET', 'PAYROLL', 'BANK_TRANSFER',
];

const APPROVAL_TYPES = [
  { value: 'ANY_ONE', label: 'Any One Approver' },
  { value: 'ALL_REQUIRED', label: 'All Approvers Required' },
  { value: 'MAJORITY', label: 'Majority Vote' },
];

const APPROVAL_TYPE_BADGE: Record<string, string> = {
  ANY_ONE: 'Any one',
  ALL_REQUIRED: 'All required',
  MAJORITY: 'Majority',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'destructive',
  ESCALATED: 'info',
  WITHDRAWN: 'secondary',
};

// ─── New Workflow Dialog ──────────────────────────────────────────────────────

function NewWorkflowDialog({ organisationId, onClose }: { organisationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState('');

  const mutation = useMutation({
    mutationFn: () => createWorkflow(organisationId, { name: name.trim(), description: description.trim() || undefined, entityType }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval-workflows'] });
      onClose();
    },
  });

  return (
    <DialogContent className="max-w-md" title="New Workflow" description="Configure a new approval workflow.">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium">Workflow Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Journal Entry Approval" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Applies To *</label>
          <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-8 text-xs">
            <option value="">Select entity type…</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description…" className="h-8 text-xs" />
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

  // Add level form state
  const [levelName, setLevelName] = useState('');
  const [approvalType, setApprovalType] = useState('ANY_ONE');
  const [escalationHours, setEscalationHours] = useState('');

  // Approver picker state per level
  const [approverPickerId, setApproverPickerId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: workflow, isLoading } = useQuery({
    queryKey: ['approval-workflow-detail', workflowId],
    queryFn: () => getWorkflow(organisationId, workflowId),
  });

  const { data: orgUsers } = useQuery({
    queryKey: ['org-users', organisationId],
    queryFn: () => listOrgUsers(organisationId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['approval-workflow-detail', workflowId] });
    void qc.invalidateQueries({ queryKey: ['approval-workflows'] });
  };

  const toggleActive = useMutation({
    mutationFn: () => updateWorkflow(organisationId, workflowId, { isActive: !workflow?.isActive }),
    onSuccess: invalidate,
  });

  const addLevelMutation = useMutation({
    mutationFn: () => addLevel(organisationId, workflowId, {
      levelNumber: (workflow?.levels?.length ?? 0) + 1,
      name: levelName.trim(),
      approvalType,
      escalationHours: escalationHours ? parseInt(escalationHours) : undefined,
    }),
    onSuccess: () => {
      invalidate();
      setLevelName('');
      setApprovalType('ANY_ONE');
      setEscalationHours('');
      setShowAddLevel(false);
    },
  });

  const removeLevelMutation = useMutation({
    mutationFn: (levelId: string) => removeLevel(organisationId, workflowId, levelId),
    onSuccess: invalidate,
  });

  const addApproverMutation = useMutation({
    mutationFn: ({ levelId, userId }: { levelId: string; userId: string }) =>
      addApprover(organisationId, workflowId, levelId, userId),
    onSuccess: () => {
      invalidate();
      setSelectedUserId('');
      setApproverPickerId(null);
    },
  });

  const removeApproverMutation = useMutation({
    mutationFn: ({ levelId, userId }: { levelId: string; userId: string }) =>
      removeApprover(organisationId, workflowId, levelId, userId),
    onSuccess: invalidate,
  });

  const levels = [...(workflow?.levels ?? [])].sort((a, b) => a.levelNumber - b.levelNumber);

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" title="Workflow Configuration" description="Manage approval levels and approvers.">
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : workflow ? (
        <div className="space-y-5">

          {/* Header */}
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

          {/* Levels */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Approval Levels</p>
              <Button size="sm" variant="outline" onClick={() => setShowAddLevel((v) => !v)}>
                <Plus size={13} /> Add Level
              </Button>
            </div>

            {levels.length === 0 && !showAddLevel && (
              <div className="py-8 text-center border-2 border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">No levels yet. Add at least one level to activate this workflow.</p>
              </div>
            )}

            {levels.map((level) => {
              const isExpanded = expandedLevelId === level.id;
              const existingApproverIds = new Set(level.approvers.map((a) => a.userId));
              const availableUsers = (orgUsers ?? []).filter((u) => !existingApproverIds.has(u.userId));

              return (
                <div key={level.id} className="border rounded-lg overflow-hidden">
                  {/* Level header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {level.levelNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{level.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {APPROVAL_TYPE_BADGE[level.approvalType]} · {level.approvers.length} approver{level.approvers.length !== 1 ? 's' : ''}
                        {level.escalationHours ? ` · escalates after ${level.escalationHours}h` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{APPROVAL_TYPE_BADGE[level.approvalType]}</Badge>
                    <button
                      onClick={() => setExpandedLevelId(isExpanded ? null : level.id)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => removeLevelMutation.mutate(level.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Remove level"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Level body — approvers */}
                  {isExpanded && (
                    <div className="px-4 py-3 space-y-3">
                      {/* Approver chips */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Approvers</p>
                        {level.approvers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No approvers assigned — add at least one.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {level.approvers.map((a) => (
                              <div key={a.userId} className="flex items-center gap-1.5 bg-accent rounded-full pl-3 pr-1.5 py-1">
                                <span className="text-xs font-medium">{a.user.firstName} {a.user.lastName}</span>
                                <button
                                  onClick={() => removeApproverMutation.mutate({ levelId: level.id, userId: a.userId })}
                                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add approver */}
                      {approverPickerId === level.id ? (
                        <div className="flex gap-2 items-center">
                          <Select
                            className="h-8 text-xs flex-1"
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                          >
                            <option value="">Select a user…</option>
                            {availableUsers.map((u) => (
                              <option key={u.userId} value={u.userId}>
                                {u.user.firstName} {u.user.lastName} ({u.role.replace(/_/g, ' ')})
                              </option>
                            ))}
                          </Select>
                          <Button
                            size="sm"
                            disabled={!selectedUserId || addApproverMutation.isPending}
                            onClick={() => addApproverMutation.mutate({ levelId: level.id, userId: selectedUserId })}
                          >
                            Add
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setApproverPickerId(null); setSelectedUserId(''); }}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setApproverPickerId(level.id); setSelectedUserId(''); }}
                          disabled={availableUsers.length === 0}
                        >
                          <UserPlus size={13} /> Add Approver
                          {availableUsers.length === 0 && ' (all members added)'}
                        </Button>
                      )}
                      {addApproverMutation.isError && (
                        <p className="text-xs text-destructive">{(addApproverMutation.error as Error).message}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add level form */}
            {showAddLevel && (
              <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Level {(workflow.levels?.length ?? 0) + 1}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Level Name *</label>
                    <Input value={levelName} onChange={(e) => setLevelName(e.target.value)} placeholder="e.g. Manager Approval" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Approval Type *</label>
                    <Select value={approvalType} onChange={(e) => setApprovalType(e.target.value)} className="h-8 text-xs">
                      {APPROVAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Escalate after (hours)</label>
                    <Input type="number" min={1} value={escalationHours} onChange={(e) => setEscalationHours(e.target.value)} placeholder="e.g. 48" className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowAddLevel(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={!levelName.trim() || addLevelMutation.isPending}
                    onClick={() => addLevelMutation.mutate()}
                  >
                    {addLevelMutation.isPending ? 'Adding…' : 'Add Level'}
                  </Button>
                </div>
                {addLevelMutation.isError && (
                  <p className="text-xs text-destructive">{(addLevelMutation.error as Error).message}</p>
                )}
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

  const { data: request, isLoading } = useQuery({
    queryKey: ['approval-request', requestId],
    queryFn: () => getRequest(organisationId, requestId),
  });

  const mutation = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => decide(organisationId, requestId, { decision, comments: comment || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      onClose();
    },
  });

  return (
    <DialogContent className="max-w-lg" title="Approval Request" description="Review and act on this approval request.">
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : request ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{request.entityType.replace(/_/g, ' ')}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_VARIANT[request.status] ?? 'secondary'} className="ml-1">{request.status}</Badge></div>
            <div><span className="text-muted-foreground">Requested by:</span> <span className="font-medium">{request.requester?.firstName} {request.requester?.lastName}</span></div>
            <div><span className="text-muted-foreground">Level:</span> <span className="font-medium">{request.currentLevel}</span></div>
            <div><span className="text-muted-foreground">Workflow:</span> <span className="font-medium">{request.workflow?.name ?? '—'}</span></div>
            <div><span className="text-muted-foreground">Requested:</span> <span className="font-medium">{new Date(request.requestedAt).toLocaleDateString()}</span></div>
          </div>

          {(request.decisions ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2">Decision History</p>
              <div className="space-y-2">
                {(request.decisions ?? []).map((d) => (
                  <div key={d.id} className="text-xs border rounded p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Level {d.levelNumber} — {d.decider?.firstName} {d.decider?.lastName}</span>
                      <Badge variant={d.decision === 'APPROVED' ? 'success' : 'destructive'} className="text-[10px]">{d.decision}</Badge>
                    </div>
                    {d.comments && <p className="text-muted-foreground mt-1">{d.comments}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.status === 'PENDING' && (
            <div className="space-y-2 pt-2 border-t">
              <label className="text-xs font-medium">Comment (optional)</label>
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="h-8 text-xs" />
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive hover:bg-destructive/10"
                  disabled={mutation.isPending} onClick={() => mutation.mutate('REJECTED')}>
                  <XCircle size={14} /> Reject
                </Button>
                <Button size="sm" className="flex-1" disabled={mutation.isPending} onClick={() => mutation.mutate('APPROVED')}>
                  <CheckCircle size={14} /> Approve
                </Button>
              </div>
            </div>
          )}

          {request.status !== 'PENDING' && (
            <div className="flex justify-end pt-2 border-t">
              <DialogClose asChild><Button variant="outline" size="sm" onClick={onClose}>Close</Button></DialogClose>
            </div>
          )}
        </div>
      ) : null}
    </DialogContent>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'requests' | 'workflows'>('requests');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const { data: requestData, isLoading } = useQuery({
    queryKey: ['approvals', activeOrganisationId, statusFilter],
    queryFn: () => listRequests(activeOrganisationId!, { status: statusFilter || undefined }),
    enabled: !!activeOrganisationId && tab === 'requests',
  });

  const { data: workflows, isLoading: workflowsLoading } = useQuery({
    queryKey: ['approval-workflows', activeOrganisationId],
    queryFn: () => listWorkflows(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'workflows',
  });

  const pendingCount = (requestData?.requests ?? []).filter((r) => r.status === 'PENDING').length;

  const tabs = [
    { id: 'requests', label: `Approval Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: Clock },
    { id: 'workflows', label: 'Workflows', icon: GitBranch },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><CheckCircle size={18} /> Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review and act on pending approval requests</p>
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
          <Button size="sm" onClick={() => setShowNewWorkflow(true)}>
            <Plus size={14} /> New Workflow
          </Button>
        )}
      </div>

      {/* ── Approval Requests tab ── */}
      {tab === 'requests' && (
        <>
          <div className="flex gap-2">
            {['', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1 text-xs rounded-full border transition-colors',
                  statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent')}>
                {s || 'All'}
              </button>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (requestData?.requests ?? []).length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">No {statusFilter.toLowerCase() || ''} approval requests.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(requestData?.requests ?? []).map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="text-sm font-medium">{req.entityType.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{req.workflow?.name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{req.requester?.firstName} {req.requester?.lastName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(req.requestedAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">{req.currentLevel}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>{req.status}</Badge></TableCell>
                        <TableCell>
                          <button onClick={() => setSelectedRequestId(req.id)} className="text-xs text-primary hover:underline">
                            {req.status === 'PENDING' ? 'Review' : 'View'}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Workflows tab ── */}
      {tab === 'workflows' && (
        <Card>
          <CardContent className="p-0">
            {workflowsLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (workflows ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <GitBranch size={28} className="mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No approval workflows yet.</p>
                <Button size="sm" variant="outline" onClick={() => setShowNewWorkflow(true)}>
                  <Plus size={14} /> Create your first workflow
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Levels</TableHead>
                    <TableHead>Approvers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(workflows ?? []).map((w) => {
                    const totalApprovers = (w.levels ?? []).reduce((sum, l) => sum + (l.approvers?.length ?? 0), 0);
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="text-sm font-medium">{w.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{w.entityType.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs">{w.levels?.length ?? 0}</TableCell>
                        <TableCell className="text-xs">{totalApprovers}</TableCell>
                        <TableCell><Badge variant={w.isActive ? 'success' : 'secondary'}>{w.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setSelectedWorkflowId(w.id)}>
                            <Settings size={12} /> Configure
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Dialogs ── */}
      {selectedRequestId && activeOrganisationId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedRequestId(null); }}>
          <RequestDetailDialog organisationId={activeOrganisationId} requestId={selectedRequestId} onClose={() => setSelectedRequestId(null)} />
        </Dialog>
      )}

      {showNewWorkflow && activeOrganisationId && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowNewWorkflow(false); }}>
          <NewWorkflowDialog organisationId={activeOrganisationId} onClose={() => setShowNewWorkflow(false)} />
        </Dialog>
      )}

      {selectedWorkflowId && activeOrganisationId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedWorkflowId(null); }}>
          <WorkflowDetailDialog organisationId={activeOrganisationId} workflowId={selectedWorkflowId} onClose={() => setSelectedWorkflowId(null)} />
        </Dialog>
      )}
    </div>
  );
}
