import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Settings, Play, Download, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as payrollSvc from '@/services/payroll.service';
import type { PayrollRun, Employee, SalaryComponent, Payslip, SalaryComponentType } from '@/services/payroll.service';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number | null | undefined, dp = 2) {
  const v = Number(n ?? 0);
  return isNaN(v) ? '0.00' : v.toLocaleString('en-GH', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED:  'bg-yellow-100 text-yellow-700',
  PAID:      'bg-green-100 text-green-700',
  LOCKED:    'bg-purple-100 text-purple-700',
};

const COMP_TYPE_LABELS: Record<SalaryComponentType, string> = {
  BASIC_SALARY:          'Basic Salary',
  OVERTIME:              'Overtime',
  BONUS:                 'Bonus',
  COMMISSION:            'Commission',
  ALLOWANCE:             'Allowance',
  OTHER_EARNING:         'Other Earning',
  EMPLOYEE_DEDUCTION:    'Employee Deduction',
  EMPLOYER_CONTRIBUTION: 'Employer Contribution',
};

// ─── Statutory Config Tab ─────────────────────────────────────────────────────

function StatutoryTab({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery({
    queryKey: ['payroll-statutory', organisationId],
    queryFn: () => payrollSvc.listStatutoryConfigs(organisationId),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    taxYear: new Date().getFullYear().toString(),
    ssnitEmployeeRate: '5.5',
    ssnitEmployerRate: '13',
    tier2Rate: '5',
    personalRelief: '0',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => payrollSvc.upsertStatutoryConfig(organisationId, {
      taxYear:           parseInt(form.taxYear, 10),
      ssnitEmployeeRate: String(Number(form.ssnitEmployeeRate) / 100),
      ssnitEmployerRate: String(Number(form.ssnitEmployerRate) / 100),
      tier2Rate:         String(Number(form.tier2Rate)         / 100),
      personalRelief:    String(Number(form.personalRelief)),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payroll-statutory', organisationId] }); setOpen(false); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Ghana GRA statutory rates per tax year. PAYE bands are seeded with 2024 defaults and can be overridden.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Settings className="w-4 h-4 mr-1" />Configure Year</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <h2 className="text-lg font-semibold mb-4">Statutory Configuration</h2>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">Tax Year</label><Input value={form.taxYear} onChange={(e) => set('taxYear', e.target.value)} type="number" /></div>
              <div><label className="text-sm font-medium">SSNIT Employee Rate (%)</label><Input value={form.ssnitEmployeeRate} onChange={(e) => set('ssnitEmployeeRate', e.target.value)} type="number" step="0.1" /></div>
              <div><label className="text-sm font-medium">SSNIT Employer Rate (%)</label><Input value={form.ssnitEmployerRate} onChange={(e) => set('ssnitEmployerRate', e.target.value)} type="number" step="0.1" /></div>
              <div><label className="text-sm font-medium">Tier 2 Rate (% of employer)</label><Input value={form.tier2Rate} onChange={(e) => set('tier2Rate', e.target.value)} type="number" step="0.1" /></div>
              <div><label className="text-sm font-medium">Monthly Personal Relief (GHS)</label><Input value={form.personalRelief} onChange={(e) => set('personalRelief', e.target.value)} type="number" /></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">PAYE bands are initialised to Ghana GRA 2024 defaults. Contact your admin to customise bands.</p>
            <div className="flex justify-end gap-2 mt-4">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tax Year</TableHead>
              <TableHead>SSNIT Emp</TableHead>
              <TableHead>SSNIT Er</TableHead>
              <TableHead>Tier 2</TableHead>
              <TableHead>Personal Relief</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {configs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">No configurations yet — defaults (Ghana GRA 2024) apply</TableCell></TableRow>
              )}
              {configs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.taxYear}</TableCell>
                  <TableCell>{(Number(c.ssnitEmployeeRate) * 100).toFixed(1)}%</TableCell>
                  <TableCell>{(Number(c.ssnitEmployerRate) * 100).toFixed(1)}%</TableCell>
                  <TableCell>{(Number(c.tier2Rate) * 100).toFixed(1)}%</TableCell>
                  <TableCell>GHS {fmt(c.personalRelief)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Salary Components Tab ────────────────────────────────────────────────────

function SalaryComponentsTab({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editComp, setEditComp] = useState<SalaryComponent | null>(null);

  const { data: components = [], isLoading } = useQuery({
    queryKey: ['payroll-components', organisationId],
    queryFn:  () => payrollSvc.listSalaryComponents(organisationId),
  });
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn:  () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false, postingOnly: true }),
    enabled:  open,
  });
  const allAccounts = accountsData?.accounts ?? [];

  const defaultForm = { code: '', name: '', type: 'ALLOWANCE' as SalaryComponentType, isTaxable: true, glAccountId: '', description: '' };
  const [form, setForm] = useState(defaultForm);
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() { setEditComp(null); setForm(defaultForm); setOpen(true); }
  function openEdit(c: SalaryComponent) {
    setEditComp(c);
    setForm({ code: c.code, name: c.name, type: c.type, isTaxable: c.isTaxable, glAccountId: c.glAccountId ?? '', description: c.description ?? '' });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: () => editComp
      ? payrollSvc.updateSalaryComponent(organisationId, editComp.id, { ...form, glAccountId: form.glAccountId || undefined })
      : payrollSvc.createSalaryComponent(organisationId, { ...form, glAccountId: form.glAccountId || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payroll-components', organisationId] }); setOpen(false); },
  });

  const toggle = useMutation({
    mutationFn: (c: SalaryComponent) => payrollSvc.updateSalaryComponent(organisationId, c.id, { isActive: !c.isActive }),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['payroll-components', organisationId] }),
  });

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Play className="w-4 h-4 mr-1" />Add Component</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
            <TableHead>Taxable</TableHead><TableHead>GL Account</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {components.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">No salary components defined</TableCell></TableRow>
            )}
            {components.map((c) => (
              <TableRow key={c.id} className={!c.isActive ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-sm">{c.code}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell><Badge variant="outline">{COMP_TYPE_LABELS[c.type]}</Badge></TableCell>
                <TableCell>{c.isTaxable ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}</TableCell>
                <TableCell className="text-sm text-gray-500">{c.glAccount ? `${c.glAccount.code} ${c.glAccount.name}` : '—'}</TableCell>
                <TableCell><Badge className={c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>{c.isActive ? 'Deactivate' : 'Activate'}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-4">{editComp ? 'Edit' : 'Add'} Salary Component</h2>
          <div className="space-y-3">
            {!editComp && <div><label className="text-sm font-medium">Code</label><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="TRANS" /></div>}
            <div><label className="text-sm font-medium">Name</label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Transport Allowance" /></div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                {Object.entries(COMP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="taxable" checked={form.isTaxable} onChange={(e) => set('isTaxable', e.target.checked)} />
              <label htmlFor="taxable" className="text-sm font-medium">Taxable</label>
            </div>
            <div>
              <label className="text-sm font-medium">GL Account (optional)</label>
              <Select value={form.glAccountId} onChange={(e) => set('glAccountId', e.target.value)}>
                <option value="">— none —</option>
                {allAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Select>
            </div>
            <div><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Employee Tab ─────────────────────────────────────────────────────────────

function EmployeeDialog({ organisationId, emp, onClose }: { organisationId: string; emp: Employee | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn:  () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false, postingOnly: true }),
  });
  const allAccounts = accountsData?.accounts ?? [];
  const expenseAccounts = allAccounts.filter((a) => a.class === 'EXPENSE');

  const defaultForm = {
    employeeNumber: '', firstName: '', lastName: '', email: '', phone: '',
    nationalId: '', tinNumber: '', ssnitNumber: '',
    employmentType: 'FULL_TIME', payFrequency: 'MONTHLY',
    startDate: new Date().toISOString().split('T')[0], endDate: '',
    jobTitle: '', basicSalary: '', bankName: '', bankAccountNumber: '', bankBranch: '',
    tier3EmployeeRate: '', tier3EmployerRate: '', salaryExpenseAccountId: '',
  };
  const [form, setForm] = useState(emp ? {
    employeeNumber:        emp.employeeNumber,
    firstName:             emp.firstName,
    lastName:              emp.lastName,
    email:                 emp.email ?? '',
    phone:                 emp.phone ?? '',
    nationalId:            emp.nationalId ?? '',
    tinNumber:             emp.tinNumber ?? '',
    ssnitNumber:           emp.ssnitNumber ?? '',
    employmentType:        emp.employmentType,
    payFrequency:          emp.payFrequency,
    startDate:             emp.startDate.split('T')[0],
    endDate:               emp.endDate?.split('T')[0] ?? '',
    jobTitle:              emp.jobTitle ?? '',
    basicSalary:           emp.basicSalary,
    bankName:              emp.bankName ?? '',
    bankAccountNumber:     emp.bankAccountNumber ?? '',
    bankBranch:            emp.bankBranch ?? '',
    tier3EmployeeRate:     emp.tier3EmployeeRate ? String(Number(emp.tier3EmployeeRate) * 100) : '',
    tier3EmployerRate:     emp.tier3EmployerRate ? String(Number(emp.tier3EmployerRate) * 100) : '',
    salaryExpenseAccountId: emp.salaryExpenseAccountId ?? '',
  } : defaultForm);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        basicSalary:           Number(form.basicSalary),
        endDate:               form.endDate || undefined,
        email:                 form.email || undefined,
        phone:                 form.phone || undefined,
        nationalId:            form.nationalId || undefined,
        tinNumber:             form.tinNumber || undefined,
        ssnitNumber:           form.ssnitNumber || undefined,
        jobTitle:              form.jobTitle || undefined,
        bankName:              form.bankName || undefined,
        bankAccountNumber:     form.bankAccountNumber || undefined,
        bankBranch:            form.bankBranch || undefined,
        tier3EmployeeRate:     form.tier3EmployeeRate ? Number(form.tier3EmployeeRate) / 100 : undefined,
        tier3EmployerRate:     form.tier3EmployerRate ? Number(form.tier3EmployerRate) / 100 : undefined,
        salaryExpenseAccountId: form.salaryExpenseAccountId || undefined,
      };
      return emp
        ? payrollSvc.updateEmployee(organisationId, emp.id, payload as unknown as Parameters<typeof payrollSvc.updateEmployee>[2])
        : payrollSvc.createEmployee(organisationId, payload as Parameters<typeof payrollSvc.createEmployee>[1]);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payroll-employees', organisationId] }); onClose(); },
  });

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-3">
        {!emp && <div><label className="text-sm font-medium">Employee No.</label><Input value={form.employeeNumber} onChange={(e) => set('employeeNumber', e.target.value)} placeholder="EMP-001" /></div>}
        <div><label className="text-sm font-medium">First Name</label><Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Last Name</label><Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Email</label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Phone</label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div><label className="text-sm font-medium">National ID</label><Input value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} /></div>
        <div><label className="text-sm font-medium">TIN Number</label><Input value={form.tinNumber} onChange={(e) => set('tinNumber', e.target.value)} /></div>
        <div><label className="text-sm font-medium">SSNIT Number</label><Input value={form.ssnitNumber} onChange={(e) => set('ssnitNumber', e.target.value)} /></div>
        <div>
          <label className="text-sm font-medium">Employment Type</label>
          <Select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
            <option value="CONTRACT">Contract</option>
            <option value="CASUAL">Casual</option>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Pay Frequency</label>
          <Select value={form.payFrequency} onChange={(e) => set('payFrequency', e.target.value)}>
            <option value="MONTHLY">Monthly</option>
            <option value="FORTNIGHTLY">Fortnightly</option>
            <option value="WEEKLY">Weekly</option>
          </Select>
        </div>
        <div><label className="text-sm font-medium">Start Date</label><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
        <div><label className="text-sm font-medium">End Date (optional)</label><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Job Title</label><Input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Basic Salary (GHS/month)</label><Input type="number" value={form.basicSalary} onChange={(e) => set('basicSalary', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Bank Name</label><Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Bank Account No.</label><Input value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Bank Branch</label><Input value={form.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} /></div>
        <div><label className="text-sm font-medium">Tier 3 Emp Rate (%)</label><Input type="number" step="0.5" value={form.tier3EmployeeRate} onChange={(e) => set('tier3EmployeeRate', e.target.value)} placeholder="0" /></div>
        <div><label className="text-sm font-medium">Tier 3 Er Rate (%)</label><Input type="number" step="0.5" value={form.tier3EmployerRate} onChange={(e) => set('tier3EmployerRate', e.target.value)} placeholder="0" /></div>
        <div className="col-span-2">
          <label className="text-sm font-medium">Salary Expense Account</label>
          <Select value={form.salaryExpenseAccountId} onChange={(e) => set('salaryExpenseAccountId', e.target.value)}>
            <option value="">— use run default —</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </div>
    </div>
  );
}

function EmployeesTab({ organisationId }: { organisationId: string }) {
  const [open, setOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['payroll-employees', organisationId],
    queryFn:  () => payrollSvc.listEmployees(organisationId),
  });

  function openCreate() { setEditEmp(null); setOpen(true); }
  function openEdit(e: Employee) { setEditEmp(e); setOpen(true); }

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Users className="w-4 h-4 mr-1" />Add Employee</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Emp No.</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
            <TableHead>Basic Salary</TableHead><TableHead>Department</TableHead>
            <TableHead>Bank Acct</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {employees.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">No employees yet</TableCell></TableRow>
            )}
            {employees.map((e) => (
              <TableRow key={e.id} className={!e.isActive ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-sm">{e.employeeNumber}</TableCell>
                <TableCell>{e.firstName} {e.lastName}</TableCell>
                <TableCell><Badge variant="outline">{e.employmentType.replace('_', ' ')}</Badge></TableCell>
                <TableCell className="text-right">GHS {fmt(e.basicSalary)}</TableCell>
                <TableCell className="text-sm text-gray-500">{e.department?.name ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs">{e.bankAccountNumber ?? '—'}</TableCell>
                <TableCell><Badge className={e.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{e.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => openEdit(e)}>Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <h2 className="text-lg font-semibold mb-4">{editEmp ? 'Edit Employee' : 'New Employee'}</h2>
          <EmployeeDialog organisationId={organisationId} emp={editEmp} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Payslip Viewer (inline) ──────────────────────────────────────────────────

function PayslipRow({ slip }: { slip: Payslip }) {
  const [expanded, setExpanded] = useState(false);
  const name = slip.employee ? `${slip.employee.firstName} ${slip.employee.lastName}` : slip.employeeId;
  const empNo = slip.employee?.employeeNumber ?? '';

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(!expanded)}>
        <TableCell>{expanded ? <ChevronDown className="w-4 h-4 inline" /> : <ChevronRight className="w-4 h-4 inline" />}</TableCell>
        <TableCell className="font-mono text-xs">{empNo}</TableCell>
        <TableCell>{name}</TableCell>
        <TableCell className="text-right">GHS {fmt(slip.grossPay)}</TableCell>
        <TableCell className="text-right text-red-600">GHS {fmt(slip.payeAmount)}</TableCell>
        <TableCell className="text-right text-red-600">GHS {fmt(slip.ssnitEmployee)}</TableCell>
        <TableCell className="text-right font-semibold">GHS {fmt(slip.netPay)}</TableCell>
        <TableCell className="text-right text-gray-500">GHS {fmt(slip.totalEmployerCost)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-gray-50">
          <TableCell colSpan={8} className="p-4">
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="font-semibold text-gray-700 mb-2">Earnings</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Basic Salary</span><span>GHS {fmt(slip.basicSalary)}</span></div>
                  {Number(slip.overtimePay) > 0 && <div className="flex justify-between"><span>Overtime</span><span>GHS {fmt(slip.overtimePay)}</span></div>}
                  {Number(slip.bonuses) > 0 && <div className="flex justify-between"><span>Bonuses</span><span>GHS {fmt(slip.bonuses)}</span></div>}
                  {Number(slip.allowances) > 0 && <div className="flex justify-between"><span>Allowances</span><span>GHS {fmt(slip.allowances)}</span></div>}
                  {Number(slip.otherEarnings) > 0 && <div className="flex justify-between"><span>Other Earnings</span><span>GHS {fmt(slip.otherEarnings)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Gross Pay</span><span>GHS {fmt(slip.grossPay)}</span></div>
                </div>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-2">Deductions</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-red-600"><span>PAYE</span><span>GHS {fmt(slip.payeAmount)}</span></div>
                  <div className="flex justify-between text-red-600"><span>SSNIT (Employee 5.5%)</span><span>GHS {fmt(slip.ssnitEmployee)}</span></div>
                  {Number(slip.tier3Employee) > 0 && <div className="flex justify-between text-red-600"><span>Tier 3 (Employee)</span><span>GHS {fmt(slip.tier3Employee)}</span></div>}
                  {Number(slip.otherDeductions) > 0 && <div className="flex justify-between text-red-600"><span>Other Deductions</span><span>GHS {fmt(slip.otherDeductions)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-1 text-red-600"><span>Total Deductions</span><span>GHS {fmt(slip.totalDeductions)}</span></div>
                  <div className="flex justify-between font-semibold text-green-700 text-base pt-1"><span>Net Pay</span><span>GHS {fmt(slip.netPay)}</span></div>
                </div>
                <p className="font-semibold text-gray-700 mt-3 mb-2">Employer Contributions</p>
                <div className="space-y-1 text-gray-600">
                  <div className="flex justify-between"><span>SSNIT Employer (8%)</span><span>GHS {fmt(slip.ssnitEmployer)}</span></div>
                  <div className="flex justify-between"><span>Tier 2 (5%)</span><span>GHS {fmt(slip.tier2Employer)}</span></div>
                  {Number(slip.tier3Employer) > 0 && <div className="flex justify-between"><span>Tier 3 (Employer)</span><span>GHS {fmt(slip.tier3Employer)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Total Employer Cost</span><span>GHS {fmt(slip.totalEmployerCost)}</span></div>
                </div>
              </div>
              <div className="col-span-2 pt-2 border-t text-xs text-gray-500">
                <span className="font-semibold">YTD:</span> Gross GHS {fmt(slip.ytdGross)} &nbsp;|&nbsp; PAYE GHS {fmt(slip.ytdPaye)} &nbsp;|&nbsp; SSNIT GHS {fmt(slip.ytdSsnit)} &nbsp;|&nbsp; Net GHS {fmt(slip.ytdNetPay)}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Create Run Dialog ────────────────────────────────────────────────────────

function CreateRunDialog({ organisationId, onClose }: { organisationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: periodsData = [] } = useQuery({ queryKey: ['periods', organisationId], queryFn: () => listPeriods(organisationId) });
  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId, 'posting'], queryFn: () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false, postingOnly: true }) });
  const allAccounts = accountsData?.accounts ?? [];
  const liabilityAccounts = allAccounts.filter((a) => a.class === 'LIABILITY');

  const openPeriods = periodsData.filter((p) => p.status === 'OPEN');
  const [form, setForm] = useState({
    periodId:               '',
    paymentDate:            new Date().toISOString().split('T')[0],
    description:            '',
    wagesPayableAccountId:  '',
    payePayableAccountId:   '',
    ssnitPayableAccountId:  '',
    pensionPayableAccountId: '',
    notes:                  '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => payrollSvc.createPayrollRun(organisationId, form),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['payroll-runs', organisationId] }); onClose(); },
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Accounting Period</label>
        <Select value={form.periodId} onChange={(e) => set('periodId', e.target.value)}>
          <option value="">Select period…</option>
          {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <div><label className="text-sm font-medium">Payment Date</label><Input type="date" value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} /></div>
      <div><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="May 2025 Payroll" /></div>
      <p className="text-xs text-gray-500 font-semibold pt-1">GL Accounts for this run</p>
      {[
        { key: 'wagesPayableAccountId',   label: 'Wages Payable' },
        { key: 'payePayableAccountId',    label: 'PAYE Payable' },
        { key: 'ssnitPayableAccountId',   label: 'SSNIT Payable' },
        { key: 'pensionPayableAccountId', label: 'Pension Payable' },
      ].map(({ key, label }) => (
        <div key={key}>
          <label className="text-sm font-medium">{label}</label>
          <Select value={(form as Record<string, string>)[key]} onChange={(e) => set(key, e.target.value)}>
            <option value="">Select account…</option>
            {liabilityAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </Select>
        </div>
      ))}
      <div><label className="text-sm font-medium">Notes</label><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>Calculate &amp; Create</Button>
      </div>
    </div>
  );
}

// ─── Run Detail ───────────────────────────────────────────────────────────────

function RunDetail({ organisationId, run }: { organisationId: string; run: PayrollRun }) {
  const qc = useQueryClient();
  const { data: detail } = useQuery({
    queryKey: ['payroll-run', organisationId, run.id],
    queryFn:  () => payrollSvc.getPayrollRun(organisationId, run.id),
  });

  const submit  = useMutation({ mutationFn: () => payrollSvc.submitPayrollRun(organisationId, run.id),  onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll-runs', organisationId] }) });
  const approve = useMutation({ mutationFn: () => payrollSvc.approvePayrollRun(organisationId, run.id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll-runs', organisationId] }) });
  const pay     = useMutation({ mutationFn: () => payrollSvc.payPayrollRun(organisationId, run.id),     onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll-runs', organisationId] }) });

  async function downloadCSV() {
    try {
      const response = await payrollSvc.downloadPaymentFile(organisationId, run.id);
      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `payment-${run.runNumber}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* handled by axios */ }
  }

  const payslips = detail?.payslips ?? [];

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-4 gap-4 text-sm">
        {[
          { label: 'Total Gross',       val: run.totalGross },
          { label: 'Total PAYE',        val: run.totalPaye },
          { label: 'SSNIT (Employee)',  val: run.totalSsnitEmployee },
          { label: 'Total Net Pay',     val: run.totalNetPay },
          { label: 'Employer Cost',     val: run.totalEmployerCost },
          { label: 'SSNIT (Employer)',  val: run.totalSsnitEmployer },
          { label: 'Tier 2',            val: run.totalTier2 },
          { label: 'Other Deductions',  val: run.totalOtherDeductions },
        ].map(({ label, val }) => (
          <div key={label} className="bg-gray-50 rounded p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="font-semibold">GHS {fmt(val)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {run.status === 'DRAFT' && (
          <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>Submit for Approval</Button>
        )}
        {run.status === 'SUBMITTED' && (
          <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending} className="bg-yellow-600 hover:bg-yellow-700 text-white">Approve</Button>
        )}
        {run.status === 'APPROVED' && (
          <Button size="sm" onClick={() => pay.mutate()} disabled={pay.isPending} className="bg-green-600 hover:bg-green-700 text-white">Mark as Paid &amp; Post GL</Button>
        )}
        {(run.status === 'SUBMITTED' || run.status === 'APPROVED' || run.status === 'PAID') && (
          <Button size="sm" variant="outline" onClick={downloadCSV}><Download className="w-4 h-4 mr-1" />Payment CSV</Button>
        )}
      </div>

      {payslips.length > 0 && (
        <div>
          <h3 className="font-medium text-sm text-gray-700 mb-2">Employee Payslips</h3>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8" />
                <TableHead>Emp No.</TableHead><TableHead>Name</TableHead>
                <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">SSNIT</TableHead><TableHead className="text-right">Net Pay</TableHead>
                <TableHead className="text-right">Employer Cost</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {payslips.map((s) => <PayslipRow key={s.id} slip={s} />)}
              </TableBody>
            </Table>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}

// ─── Payroll Runs Tab ─────────────────────────────────────────────────────────

function RunsTab({ organisationId }: { organisationId: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-runs', organisationId],
    queryFn:  () => payrollSvc.listPayrollRuns(organisationId),
  });
  const runs = data?.runs ?? [];

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Play className="w-4 h-4 mr-1" />New Payroll Run</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Create Payroll Run</h2>
            <CreateRunDialog organisationId={organisationId} onClose={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {runs.length === 0 && (
        <div className="text-center py-12 text-gray-400">No payroll runs yet — click "New Payroll Run" to calculate the first one.</div>
      )}

      {runs.map((run) => (
        <Card key={run.id}>
          <CardContent className="p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
            >
              <div className="flex items-center gap-3">
                {expandedId === run.id ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <div>
                  <p className="font-semibold">{run.runNumber} — {run.description}</p>
                  <p className="text-xs text-gray-500">Payment: {new Date(run.paymentDate).toLocaleDateString()} &nbsp;|&nbsp; Period: {run.period?.name ?? run.periodId}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">GHS {fmt(run.totalNetPay)} net</span>
                <Badge className={STATUS_COLORS[run.status] ?? ''}>{run.status}</Badge>
              </div>
            </div>
            {expandedId === run.id && <RunDetail organisationId={organisationId} run={run} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'runs' | 'employees' | 'components' | 'statutory';

const TABS: { key: Tab; label: string }[] = [
  { key: 'runs',       label: 'Payroll Runs' },
  { key: 'employees',  label: 'Employees' },
  { key: 'components', label: 'Salary Components' },
  { key: 'statutory',  label: 'Statutory Config' },
];

export function PayrollPage() {
  const orgId = useAuthStore((s) => s.activeOrganisationId) ?? '';
  const [tab, setTab] = useState<Tab>('runs');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">Ghana GRA compliant payroll with PAYE, SSNIT Tier 1/2/3 and four-eyes approval workflow</p>
        </div>
      </div>

      <div className="flex border-b gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'runs'       && <RunsTab            organisationId={orgId} />}
      {tab === 'employees'  && <EmployeesTab        organisationId={orgId} />}
      {tab === 'components' && <SalaryComponentsTab organisationId={orgId} />}
      {tab === 'statutory'  && <StatutoryTab        organisationId={orgId} />}
    </div>
  );
}
