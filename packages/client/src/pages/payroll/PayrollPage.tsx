import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { processPayroll, listPayrollEntries } from '@/services/payroll.service';
import { listAccounts } from '@/services/accounts.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

function ProcessPayrollDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: open,
  });
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId],
    queryFn: () => listAccounts(organisationId, { pageSize: 200 }),
    enabled: open,
  });

  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');
  const allAccounts = accountsData?.accounts ?? [];
  const expenseAccounts = allAccounts.filter((a) => a.class === 'EXPENSE' && a.isActive);
  const liabilityAccounts = allAccounts.filter((a) => a.class === 'LIABILITY' && a.isActive);
  const bankAccounts = allAccounts.filter((a) => (a.type === 'BANK' || a.type === 'CASH') && a.isActive);

  const [form, setForm] = useState({
    periodId: '',
    payrollDate: new Date().toISOString().split('T')[0],
    description: '',
    grossSalaries: '',
    payeTax: '',
    pensionEmployee: '',
    pensionEmployer: '',
    otherDeductions: '0',
    netPay: '',
    wagesAccountId: '',
    taxPayableAccountId: '',
    pensionPayableAccountId: '',
    bankAccountId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const computedNet = Number(form.grossSalaries || 0)
    - Number(form.payeTax || 0)
    - Number(form.pensionEmployee || 0)
    - Number(form.otherDeductions || 0);

  const mutation = useMutation({
    mutationFn: () => processPayroll(organisationId, {
      periodId: form.periodId,
      payrollDate: form.payrollDate,
      description: form.description,
      grossSalaries: Number(form.grossSalaries),
      payeTax: Number(form.payeTax),
      pensionEmployee: Number(form.pensionEmployee),
      pensionEmployer: Number(form.pensionEmployer),
      otherDeductions: Number(form.otherDeductions),
      netPay: Number(form.netPay || computedNet),
      wagesAccountId: form.wagesAccountId,
      taxPayableAccountId: form.taxPayableAccountId,
      pensionPayableAccountId: form.pensionPayableAccountId,
      bankAccountId: form.bankAccountId,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll'] });
      setOpen(false);
    },
  });

  const canSubmit = form.periodId && form.description && form.grossSalaries &&
    form.wagesAccountId && form.taxPayableAccountId && form.pensionPayableAccountId && form.bankAccountId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> Process Payroll</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" title="Process Payroll" description="Enter payroll summary figures to auto-generate the payroll journal entry.">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
              <Select value={form.periodId} onChange={(e) => set('periodId', e.target.value)}>
                <option value="">Select period…</option>
                {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Payroll Date *</label>
              <Input type="date" value={form.payrollDate} onChange={(e) => set('payrollDate', e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Description *</label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. January 2025 Payroll" className="h-8 text-xs" />
          </div>

          <div className="border rounded-md p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payroll Figures</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Gross Salaries *', key: 'grossSalaries' },
                { label: 'PAYE / Income Tax *', key: 'payeTax' },
                { label: 'Pension (Employee) *', key: 'pensionEmployee' },
                { label: 'Pension (Employer)', key: 'pensionEmployer' },
                { label: 'Other Deductions', key: 'otherDeductions' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs font-medium mb-1 block">{label}</label>
                  <Input type="number" value={form[key as keyof typeof form]} onChange={(e) => set(key, e.target.value)} placeholder="0.00" className="h-8 text-xs" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">Net Pay (auto-calculated)</label>
                <div className="h-8 flex items-center px-3 text-xs font-semibold text-primary border rounded-md bg-muted/30">
                  {computedNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-md p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Mapping</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Wages Expense Account *</label>
                <Select value={form.wagesAccountId} onChange={(e) => set('wagesAccountId', e.target.value)} className="h-8 text-xs">
                  <option value="">Select…</option>
                  {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Tax Payable Account *</label>
                <Select value={form.taxPayableAccountId} onChange={(e) => set('taxPayableAccountId', e.target.value)} className="h-8 text-xs">
                  <option value="">Select…</option>
                  {liabilityAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Pension Payable Account *</label>
                <Select value={form.pensionPayableAccountId} onChange={(e) => set('pensionPayableAccountId', e.target.value)} className="h-8 text-xs">
                  <option value="">Select…</option>
                  {liabilityAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Bank / Cash Account *</label>
                <Select value={form.bankAccountId} onChange={(e) => set('bankAccountId', e.target.value)} className="h-8 text-xs">
                  <option value="">Select…</option>
                  {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </Select>
              </div>
            </div>
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to process payroll'}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t">
          <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Processing…' : 'Post Payroll Journal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PayrollPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll', activeOrganisationId],
    queryFn: () => listPayrollEntries(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users size={18} /> Payroll Accounting
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} payroll journal entries</p>
        </div>
        {activeOrganisationId && <ProcessPayrollDialog organisationId={activeOrganisationId} />}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (data?.entries ?? []).length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No payroll entries yet.</p>
              <p className="text-xs text-muted-foreground">Click <strong>Process Payroll</strong> to post a payroll journal.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Journal #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.entries ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">{e.journalNumber}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.entryDate).toLocaleDateString()}</TableCell>
                    <TableCell><Badge variant={e.status === 'POSTED' ? 'success' : 'secondary'}>{e.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
