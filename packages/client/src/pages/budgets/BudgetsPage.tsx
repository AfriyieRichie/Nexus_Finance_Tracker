import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PiggyBank, Plus, CheckCircle, BarChart3, Building2, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listBudgets, createBudget, approveBudget, getBudgetVariance,
  listCostCentres, createCostCentre, listDepartments, createDepartment,
} from '@/services/budgets.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function NewBudgetDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const mutation = useMutation({
    mutationFn: () => createBudget(organisationId, { name, fiscalYear: Number(fiscalYear) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['budgets'] }); setOpen(false); setName(''); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Budget</Button>
      </DialogTrigger>
      <DialogContent title="New Budget" description="Create an annual budget for this organisation.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Budget Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual Budget 2025" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Fiscal Year *</label>
            <Input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className="h-8 text-xs" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!name || !fiscalYear || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCostCentreDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const mutation = useMutation({
    mutationFn: () => createCostCentre(organisationId, { code, name }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cost-centres'] }); setOpen(false); setCode(''); setName(''); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Cost Centre</Button>
      </DialogTrigger>
      <DialogContent title="New Cost Centre" description="Add a cost centre for departmental reporting.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CC001" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance" className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!code || !name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VarianceView({ organisationId, budgetId, budgetName }: { organisationId: string; budgetId: string; budgetName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['budget-variance', organisationId, budgetId],
    queryFn: () => getBudgetVariance(organisationId, budgetId),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Budget vs Actual — {budgetName}</p>
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Budgeted</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((line) => (
                  <TableRow key={line.accountId}>
                    <TableCell className="text-sm">{line.accountCode} — {line.accountName}</TableCell>
                    <TableCell className="text-right text-xs">{line.budgeted.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-xs">{line.actual.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className={cn('text-right text-xs font-semibold', line.variance < 0 ? 'text-destructive' : 'text-green-600')}>
                      {line.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={cn('text-right text-xs', line.variancePct < 0 ? 'text-destructive' : 'text-green-600')}>
                      {line.variancePct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function BudgetsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'budgets' | 'cost-centres' | 'departments'>('budgets');
  const [varianceBudget, setVarianceBudget] = useState<{ id: string; name: string } | null>(null);

  const { data: budgets, isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', activeOrganisationId],
    queryFn: () => listBudgets(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'budgets',
  });

  const { data: costCentres, isLoading: ccLoading } = useQuery({
    queryKey: ['cost-centres', activeOrganisationId],
    queryFn: () => listCostCentres(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'cost-centres',
  });

  const { data: departments, isLoading: deptLoading } = useQuery({
    queryKey: ['departments', activeOrganisationId],
    queryFn: () => listDepartments(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'departments',
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveBudget(activeOrganisationId!, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets'] }),
  });

  const tabs = [
    { id: 'budgets', label: 'Budgets', icon: PiggyBank },
    { id: 'cost-centres', label: 'Cost Centres', icon: Building2 },
    { id: 'departments', label: 'Departments', icon: Users },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PiggyBank size={18} /> Budgets & Cost Centres
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Annual budgets, variance analysis, and departmental structure</p>
        </div>
        <div className="flex gap-2">
          {tab === 'budgets' && activeOrganisationId && <NewBudgetDialog organisationId={activeOrganisationId} />}
          {tab === 'cost-centres' && activeOrganisationId && <NewCostCentreDialog organisationId={activeOrganisationId} />}
          {tab === 'departments' && activeOrganisationId && (
            <Dialog>
              <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Department</Button></DialogTrigger>
              <DialogContent title="New Department" description="">
                <DeptForm organisationId={activeOrganisationId} onSuccess={() => void qc.invalidateQueries({ queryKey: ['departments'] })} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setVarianceBudget(null); }}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'budgets' && !varianceBudget && (
        <Card>
          <CardContent className="p-0">
            {budgetsLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (budgets ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No budgets yet.</p>
                <p className="text-xs text-muted-foreground">Click <strong>New Budget</strong> to create one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Fiscal Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(budgets ?? []).map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm font-medium">{b.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.fiscalYear}</TableCell>
                      <TableCell>
                        <Badge variant={b.isApproved ? 'success' : 'secondary'}>{b.isApproved ? 'Approved' : 'Draft'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-3">
                          <button onClick={() => setVarianceBudget({ id: b.id, name: b.name })}
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            <BarChart3 size={12} /> Variance
                          </button>
                          {!b.isApproved && (
                            <button onClick={() => approveMutation.mutate(b.id)}
                              disabled={approveMutation.isPending}
                              className="text-xs text-green-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                              <CheckCircle size={12} /> Approve
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'budgets' && varianceBudget && activeOrganisationId && (
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setVarianceBudget(null)}>← Back to Budgets</Button>
          <VarianceView organisationId={activeOrganisationId} budgetId={varianceBudget.id} budgetName={varianceBudget.name} />
        </div>
      )}

      {tab === 'cost-centres' && (
        <Card>
          <CardContent className="p-0">
            {ccLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (costCentres ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No cost centres yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(costCentres ?? []).map((cc) => (
                    <TableRow key={cc.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">{cc.code}</TableCell>
                      <TableCell className="text-sm font-medium">{cc.name}</TableCell>
                      <TableCell><Badge variant={cc.isActive ? 'success' : 'secondary'}>{cc.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'departments' && (
        <Card>
          <CardContent className="p-0">
            {deptLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (departments ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No departments yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(departments ?? []).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">{d.code}</TableCell>
                      <TableCell className="text-sm font-medium">{d.name}</TableCell>
                      <TableCell><Badge variant={d.isActive ? 'success' : 'secondary'}>{d.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeptForm({ organisationId, onSuccess }: { organisationId: string; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: () => createDepartment(organisationId, { code, name }),
    onSuccess,
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block">Code *</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DEPT001" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance" className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
        <Button size="sm" disabled={!code || !name || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  );
}
