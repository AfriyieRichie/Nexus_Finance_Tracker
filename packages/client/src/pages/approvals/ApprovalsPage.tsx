import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, GitBranch } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listRequests, getRequest, decide, listWorkflows } from '@/services/approvals.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'destructive',
  ESCALATED: 'info',
  WITHDRAWN: 'secondary',
};

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

export function ApprovalsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'requests' | 'workflows'>('requests');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

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
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <CheckCircle size={18} /> Approvals
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review and act on pending approval requests</p>
      </div>

      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

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
                          <button onClick={() => setSelectedRequestId(req.id)}
                            className="text-xs text-primary hover:underline">
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

      {tab === 'workflows' && (
        <Card>
          <CardContent className="p-0">
            {workflowsLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (workflows ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No approval workflows configured.</p>
                <p className="text-xs text-muted-foreground">Workflows are created via the Admin panel.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Levels</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(workflows ?? []).map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm font-medium">{w.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.entityType.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs">{w.levels?.length ?? 0} levels</TableCell>
                      <TableCell><Badge variant={w.isActive ? 'success' : 'secondary'}>{w.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {selectedRequestId && activeOrganisationId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedRequestId(null); }}>
          <RequestDetailDialog
            organisationId={activeOrganisationId}
            requestId={selectedRequestId}
            onClose={() => setSelectedRequestId(null)}
          />
        </Dialog>
      )}
    </div>
  );
}
