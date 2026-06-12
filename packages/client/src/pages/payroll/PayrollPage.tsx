import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Settings, Play, Download, ChevronDown, ChevronRight, CheckCircle, XCircle, Plus, Trash2, Lock, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { PayrollReportsPage } from './PayrollReportsPage';
import * as payrollSvc from '@/services/payroll.service';
import type { PayrollRun, Employee, SalaryComponent, Payslip, SalaryComponentType, EmployeeLoan, OvertimeType } from '@/services/payroll.service';
import { listAccounts } from '@/services/accounts.service';
import { listPeriods } from '@/services/periods.service';
import { listDepartments, listCostCentres } from '@/services/budgets.service';
import { AccountSelect } from '@/components/ui/account-select';
import type { AccountOption } from '@/components/ui/account-select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Attachments } from '@/components/ui/attachments';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number | null | undefined, dp = 2) {
  const v = Number(n ?? 0);
  return isNaN(v) ? '0.00' : v.toLocaleString('en-GH', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const RETIREMENT_AGE = 60; // Ghana statutory retirement age

const DEFAULT_RELIEFS = { marriageChild: 1200, oldAge: 1500, childEducation: 600, childEducationMax: 3, agedDependant: 1000, disabilityPct: 0.25 };
const DEFAULT_BENEFITS = {
  accommodation: { AF: 0.10, AO: 0.075, FO: 0.025, SA: 0.025 } as Record<string, number>,
  vehicle: { FVD: { pct: 0.125, cap: 1500 }, VF: { pct: 0.10, cap: 1250 }, V: { pct: 0.05, cap: 625 }, F: { pct: 0.05, cap: 625 } } as Record<string, { pct: number; cap: number }>,
};
const DEFAULT_TAX_RULES = {
  bonusThreshold: 0.15, bonusRate: 0.05, overtimeThreshold: 0.50, overtimeRateLow: 0.05, overtimeRateHigh: 0.10,
  juniorStaffOtThreshold: 1500, casualRate: 0.05, partTimeRate: 0.10, nspAllowance: 715, tier3Cap: 0.165, totalPensionCap: 0.35,
};

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function ageInfo(dob: string | null | undefined): string {
  const age = ageFromDob(dob);
  if (age === null) return '';
  if (age >= RETIREMENT_AGE) return `Age ${age} · Retired`;
  return `Age ${age} · ${RETIREMENT_AGE - age} yr${RETIREMENT_AGE - age === 1 ? '' : 's'} to retirement`;
}

function toAccountOptions(accounts: ReturnType<typeof Array<{ id: string; code: string; name: string; class: string; isActive: boolean }>>[number][]): AccountOption[] {
  return accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, class: a.class, isActive: a.isActive }));
}

function nextEmployeeNumber(employees: Employee[]): string {
  if (employees.length === 0) return 'EMP-0001';
  const nums = employees
    .map((e) => {
      const m = e.employeeNumber.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `EMP-${String(next).padStart(4, '0')}`;
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

const DEFAULT_PAYE_BANDS = [
  { min: '0',     max: '490',   rate: '0'    },
  { min: '490',   max: '600',   rate: '5'    },
  { min: '600',   max: '730',   rate: '10'   },
  { min: '730',   max: '3730',  rate: '17.5' },
  { min: '3730',  max: '20130', rate: '25'   },
  { min: '20130', max: '',      rate: '35'   },
];

// ─── Statutory Config Tab ─────────────────────────────────────────────────────

function StatutoryTab({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery({
    queryKey: ['payroll-statutory', organisationId],
    queryFn: () => payrollSvc.listStatutoryConfigs(organisationId),
  });

  const [open, setOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<typeof configs[number] | null>(null);
  const [form, setForm] = useState({
    taxYear: new Date().getFullYear().toString(),
    ssnitEmployeeRate: '5.5',
    ssnitEmployerRate: '13',
    tier2Rate: '5',
    personalRelief: '0',
    nonResidentFlatRate: '25',
  });
  const [bands, setBands] = useState(DEFAULT_PAYE_BANDS);
  const [reliefs, setReliefs] = useState(DEFAULT_RELIEFS);
  const [benefits, setBenefits] = useState(DEFAULT_BENEFITS);
  const [taxRules, setTaxRules] = useState(DEFAULT_TAX_RULES);
  const setRelief = (k: keyof typeof DEFAULT_RELIEFS, v: string) => setReliefs((r) => ({ ...r, [k]: Number(v) }));
  const setRule = (k: keyof typeof DEFAULT_TAX_RULES, v: string) => setTaxRules((r) => ({ ...r, [k]: Number(v) }));
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function openConfigure(cfg?: typeof configs[number]) {
    if (cfg) {
      setEditConfig(cfg);
      setForm({
        taxYear: String(cfg.taxYear),
        ssnitEmployeeRate: String(Number(cfg.ssnitEmployeeRate) * 100),
        ssnitEmployerRate: String(Number(cfg.ssnitEmployerRate) * 100),
        tier2Rate: String(Number(cfg.tier2Rate) * 100),
        personalRelief: String(Number(cfg.personalRelief)),
        nonResidentFlatRate: String(Number(cfg.nonResidentFlatRate ?? 0.25) * 100),
      });
      setBands(
        (cfg.payeBands ?? DEFAULT_PAYE_BANDS.map(b => ({ min: b.min, max: b.max, rate: b.rate }))).map((b) => ({
          min: String(b.min),
          max: b.max === null || b.max === undefined ? '' : String(b.max),
          rate: String(b.rate),
        }))
      );
      setReliefs({ ...DEFAULT_RELIEFS, ...(cfg.reliefs ?? {}) });
      setBenefits({ ...DEFAULT_BENEFITS, ...(cfg.benefits ?? {}) });
      setTaxRules({ ...DEFAULT_TAX_RULES, ...(cfg.taxRules ?? {}) });
    } else {
      setEditConfig(null);
      setForm({ taxYear: new Date().getFullYear().toString(), ssnitEmployeeRate: '5.5', ssnitEmployerRate: '13', tier2Rate: '5', personalRelief: '0', nonResidentFlatRate: '25' });
      setBands(DEFAULT_PAYE_BANDS);
      setReliefs(DEFAULT_RELIEFS); setBenefits(DEFAULT_BENEFITS); setTaxRules(DEFAULT_TAX_RULES);
    }
    setOpen(true);
  }

  function updateBand(i: number, key: 'min' | 'max' | 'rate', val: string) {
    setBands((prev) => prev.map((b, idx) => idx === i ? { ...b, [key]: val } : b));
  }
  function addBand() { setBands((prev) => [...prev, { min: '', max: '', rate: '' }]); }
  function removeBand(i: number) { setBands((prev) => prev.filter((_, idx) => idx !== i)); }

  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => payrollSvc.upsertStatutoryConfig(organisationId, {
      taxYear:           parseInt(form.taxYear, 10),
      ssnitEmployeeRate: String(Number(form.ssnitEmployeeRate) / 100),
      ssnitEmployerRate: String(Number(form.ssnitEmployerRate) / 100),
      tier2Rate:         String(Number(form.tier2Rate)         / 100),
      personalRelief:    String(Number(form.personalRelief)),
      nonResidentFlatRate: String(Number(form.nonResidentFlatRate) / 100),
      payeBands:         bands.map((b) => ({
        min:  Number(b.min),
        max:  b.max === '' ? null : Number(b.max),
        rate: Number(b.rate),
      })),
      reliefs,
      benefits,
      taxRules,
    }),
    onSuccess: () => { setSaveError(null); void qc.invalidateQueries({ queryKey: ['payroll-statutory', organisationId] }); setOpen(false); },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { error?: { message?: string; details?: Record<string, string[]> }; message?: string } } })?.response?.data;
      const details = data?.error?.details;
      const msg = details && Object.keys(details).length > 0
        ? Object.entries(details).map(([f, m]) => `${f}: ${(m ?? []).join(', ')}`).join(' · ')
        : (data?.error?.message ?? data?.message ?? (err as Error)?.message ?? 'Failed to save configuration');
      setSaveError(msg);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Ghana GRA statutory rates per tax year. PAYE bands are seeded with 2024 defaults and can be overridden.</p>
        <Button size="sm" onClick={() => openConfigure()}><Settings className="w-4 h-4 mr-1" />Configure Year</Button>
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
              <TableHead>PAYE Bands</TableHead>
              <TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {configs.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">No configurations yet — defaults (Ghana GRA 2024) apply</TableCell></TableRow>
              )}
              {configs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.taxYear}</TableCell>
                  <TableCell>{(Number(c.ssnitEmployeeRate) * 100).toFixed(1)}%</TableCell>
                  <TableCell>{(Number(c.ssnitEmployerRate) * 100).toFixed(1)}%</TableCell>
                  <TableCell>{(Number(c.tier2Rate) * 100).toFixed(1)}%</TableCell>
                  <TableCell>GHS {fmt(c.personalRelief)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{(c.payeBands ?? []).length} bands</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openConfigure(c)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <h2 className="text-lg font-semibold mb-4">{editConfig ? `Edit ${editConfig.taxYear} Configuration` : 'Statutory Configuration'}</h2>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div><label className="text-sm font-medium">Tax Year</label><Input value={form.taxYear} onChange={(e) => set('taxYear', e.target.value)} type="number" disabled={!!editConfig} /></div>
            <div><label className="text-sm font-medium">SSNIT Employee Rate (%)</label><Input value={form.ssnitEmployeeRate} onChange={(e) => set('ssnitEmployeeRate', e.target.value)} type="number" step="0.1" /></div>
            <div><label className="text-sm font-medium">SSNIT Employer Rate (%)</label><Input value={form.ssnitEmployerRate} onChange={(e) => set('ssnitEmployerRate', e.target.value)} type="number" step="0.1" /></div>
            <div><label className="text-sm font-medium">Tier 2 Rate (% of employer)</label><Input value={form.tier2Rate} onChange={(e) => set('tier2Rate', e.target.value)} type="number" step="0.1" /></div>
            <div><label className="text-sm font-medium">Monthly Personal Relief (GHS)</label><Input value={form.personalRelief} onChange={(e) => set('personalRelief', e.target.value)} type="number" /></div>
            <div><label className="text-sm font-medium">Non-resident Flat PAYE Rate (%)</label><Input value={form.nonResidentFlatRate} onChange={(e) => set('nonResidentFlatRate', e.target.value)} type="number" step="0.5" /><p className="text-xs text-muted-foreground mt-0.5">Applied to non-resident employees from this tax year onward.</p></div>

            {/* Personal reliefs (annual GHS) */}
            <div className="border-t pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Personal reliefs (annual GHS)</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><label className="text-xs">Marriage / responsibility</label><Input type="number" value={reliefs.marriageChild} onChange={(e) => setRelief('marriageChild', e.target.value)} className="h-8" /></div>
                <div><label className="text-xs">Old age (≥60)</label><Input type="number" value={reliefs.oldAge} onChange={(e) => setRelief('oldAge', e.target.value)} className="h-8" /></div>
                <div><label className="text-xs">Child education (per child)</label><Input type="number" value={reliefs.childEducation} onChange={(e) => setRelief('childEducation', e.target.value)} className="h-8" /></div>
                <div><label className="text-xs">Max children</label><Input type="number" value={reliefs.childEducationMax} onChange={(e) => setRelief('childEducationMax', e.target.value)} className="h-8" /></div>
                <div><label className="text-xs">Aged dependant (each)</label><Input type="number" value={reliefs.agedDependant} onChange={(e) => setRelief('agedDependant', e.target.value)} className="h-8" /></div>
                <div><label className="text-xs">Disability (% of AI)</label><Input type="number" step="0.01" value={reliefs.disabilityPct * 100} onChange={(e) => setReliefs((r) => ({ ...r, disabilityPct: Number(e.target.value) / 100 }))} className="h-8" /></div>
              </div>
            </div>

            {/* Tax rules & thresholds */}
            <div className="border-t pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Rates & thresholds (%)</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><label className="text-xs">Bonus rate</label><Input type="number" step="0.5" value={taxRules.bonusRate * 100} onChange={(e) => setTaxRules((r) => ({ ...r, bonusRate: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">Bonus threshold (% of basic)</label><Input type="number" step="0.5" value={taxRules.bonusThreshold * 100} onChange={(e) => setTaxRules((r) => ({ ...r, bonusThreshold: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">Overtime low rate</label><Input type="number" step="0.5" value={taxRules.overtimeRateLow * 100} onChange={(e) => setTaxRules((r) => ({ ...r, overtimeRateLow: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">Overtime high rate</label><Input type="number" step="0.5" value={taxRules.overtimeRateHigh * 100} onChange={(e) => setTaxRules((r) => ({ ...r, overtimeRateHigh: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">Overtime threshold (% of basic)</label><Input type="number" step="0.5" value={taxRules.overtimeThreshold * 100} onChange={(e) => setTaxRules((r) => ({ ...r, overtimeThreshold: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">Junior-staff OT threshold (GHS)</label><Input type="number" value={taxRules.juniorStaffOtThreshold} onChange={(e) => setRule('juniorStaffOtThreshold', e.target.value)} className="h-8" /></div>
                <div><label className="text-xs">Casual rate</label><Input type="number" step="0.5" value={taxRules.casualRate * 100} onChange={(e) => setTaxRules((r) => ({ ...r, casualRate: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">Part-time rate</label><Input type="number" step="0.5" value={taxRules.partTimeRate * 100} onChange={(e) => setTaxRules((r) => ({ ...r, partTimeRate: Number(e.target.value) / 100 }))} className="h-8" /></div>
                <div><label className="text-xs">National NSP allowance (indicative GHS)</label><Input type="number" value={taxRules.nspAllowance} onChange={(e) => setRule('nspAllowance', e.target.value)} className="h-8" /><p className="text-[10px] text-muted-foreground">Reference only — NSP pay is whatever you set on the employee, fully non-taxable.</p></div>
                <div><label className="text-xs">Tier 3 cap (% of basic)</label><Input type="number" step="0.5" value={taxRules.tier3Cap * 100} onChange={(e) => setTaxRules((r) => ({ ...r, tier3Cap: Number(e.target.value) / 100 }))} className="h-8" /></div>
              </div>
            </div>

            {/* Vehicle benefit table */}
            <div className="border-t pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vehicle benefit (% of TCE · monthly cap GHS)</p>
              <div className="space-y-1">
                {(['FVD', 'VF', 'V', 'F'] as const).map((code) => (
                  <div key={code} className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center text-sm">
                    <span className="font-mono text-xs">{code}</span>
                    <Input type="number" step="0.5" value={(benefits.vehicle[code]?.pct ?? 0) * 100} onChange={(e) => setBenefits((b) => ({ ...b, vehicle: { ...b.vehicle, [code]: { ...b.vehicle[code], pct: Number(e.target.value) / 100 } } }))} className="h-7" placeholder="%" />
                    <Input type="number" value={benefits.vehicle[code]?.cap ?? 0} onChange={(e) => setBenefits((b) => ({ ...b, vehicle: { ...b.vehicle, [code]: { ...b.vehicle[code], cap: Number(e.target.value) } } }))} className="h-7" placeholder="cap" />
                  </div>
                ))}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-2">Accommodation benefit (% of TCE)</p>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {(['AF', 'AO', 'FO', 'SA'] as const).map((code) => (
                  <div key={code}><label className="text-xs font-mono">{code}</label><Input type="number" step="0.5" value={(benefits.accommodation[code] ?? 0) * 100} onChange={(e) => setBenefits((b) => ({ ...b, accommodation: { ...b.accommodation, [code]: Number(e.target.value) / 100 } }))} className="h-7" /></div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">PAYE Bands (monthly GHS)</label>
                <Button type="button" size="sm" variant="outline" onClick={addBand}><Plus size={12} className="mr-1" />Add Band</Button>
              </div>
              <div className="border rounded text-xs overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] bg-muted/60 px-2 py-1.5 font-semibold text-muted-foreground gap-2">
                  <span>From (GHS)</span><span>To (GHS)</span><span>Rate (%)</span><span />
                </div>
                {bands.map((band, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-2 py-1 border-t items-center">
                    <Input value={band.min} onChange={(e) => updateBand(i, 'min', e.target.value)} className="h-7 text-xs" type="number" />
                    <Input value={band.max} placeholder="∞" onChange={(e) => updateBand(i, 'max', e.target.value)} className="h-7 text-xs" type="number" />
                    <Input value={band.rate} onChange={(e) => updateBand(i, 'rate', e.target.value)} className="h-7 text-xs" type="number" step="0.5" />
                    <button type="button" onClick={() => removeBand(i)} className="text-destructive hover:text-destructive/80 p-1">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Leave "To" blank for the top band (no upper limit).</p>
            </div>
          </div>
          {saveError && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mt-3">{saveError}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => { setSaveError(null); save.mutate(); }} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>
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
  const allAccountOptions: AccountOption[] = toAccountOptions(accountsData?.accounts ?? []);

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
              <AccountSelect
                value={form.glAccountId}
                onChange={(id) => set('glAccountId', id)}
                accounts={allAccountOptions}
                placeholder="— none —"
              />
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

type EmpTab = 'personal' | 'employment' | 'compensation' | 'statutory' | 'bank' | 'pay-elements' | 'loans';

const EMP_TABS: { key: EmpTab; label: string }[] = [
  { key: 'personal',     label: 'Personal' },
  { key: 'employment',   label: 'Employment' },
  { key: 'compensation', label: 'Compensation' },
  { key: 'statutory',    label: 'Tax & Statutory' },
  { key: 'bank',         label: 'Bank' },
  { key: 'pay-elements', label: 'Pay Elements' },
  { key: 'loans',        label: 'Loans' },
];

// Human-readable labels for server validation errors (keyed by schema field).
const EMP_FIELD_LABELS: Record<string, string> = {
  employeeNumber: 'Employee Number', firstName: 'First Name', lastName: 'Last Name',
  email: 'Email', phone: 'Phone', nationalId: 'National ID', tinNumber: 'TIN',
  ssnitNumber: 'SSNIT Number', employmentType: 'Employment Type', payFrequency: 'Pay Frequency',
  startDate: 'Start Date', endDate: 'End Date', jobTitle: 'Job Title',
  departmentId: 'Department', costCentreId: 'Cost Centre', basicSalary: 'Basic Salary',
  bankName: 'Bank Name', bankAccountNumber: 'Bank Account Number', bankBranch: 'Bank Branch',
  tier3EmployeeRate: 'Tier 3 Employee Rate', tier3EmployerRate: 'Tier 3 Employer Rate',
  salaryExpenseAccountId: 'Salary Expense Account', overtimeType: 'Overtime Type',
  overtimeFixedAmount: 'Overtime Fixed Amount', overtimeMultiplier: 'Overtime Multiplier',
};

const LOAN_STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  SUSPENDED: 'bg-yellow-100 text-yellow-700',
};

export function EmployeeDialog({ organisationId, emp, employees, onClose, fullPage }: {
  organisationId: string;
  emp: Employee | null;
  employees: Employee[];
  onClose: () => void;
  fullPage?: boolean;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<EmpTab>('personal');
  // ID of a freshly created employee (stays null when editing)
  const [savedEmpId, setSavedEmpId] = useState<string | null>(null);
  const effectiveEmpId = emp?.id ?? savedEmpId;

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn:  () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false, postingOnly: true }),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', organisationId],
    queryFn:  () => listDepartments(organisationId),
  });
  const { data: costCentres = [] } = useQuery({
    queryKey: ['cost-centres', organisationId],
    queryFn:  () => listCostCentres(organisationId),
  });
  const { data: allComponents = [] } = useQuery({
    queryKey: ['payroll-components', organisationId],
    queryFn:  () => payrollSvc.listSalaryComponents(organisationId, true),
  });
  const { data: freshEmp, refetch: refetchEmp } = useQuery({
    queryKey: ['payroll-employee', effectiveEmpId],
    queryFn:  () => payrollSvc.getEmployee(organisationId, effectiveEmpId!),
    enabled:  !!effectiveEmpId,
  });

  const expenseAccountOptions: AccountOption[] = toAccountOptions(
    (accountsData?.accounts ?? []).filter((a) => a.class === 'EXPENSE'),
  );

  // ── Form state ─────────────────────────────────────────────────────────────
  const defaultForm = {
    employeeNumber: nextEmployeeNumber(employees),
    firstName: '', lastName: '', email: '', phone: '', nationalId: '',
    tinNumber: '', ssnitNumber: '',
    employmentType: 'FULL_TIME', payFrequency: 'MONTHLY',
    startDate: today, endDate: '',
    jobTitle: '', departmentId: '', costCentreId: '',
    basicSalary: '', salaryExpenseAccountId: '',
    tier3EmployeeRate: '', tier3EmployerRate: '',
    overtimeType: 'NONE' as OvertimeType,
    overtimeFixedAmount: '',
    overtimeMultiplier: '1.5',
    isResident: true,
    gender: '', dateOfBirth: '',
    isMarried: false, isDisabled: false,
    numberOfChildren: '0', agedDependants: '0', vehicleBenefit: '',
    accommodationCode: '', vehicleCode: '', isNsp: false,
    bankName: '', bankAccountNumber: '', bankBranch: '',
  };

  const [form, setForm] = useState(emp ? {
    employeeNumber:         emp.employeeNumber,
    firstName:              emp.firstName,
    lastName:               emp.lastName,
    email:                  emp.email ?? '',
    phone:                  emp.phone ?? '',
    nationalId:             emp.nationalId ?? '',
    tinNumber:              emp.tinNumber ?? '',
    ssnitNumber:            emp.ssnitNumber ?? '',
    employmentType:         emp.employmentType,
    payFrequency:           emp.payFrequency,
    startDate:              emp.startDate.split('T')[0],
    endDate:                emp.endDate?.split('T')[0] ?? '',
    jobTitle:               emp.jobTitle ?? '',
    departmentId:           emp.departmentId ?? '',
    costCentreId:           emp.costCentreId ?? '',
    basicSalary:            emp.basicSalary,
    salaryExpenseAccountId: emp.salaryExpenseAccountId ?? '',
    tier3EmployeeRate:      emp.tier3EmployeeRate ? String(Number(emp.tier3EmployeeRate) * 100) : '',
    tier3EmployerRate:      emp.tier3EmployerRate ? String(Number(emp.tier3EmployerRate) * 100) : '',
    overtimeType:           (emp.overtimeType ?? 'NONE') as OvertimeType,
    overtimeFixedAmount:    emp.overtimeFixedAmount ? String(emp.overtimeFixedAmount) : '',
    overtimeMultiplier:     emp.overtimeMultiplier  ? String(emp.overtimeMultiplier)  : '1.5',
    isResident:             emp.isResident ?? true,
    gender:                 emp.gender ?? '',
    dateOfBirth:            emp.dateOfBirth?.split('T')[0] ?? '',
    isMarried:              emp.isMarried ?? false,
    isDisabled:             emp.isDisabled ?? false,
    numberOfChildren:       String(emp.numberOfChildren ?? 0),
    agedDependants:         String(emp.agedDependants ?? 0),
    vehicleBenefit:         emp.vehicleBenefit ? String(emp.vehicleBenefit) : '',
    accommodationCode:      emp.accommodationCode ?? '',
    vehicleCode:            emp.vehicleCode ?? '',
    isNsp:                  emp.isNsp ?? false,
    bankName:               emp.bankName ?? '',
    bankAccountNumber:      emp.bankAccountNumber ?? '',
    bankBranch:             emp.bankBranch ?? '',
  } : defaultForm);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Component assignment state ─────────────────────────────────────────────
  const [addingComp, setAddingComp] = useState(false);
  const defaultCompForm = { componentId: '', amount: '', rate: '', effectiveFrom: today };
  const [compForm, setCompForm] = useState(defaultCompForm);
  const setC = (k: string, v: string) => setCompForm((f) => ({ ...f, [k]: v }));

  // ── Loan state ─────────────────────────────────────────────────────────────
  const { data: loans = [], refetch: refetchLoans } = useQuery({
    queryKey: ['employee-loans', effectiveEmpId],
    queryFn:  () => payrollSvc.listLoans(organisationId, effectiveEmpId!),
    enabled:  !!effectiveEmpId,
  });
  const [addingLoan, setAddingLoan] = useState(false);
  const { data: assetAccountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting', 'asset'],
    queryFn:  () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false, postingOnly: true }),
    enabled:  activeTab === 'loans' && !!effectiveEmpId,
  });
  const assetAccountOptions: AccountOption[] = toAccountOptions(
    (assetAccountsData?.accounts ?? []).filter((a) => a.class === 'ASSET'),
  );
  const defaultLoanForm = { description: '', principalAmount: '', instalmentAmount: '', startDate: today, glAccountId: '' };
  const [loanForm, setLoanForm] = useState(defaultLoanForm);
  const setL = (k: string, v: string) => setLoanForm((f) => ({ ...f, [k]: v }));

  const [loanError, setLoanError] = useState<string | null>(null);

  const createLoan = useMutation({
    mutationFn: () => payrollSvc.createLoan(organisationId, effectiveEmpId!, {
      description:      loanForm.description,
      principalAmount:  Number(loanForm.principalAmount),
      instalmentAmount: Number(loanForm.instalmentAmount),
      startDate:        loanForm.startDate,
      glAccountId:      loanForm.glAccountId || undefined,
    }),
    onSuccess: () => { void refetchLoans(); setAddingLoan(false); setLoanForm(defaultLoanForm); setLoanError(null); },
    onError: (err: unknown) => {
      setLoanError((err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err as Error)?.message ?? 'Failed to create loan');
    },
  });

  const updateLoanStatus = useMutation({
    mutationFn: ({ loanId, status }: { loanId: string; status: EmployeeLoan['status'] }) =>
      payrollSvc.updateLoan(organisationId, effectiveEmpId!, loanId, { status }),
    onSuccess: () => void refetchLoans(),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        basicSalary:            Number(form.basicSalary),
        endDate:                form.endDate || undefined,
        email:                  form.email || undefined,
        phone:                  form.phone || undefined,
        nationalId:             form.nationalId || undefined,
        tinNumber:              form.tinNumber || undefined,
        ssnitNumber:            form.ssnitNumber || undefined,
        jobTitle:               form.jobTitle || undefined,
        departmentId:           form.departmentId || undefined,
        costCentreId:           form.costCentreId || undefined,
        bankName:               form.bankName || undefined,
        bankAccountNumber:      form.bankAccountNumber || undefined,
        bankBranch:             form.bankBranch || undefined,
        tier3EmployeeRate:      form.tier3EmployeeRate ? Number(form.tier3EmployeeRate) / 100 : undefined,
        tier3EmployerRate:      form.tier3EmployerRate ? Number(form.tier3EmployerRate) / 100 : undefined,
        salaryExpenseAccountId: form.salaryExpenseAccountId || undefined,
        overtimeType:           form.overtimeType,
        overtimeFixedAmount:    form.overtimeFixedAmount ? Number(form.overtimeFixedAmount) : undefined,
        overtimeMultiplier:     form.overtimeMultiplier  ? Number(form.overtimeMultiplier)  : undefined,
        gender:                 form.gender || undefined,
        dateOfBirth:            form.dateOfBirth || undefined,
        numberOfChildren:       Number(form.numberOfChildren || 0),
        agedDependants:         Number(form.agedDependants || 0),
        accommodationCode:      form.accommodationCode || null,
        vehicleCode:            form.vehicleCode || null,
        isNsp:                  form.isNsp,
      };
      return emp
        ? payrollSvc.updateEmployee(organisationId, emp.id, payload as unknown as Parameters<typeof payrollSvc.updateEmployee>[2])
        : payrollSvc.createEmployee(organisationId, payload as unknown as Parameters<typeof payrollSvc.createEmployee>[1]);
    },
    onSuccess: (result) => {
      setSaveError(null);
      void qc.invalidateQueries({ queryKey: ['payroll-employees', organisationId] });
      if (!emp) {
        setSavedEmpId(result.id);
        setActiveTab('pay-elements');
      } else {
        onClose();
      }
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { error?: { message?: string; details?: Record<string, string[]> }; message?: string } } })?.response?.data;
      const details = data?.error?.details;
      if (details && Object.keys(details).length > 0) {
        // Turn { basicSalary: ["Number must be greater than 0"] } into a readable,
        // field-named message instead of the generic "Invalid request data".
        const msg = Object.entries(details)
          .map(([field, msgs]) => `${EMP_FIELD_LABELS[field] ?? field}: ${(msgs ?? []).join(', ')}`)
          .join(' · ');
        setSaveError(msg);
        return;
      }
      setSaveError(data?.error?.message ?? data?.message ?? (err as Error)?.message ?? 'Failed to save employee');
    },
  });

  // Catch missing required fields before hitting the API, and send the user to
  // the tab that holds the offending field (basicSalary lives on Compensation,
  // which is easy to skip). Returns true if it's safe to save.
  const guardRequiredFields = (scope: 'all' | EmpTab = 'all'): boolean => {
    const checks: { ok: boolean; msg: string; tab: EmpTab }[] = [
      { ok: !!form.employeeNumber.trim(), msg: 'Employee Number is required.', tab: 'personal' },
      { ok: !!form.firstName.trim(),      msg: 'First Name is required.',      tab: 'personal' },
      { ok: !!form.lastName.trim(),       msg: 'Last Name is required.',       tab: 'personal' },
      { ok: !!form.startDate,             msg: 'Start Date is required.',       tab: 'employment' },
      { ok: form.basicSalary !== '' && Number(form.basicSalary) > 0,
        msg: 'Basic Salary is required and must be greater than 0.',           tab: 'compensation' },
    ];
    // scope='all' validates everything (final create); a tab key validates just
    // that tab's fields so the wizard can advance page-by-page.
    const missing = checks.filter((c) => !c.ok && (scope === 'all' || c.tab === scope));
    if (missing.length > 0) {
      setActiveTab(missing[0].tab);
      setSaveError(missing[0].msg);
      return false;
    }
    return true;
  };

  const assignComp = useMutation({
    mutationFn: () => payrollSvc.assignComponent(organisationId, effectiveEmpId!, {
      componentId:  compForm.componentId,
      amount:       compForm.amount ? Number(compForm.amount) : undefined,
      rate:         compForm.rate   ? Number(compForm.rate) / 100 : undefined,
      effectiveFrom: compForm.effectiveFrom,
    }),
    onSuccess: () => { void refetchEmp(); setAddingComp(false); setCompForm(defaultCompForm); },
  });

  const removeComp = useMutation({
    mutationFn: (assignmentId: string) => payrollSvc.removeComponent(organisationId, effectiveEmpId!, assignmentId),
    onSuccess: () => void refetchEmp(),
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentComponents = (freshEmp ?? emp)?.components ?? [];
  const requiresEmpId = (key: EmpTab) => key === 'pay-elements' || key === 'loans';
  const tabLocked     = (key: EmpTab) => requiresEmpId(key) && !effectiveEmpId;
  const tabIdx  = EMP_TABS.findIndex((t) => t.key === activeTab);
  const canBack = tabIdx > 0;
  const canNext = tabIdx < EMP_TABS.length - 1 && !tabLocked(EMP_TABS[tabIdx + 1].key);
  const isPayElements = activeTab === 'pay-elements';
  const isLoans       = activeTab === 'loans';
  // 'bank' is the last data-entry tab; everything after it needs a saved employee id.
  const isLastDataTab = activeTab === 'bank';

  function goTo(key: EmpTab) {
    if (tabLocked(key)) return;
    setActiveTab(key);
  }

  // Primary button. For a brand-new employee the wizard advances page-by-page,
  // validating only the current tab, and performs the actual create when the user
  // finishes the last data tab (Bank) — then jumps to Pay Elements. When editing an
  // existing/just-created employee, it validates everything and saves immediately.
  function handlePrimary() {
    setSaveError(null);
    const finaliseNow = !!emp || !!savedEmpId || isLastDataTab;
    if (finaliseNow) {
      if (guardRequiredFields('all')) save.mutate();
      return;
    }
    if (guardRequiredFields(activeTab)) {
      goTo(EMP_TABS[tabIdx + 1].key);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">

      {/* Progress stepper (full page) */}
      {fullPage ? (
        <div className="mb-6 overflow-x-auto pb-1">
          <ol className="flex items-center min-w-max">
            {EMP_TABS.map((t, i) => {
              const isActive = activeTab === t.key;
              const isDone = i < tabIdx;
              const locked = tabLocked(t.key);
              return (
                <li key={t.key} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => goTo(t.key)}
                    disabled={locked}
                    title={locked ? 'Save the employee first to unlock this step' : t.label}
                    className={['flex items-center gap-2', locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'].join(' ')}
                  >
                    <span className={[
                      'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border transition-colors shrink-0',
                      isActive ? 'bg-primary text-primary-foreground border-primary'
                        : isDone ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-muted text-muted-foreground border-transparent',
                    ].join(' ')}>
                      {locked ? <Lock size={12} /> : isDone ? <Check size={14} /> : i + 1}
                    </span>
                    <span className={['text-sm whitespace-nowrap', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>{t.label}</span>
                  </button>
                  {i < EMP_TABS.length - 1 && <div className={['h-px w-8 mx-2 shrink-0', isDone ? 'bg-primary/40' : 'bg-border'].join(' ')} />}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="flex border-b mb-5 overflow-x-auto gap-0">
          {EMP_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => goTo(t.key)}
              disabled={tabLocked(t.key)}
              className={[
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                tabLocked(t.key) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className={fullPage ? 'pr-1' : 'max-h-[55vh] overflow-y-auto pr-1'}>

        {/* ── Personal ── */}
        {activeTab === 'personal' && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Employee No.</label>
              <Input value={form.employeeNumber} onChange={(e) => set('employeeNumber', e.target.value)} />
              {!emp && <p className="text-xs text-muted-foreground mt-0.5">Auto-generated — override if needed</p>}
            </div>
            <div><label className="text-sm font-medium">First Name <span className="text-destructive">*</span></label><Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
            <div><label className="text-sm font-medium">Last Name <span className="text-destructive">*</span></label><Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
            <div className="col-span-2"><label className="text-sm font-medium">Email</label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div><label className="text-sm font-medium">Phone</label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div><label className="text-sm font-medium">National ID</label><Input value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} /></div>
            <div>
              <label className="text-sm font-medium">Gender</label>
              <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date of Birth</label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              {form.dateOfBirth && <p className="text-xs text-muted-foreground mt-0.5">{ageInfo(form.dateOfBirth)}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Residency</label>
              <Select value={form.isResident ? 'resident' : 'non'} onChange={(e) => set('isResident', e.target.value === 'resident')}>
                <option value="resident">Resident</option>
                <option value="non">Non-resident</option>
              </Select>
            </div>

            {/* Reliefs & dependants (feed PAYE reliefs / GRA returns) */}
            <div className="col-span-3 border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reliefs & dependants</p>
              <div className="grid grid-cols-3 gap-3 items-end">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isMarried} onChange={(e) => set('isMarried', e.target.checked)} /> Married</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDisabled} onChange={(e) => set('isDisabled', e.target.checked)} /> Disabled</label>
                <label className="flex items-center gap-2 text-sm" title="No PAYE and no SSNIT — all pay is non-taxable"><input type="checkbox" checked={form.isNsp} onChange={(e) => set('isNsp', e.target.checked)} /> National Service (NSP)</label>
                <div><label className="text-sm font-medium">Children</label><Input type="number" min={0} value={form.numberOfChildren} onChange={(e) => set('numberOfChildren', e.target.value)} /></div>
                <div><label className="text-sm font-medium">Aged dependants</label><Input type="number" min={0} value={form.agedDependants} onChange={(e) => set('agedDependants', e.target.value)} /></div>
                <div />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Non-cash benefits (taxed on TCE)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Accommodation</label>
                  <Select value={form.accommodationCode} onChange={(e) => set('accommodationCode', e.target.value)}>
                    <option value="">None</option>
                    <option value="AF">Accommodation with furnishings (10%)</option>
                    <option value="AO">Accommodation only (7.5%)</option>
                    <option value="FO">Furnishings only (2.5%)</option>
                    <option value="SA">Shared accommodation (2.5%)</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Vehicle / fuel</label>
                  <Select value={form.vehicleCode} onChange={(e) => set('vehicleCode', e.target.value)}>
                    <option value="">None</option>
                    <option value="FVD">Vehicle, fuel & driver (12.5%, cap 1,500)</option>
                    <option value="VF">Vehicle with fuel (10%, cap 1,250)</option>
                    <option value="V">Vehicle only (5%, cap 625)</option>
                    <option value="F">Fuel only (5%, cap 625)</option>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Employment ── */}
        {activeTab === 'employment' && (
          <div className="grid grid-cols-2 gap-3">
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
            <div><label className="text-sm font-medium">Job Title</label><Input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
            <div>
              <label className="text-sm font-medium">Department</label>
              <Select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">— none —</option>
                {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Cost Centre</label>
              <Select value={form.costCentreId} onChange={(e) => set('costCentreId', e.target.value)}>
                <option value="">— none —</option>
                {costCentres.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div><label className="text-sm font-medium">Start Date <span className="text-destructive">*</span></label><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
            <div><label className="text-sm font-medium">End Date</label><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
          </div>
        )}

        {/* ── Compensation ── */}
        {activeTab === 'compensation' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">Basic Salary (GHS / month) <span className="text-destructive">*</span></label>
              <Input type="number" value={form.basicSalary} onChange={(e) => set('basicSalary', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Tier 3 Employee Rate (%)</label>
              <Input type="number" step="0.5" value={form.tier3EmployeeRate} onChange={(e) => set('tier3EmployeeRate', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium">Tier 3 Employer Rate (%)</label>
              <Input type="number" step="0.5" value={form.tier3EmployerRate} onChange={(e) => set('tier3EmployerRate', e.target.value)} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Salary Expense Account</label>
              <AccountSelect
                value={form.salaryExpenseAccountId}
                onChange={(id) => set('salaryExpenseAccountId', id)}
                accounts={expenseAccountOptions}
                placeholder="— use run default —"
              />
            </div>

            {/* Overtime Configuration */}
            <div className="col-span-2 pt-2 border-t">
              <p className="text-sm font-semibold mb-2">Overtime Configuration</p>
              {Number(form.basicSalary) > 1500 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-amber-50 border border-amber-200">
                  <XCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Not Qualified for Overtime Tax Treatment</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      GRA overtime rates (5% / 10%) apply only to junior staff with monthly basic ≤ GHS 1,500
                      (annual ≤ GHS 18,000). This employee's basic salary exceeds the threshold.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium">Overtime Type</label>
                    <Select value={form.overtimeType} onChange={(e) => set('overtimeType', e.target.value)}>
                      <option value="NONE">None — enter manually at each payroll run</option>
                      <option value="FIXED">Fixed Amount — same amount every period</option>
                      <option value="RATE_BASED">Rate-Based — hours × hourly rate × multiplier</option>
                    </Select>
                  </div>
                  {form.overtimeType === 'FIXED' && (
                    <div className="col-span-2">
                      <label className="text-xs font-medium">Fixed Overtime Amount (GHS / period)</label>
                      <Input type="number" value={form.overtimeFixedAmount} onChange={(e) => set('overtimeFixedAmount', e.target.value)} placeholder="0.00" />
                    </div>
                  )}
                  {form.overtimeType === 'RATE_BASED' && (
                    <>
                      <div>
                        <label className="text-xs font-medium">Overtime Multiplier (e.g. 1.5 = time-and-a-half)</label>
                        <Input type="number" step="0.25" value={form.overtimeMultiplier} onChange={(e) => set('overtimeMultiplier', e.target.value)} placeholder="1.5" />
                      </div>
                      {form.basicSalary && (
                        <div className="flex items-end pb-1">
                          <p className="text-xs text-muted-foreground">
                            Hourly rate: <span className="font-semibold">GHS {fmt(Number(form.basicSalary) / 176)}</span>
                            <br />Based on 22 working days × 8 hrs = 176 hrs/month
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tax & Statutory ── */}
        {activeTab === 'statutory' && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium">TIN Number</label><Input value={form.tinNumber} onChange={(e) => set('tinNumber', e.target.value)} /></div>
            <div><label className="text-sm font-medium">SSNIT Number</label><Input value={form.ssnitNumber} onChange={(e) => set('ssnitNumber', e.target.value)} /></div>
            <div className="col-span-2 flex items-start gap-3 p-3 bg-muted/40 rounded-md mt-1">
              <input
                type="checkbox"
                id="isResident"
                checked={!!form.isResident}
                onChange={(e) => set('isResident', e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <div>
                <label htmlFor="isResident" className="text-sm font-medium cursor-pointer">Resident Employee</label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uncheck for non-resident employees — overtime is taxed at a flat 20% (GRA rule) rather than the standard PAYE bands.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Bank ── */}
        {activeTab === 'bank' && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium">Bank Name</label><Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
            <div><label className="text-sm font-medium">Bank Branch</label><Input value={form.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} /></div>
            <div className="col-span-2"><label className="text-sm font-medium">Account Number</label><Input value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} /></div>
          </div>
        )}

        {/* ── Pay Elements ── */}
        {activeTab === 'pay-elements' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Salary components assigned to this employee. Changes take effect from the specified date.
              </p>
              {!addingComp && (
                <Button size="sm" onClick={() => setAddingComp(true)}>
                  <Plus className="w-3 h-3 mr-1" />Add Component
                </Button>
              )}
            </div>

            {addingComp && (
              <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                <p className="text-sm font-semibold">New Pay Element</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium">Component <span className="text-destructive">*</span></label>
                    <Select value={compForm.componentId} onChange={(e) => setC('componentId', e.target.value)}>
                      <option value="">— select —</option>
                      {allComponents
                        .filter((c) => c.isActive && c.type !== 'BASIC_SALARY' && c.type !== 'OVERTIME')
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name} — {COMP_TYPE_LABELS[c.type]}</option>
                        ))}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Fixed Amount (GHS)</label>
                    <Input type="number" value={compForm.amount} onChange={(e) => setC('amount', e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Rate (% of basic salary)</label>
                    <Input type="number" step="0.5" value={compForm.rate} onChange={(e) => setC('rate', e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Effective From <span className="text-destructive">*</span></label>
                    <Input type="date" value={compForm.effectiveFrom} onChange={(e) => setC('effectiveFrom', e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Enter a fixed amount or a rate — not both. Rate is applied to basic salary at payroll run time.</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setAddingComp(false); setCompForm(defaultCompForm); }}>Cancel</Button>
                  <Button size="sm" onClick={() => assignComp.mutate()} disabled={!compForm.componentId || assignComp.isPending}>Add</Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount / Rate</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentComponents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No pay elements assigned yet
                    </TableCell>
                  </TableRow>
                )}
                {currentComponents.map((ec) => (
                  <TableRow key={ec.id}>
                    <TableCell className="font-medium">{ec.component.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{COMP_TYPE_LABELS[ec.component.type]}</Badge></TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {ec.amount
                        ? `GHS ${fmt(ec.amount)}`
                        : ec.rate
                        ? `${(Number(ec.rate) * 100).toFixed(2)}% of basic`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{ec.effectiveFrom.split('T')[0]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ec.effectiveTo?.split('T')[0] ?? 'Ongoing'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeComp.mutate(ec.id)}
                        disabled={removeComp.isPending}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {/* ── Loans ── */}
        {activeTab === 'loans' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Salary advances and loans — instalments are deducted automatically each payroll run.</p>
              {!addingLoan && (
                <Button size="sm" onClick={() => setAddingLoan(true)}>
                  <Plus className="w-3 h-3 mr-1" />New Loan
                </Button>
              )}
            </div>

            {addingLoan && (
              <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                <p className="text-sm font-semibold">New Loan / Advance</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium">Description <span className="text-destructive">*</span></label>
                    <Input value={loanForm.description} onChange={(e) => setL('description', e.target.value)} placeholder="e.g. Salary Advance — May 2026" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Principal Amount (GHS) <span className="text-destructive">*</span></label>
                    <Input type="number" value={loanForm.principalAmount} onChange={(e) => setL('principalAmount', e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Monthly Instalment (GHS) <span className="text-destructive">*</span></label>
                    <Input type="number" value={loanForm.instalmentAmount} onChange={(e) => setL('instalmentAmount', e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Repayment Start Date <span className="text-destructive">*</span></label>
                    <Input type="date" value={loanForm.startDate} onChange={(e) => setL('startDate', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">GL Account (Loans to Employees)</label>
                    <AccountSelect value={loanForm.glAccountId} onChange={(id) => setL('glAccountId', id)} accounts={assetAccountOptions} placeholder="— optional —" />
                  </div>
                </div>
                {loanForm.principalAmount && loanForm.instalmentAmount && Number(loanForm.instalmentAmount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Estimated repayment: {Math.ceil(Number(loanForm.principalAmount) / Number(loanForm.instalmentAmount))} months
                  </p>
                )}
                {loanError && <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{loanError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setAddingLoan(false); setLoanForm(defaultLoanForm); setLoanError(null); }}>Cancel</Button>
                  <Button size="sm" disabled={!loanForm.description || !loanForm.principalAmount || !loanForm.instalmentAmount || createLoan.isPending} onClick={() => { setLoanError(null); createLoan.mutate(); }}>
                    {createLoan.isPending ? 'Creating…' : 'Create Loan'}
                  </Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Instalment</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No loans recorded</TableCell></TableRow>
                )}
                {loans.map((loan) => {
                  const pct = Math.round((1 - Number(loan.balance) / Number(loan.principalAmount)) * 100);
                  return (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <div className="font-medium">{loan.description}</div>
                        <div className="w-32 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{pct}% repaid</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">GHS {fmt(loan.principalAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{Number(loan.balance) > 0 ? `GHS ${fmt(loan.balance)}` : <span className="text-green-600">Cleared</span>}</TableCell>
                      <TableCell className="text-right font-mono text-sm">GHS {fmt(loan.instalmentAmount)}</TableCell>
                      <TableCell className="text-sm">{loan.startDate.split('T')[0]}</TableCell>
                      <TableCell><Badge className={LOAN_STATUS_COLORS[loan.status] ?? ''}>{loan.status}</Badge></TableCell>
                      <TableCell>
                        {loan.status === 'ACTIVE' && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => updateLoanStatus.mutate({ loanId: loan.id, status: 'CANCELLED' })}>Cancel</Button>
                        )}
                        {loan.status === 'SUSPENDED' && (
                          <Button variant="ghost" size="sm" onClick={() => updateLoanStatus.mutate({ loanId: loan.id, status: 'ACTIVE' })}>Resume</Button>
                        )}
                        {loan.status === 'ACTIVE' && (
                          <Button variant="ghost" size="sm" onClick={() => updateLoanStatus.mutate({ loanId: loan.id, status: 'SUSPENDED' })}>Suspend</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Footer */}
      {saveError && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mt-3">{saveError}</p>}
      <div className="flex justify-between items-center pt-4 border-t mt-2">
        <div className="flex gap-2">
          {canBack && <Button variant="outline" onClick={() => goTo(EMP_TABS[tabIdx - 1].key)}>← Back</Button>}
          {canNext && <Button variant="outline" onClick={() => goTo(EMP_TABS[tabIdx + 1].key)}>Next →</Button>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>{savedEmpId && !emp ? 'Done' : 'Cancel'}</Button>
          {!isPayElements && !isLoans && (
            <Button onClick={handlePrimary} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : emp ? 'Save' : savedEmpId ? 'Update' : isLastDataTab ? 'Save & Create →' : 'Save & Continue →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMP_STATUS_CLASS: Record<payrollSvc.EmployeeStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  RESIGNED: 'bg-gray-100 text-gray-600',
  DISMISSED: 'bg-red-100 text-red-700',
};

function reliefSummary(e: Employee): string {
  const parts: string[] = [];
  if (e.isMarried) parts.push('Married');
  if (e.numberOfChildren > 0) parts.push(`${e.numberOfChildren} child${e.numberOfChildren === 1 ? '' : 'ren'}`);
  if (e.agedDependants > 0) parts.push(`${e.agedDependants} aged dep.`);
  if (e.isDisabled) parts.push('Disabled');
  if (e.isNsp) parts.push('NSP');
  if (e.vehicleCode) parts.push(`Vehicle (${e.vehicleCode})`);
  if (e.accommodationCode) parts.push(`Accom (${e.accommodationCode})`);
  return parts.length ? parts.join(' · ') : '—';
}

function EmployeeStatusControl({ organisationId, employee }: { organisationId: string; employee: Employee }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: payrollSvc.EmployeeStatus) => {
      const reason = status !== 'ACTIVE' ? (window.prompt(`Reason for marking ${employee.firstName} ${status.toLowerCase()} (optional):`) ?? undefined) : undefined;
      return payrollSvc.setEmployeeStatus(organisationId, employee.id, { status, reason: reason || undefined });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll-employees', organisationId] }),
  });
  return (
    <Select
      value={employee.status}
      onChange={(e) => mutation.mutate(e.target.value as payrollSvc.EmployeeStatus)}
      disabled={mutation.isPending}
      className="h-7 text-xs w-32"
    >
      <option value="ACTIVE">Active</option>
      <option value="SUSPENDED">Suspended</option>
      <option value="RESIGNED">Resigned</option>
      <option value="DISMISSED">Dismissed</option>
    </Select>
  );
}

function EmployeesTab({ organisationId }: { organisationId: string }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['payroll-employees', organisationId],
    queryFn:  () => payrollSvc.listEmployees(organisationId),
  });

  function openCreate() { navigate('/payroll/employees/new'); }
  function openEdit(e: Employee) { navigate(`/payroll/employees/${e.id}/edit`); }

  if (isLoading) return <Skeleton className="h-40" />;

  const filtered = employees.filter((e) => !statusFilter || e.status === statusFilter);
  const activeCount = employees.filter((e) => e.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs w-40">
            <option value="">All ({employees.length})</option>
            <option value="ACTIVE">Active ({activeCount})</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="RESIGNED">Resigned</option>
            <option value="DISMISSED">Dismissed</option>
          </Select>
          <span className="text-xs text-muted-foreground">Payroll runs only for <strong>Active</strong> employees.</span>
        </div>
        <Button size="sm" onClick={openCreate}><Users className="w-4 h-4 mr-1" />Add Employee</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Emp No.</TableHead><TableHead>Name</TableHead><TableHead>Gender</TableHead>
            <TableHead>Age / Retirement</TableHead><TableHead>Residency</TableHead>
            <TableHead>Reliefs</TableHead><TableHead className="text-right">Basic</TableHead>
            <TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-6">No employees</TableCell></TableRow>
            )}
            {filtered.map((e) => {
              const age = ageFromDob(e.dateOfBirth);
              return (
                <TableRow key={e.id} className={e.status !== 'ACTIVE' ? 'opacity-70' : ''}>
                  <TableCell className="font-mono text-sm">{e.employeeNumber}</TableCell>
                  <TableCell>{e.firstName} {e.lastName}<div className="text-[11px] text-muted-foreground">{e.department?.name ?? '—'}</div></TableCell>
                  <TableCell className="text-sm">{e.gender ? e.gender[0] + e.gender.slice(1).toLowerCase() : '—'}</TableCell>
                  <TableCell className="text-xs">
                    {age === null ? '—' : age >= RETIREMENT_AGE
                      ? <span className="text-red-600 font-medium">{age} · Retired</span>
                      : <span>{age} · <span className="text-muted-foreground">{RETIREMENT_AGE - age} yr to go</span></span>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{e.isResident ? 'Resident' : 'Non-resident'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{reliefSummary(e)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(e.basicSalary)}</TableCell>
                  <TableCell><Badge className={EMP_STATUS_CLASS[e.status]}>{e.status[0] + e.status.slice(1).toLowerCase()}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <EmployeeStatusControl organisationId={organisationId} employee={e} />
                      <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>Edit</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
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
                  {Number(slip.overtimeTax) > 0 && <div className="flex justify-between text-red-600"><span>Overtime Tax</span><span>GHS {fmt(slip.overtimeTax)}</span></div>}
                  {Number(slip.bonusTax)   > 0 && <div className="flex justify-between text-red-600"><span>Bonus Tax</span><span>GHS {fmt(slip.bonusTax)}</span></div>}
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
  const { data: accountsData }     = useQuery({ queryKey: ['accounts', organisationId, 'posting'], queryFn: () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false, postingOnly: true }) });
  const { data: employees = [] }   = useQuery({ queryKey: ['payroll-employees', organisationId], queryFn: () => payrollSvc.listEmployees(organisationId, true) });

  const allAccounts = accountsData?.accounts ?? [];
  const liabilityOptions: AccountOption[] = toAccountOptions(allAccounts.filter((a) => a.class === 'LIABILITY'));
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

  // Per-employee overrides: keyed by employeeId
  type Override = { overtimePay: string; overtimeHours: string; bonuses: string };
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const setOv = (empId: string, k: keyof Override, v: string) =>
    setOverrides((prev) => ({ ...prev, [empId]: { ...(prev[empId] ?? { overtimePay: '', overtimeHours: '', bonuses: '' }), [k]: v } }));

  const [runError, setRunError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const builtOverrides = employees
        .map((e) => {
          const ov = overrides[e.id];
          const isRateBased = e.overtimeType === 'RATE_BASED';
          return {
            employeeId:    e.id,
            overtimePay:   (!isRateBased && ov?.overtimePay)   ? Number(ov.overtimePay)   : undefined,
            overtimeHours: (isRateBased  && ov?.overtimeHours) ? Number(ov.overtimeHours) : undefined,
            bonuses:       ov?.bonuses ? Number(ov.bonuses) : undefined,
          };
        })
        .filter((o) => o.overtimePay !== undefined || o.overtimeHours !== undefined || o.bonuses !== undefined);

      return payrollSvc.createPayrollRun(organisationId, { ...form, overrides: builtOverrides });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payroll-runs', organisationId] }); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err as Error)?.message ?? 'Failed to create payroll run';
      setRunError(msg);
    },
  });

  const requiredFields = [
    { key: 'periodId',               label: 'Accounting Period' },
    { key: 'paymentDate',            label: 'Payment Date' },
    { key: 'description',            label: 'Description' },
    { key: 'wagesPayableAccountId',  label: 'Wages Payable account' },
    { key: 'payePayableAccountId',   label: 'PAYE Payable account' },
    { key: 'ssnitPayableAccountId',  label: 'SSNIT Payable account' },
    { key: 'pensionPayableAccountId', label: 'Pension Payable account' },
  ] as const;

  function handleCreate() {
    setRunError(null);
    const missing = requiredFields.filter(({ key }) => !(form as Record<string, string>)[key]);
    if (missing.length > 0) { setRunError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`); return; }
    create.mutate();
  }

  return (
    <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
      <div>
        <label className="text-sm font-medium">Accounting Period</label>
        <Select value={form.periodId} onChange={(e) => set('periodId', e.target.value)}>
          <option value="">Select period…</option>
          {openPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <div><label className="text-sm font-medium">Payment Date</label><Input type="date" value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} /></div>
      <div><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="May 2026 Payroll" /></div>

      <p className="text-xs text-gray-500 font-semibold pt-1">GL Accounts for this run</p>
      {([
        { key: 'wagesPayableAccountId',   label: 'Wages Payable' },
        { key: 'payePayableAccountId',    label: 'PAYE Payable' },
        { key: 'ssnitPayableAccountId',   label: 'SSNIT Payable' },
        { key: 'pensionPayableAccountId', label: 'Pension Payable' },
      ] as const).map(({ key, label }) => (
        <div key={key}>
          <label className="text-sm font-medium">{label}</label>
          <AccountSelect
            value={(form as Record<string, string>)[key]}
            onChange={(id) => set(key, id)}
            accounts={liabilityOptions}
            placeholder="Select account…"
          />
        </div>
      ))}

      {/* Per-employee adjustments */}
      {employees.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-gray-500 font-semibold mb-2">Per-Employee Adjustments (optional)</p>
          <div className="border rounded-md overflow-hidden text-sm">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Employee</span>
              <span className="w-32 text-center">Overtime</span>
              <span className="w-28 text-center">Bonus (GHS)</span>
              <span className="w-16 text-center">OT Type</span>
            </div>
            {employees.map((e) => {
              const ov = overrides[e.id] ?? { overtimePay: '', overtimeHours: '', bonuses: '' };
              const isFixed     = e.overtimeType === 'FIXED';
              const isRateBased = e.overtimeType === 'RATE_BASED';
              const hourlyRate  = isRateBased ? (Number(e.basicSalary) / 176) : 0;
              const mult        = e.overtimeMultiplier ? Number(e.overtimeMultiplier) : 1.5;
              const computed    = isRateBased && ov.overtimeHours ? fmt(Number(ov.overtimeHours) * hourlyRate * mult) : null;

              return (
                <div key={e.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 px-3 py-2 border-t items-center">
                  <div>
                    <span className="font-medium">{e.firstName} {e.lastName}</span>
                    <span className="text-muted-foreground text-xs ml-2">{e.employeeNumber}</span>
                    {isFixed && e.overtimeFixedAmount && (
                      <span className="text-xs text-blue-600 ml-2">Fixed: GHS {fmt(e.overtimeFixedAmount)}/period</span>
                    )}
                  </div>
                  <div className="w-32 px-2">
                    {isRateBased ? (
                      <div>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          placeholder="hrs"
                          value={ov.overtimeHours}
                          onChange={(e2) => setOv(e.id, 'overtimeHours', e2.target.value)}
                        />
                        {computed && <p className="text-xs text-muted-foreground mt-0.5 text-center">≈ GHS {computed}</p>}
                      </div>
                    ) : (
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        placeholder={isFixed ? String(e.overtimeFixedAmount ?? '0') : 'GHS'}
                        value={ov.overtimePay}
                        onChange={(e2) => setOv(e.id, 'overtimePay', e2.target.value)}
                      />
                    )}
                  </div>
                  <div className="w-28 px-2">
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      placeholder="0.00"
                      value={ov.bonuses}
                      onChange={(e2) => setOv(e.id, 'bonuses', e2.target.value)}
                    />
                  </div>
                  <div className="w-16 text-center">
                    <Badge variant="outline" className="text-xs">
                      {e.overtimeType === 'RATE_BASED' ? 'Rate' : e.overtimeType === 'FIXED' ? 'Fixed' : 'Manual'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div><label className="text-sm font-medium">Notes</label><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      {runError && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{runError}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Calculate & Create'}
        </Button>
      </div>
    </div>
  );
}

// ─── Run Detail ───────────────────────────────────────────────────────────────

function RunDetail({ organisationId, run }: { organisationId: string; run: PayrollRun }) {
  const qc = useQueryClient();
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['payroll-run', organisationId, run.id],
    queryFn:  () => payrollSvc.getPayrollRun(organisationId, run.id),
  });

  function onWorkflowError(err: unknown) {
    setWorkflowError((err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err as Error)?.message ?? 'Action failed');
  }

  function onWorkflowSuccess() {
    setWorkflowError(null);
    void qc.invalidateQueries({ queryKey: ['payroll-runs', organisationId] });
    void qc.invalidateQueries({ queryKey: ['payroll-run', organisationId, run.id] });
  }

  const submit  = useMutation({ mutationFn: () => payrollSvc.submitPayrollRun(organisationId, run.id),  onSuccess: onWorkflowSuccess, onError: onWorkflowError });
  const approve = useMutation({ mutationFn: () => payrollSvc.approvePayrollRun(organisationId, run.id), onSuccess: onWorkflowSuccess, onError: onWorkflowError });
  const pay     = useMutation({ mutationFn: () => payrollSvc.payPayrollRun(organisationId, run.id),     onSuccess: onWorkflowSuccess, onError: onWorkflowError });
  const lock    = useMutation({ mutationFn: () => payrollSvc.lockPayrollRun(organisationId, run.id),    onSuccess: onWorkflowSuccess, onError: onWorkflowError });
  const del     = useMutation({ mutationFn: () => payrollSvc.deletePayrollRun(organisationId, run.id),  onSuccess: onWorkflowSuccess, onError: onWorkflowError });

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
        {run.status === 'DRAFT' && (
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={() => { if (window.confirm('Delete this draft run? This cannot be undone.')) del.mutate(); }}
            disabled={del.isPending}>
            <Trash2 className="w-4 h-4 mr-1" />Delete Draft
          </Button>
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
        {run.status === 'PAID' && (
          <Button size="sm" variant="outline" className="text-slate-700 border-slate-300 hover:bg-slate-50"
            onClick={() => { if (window.confirm('Lock this run? The payment file cannot be regenerated after locking. Download it first if needed.')) lock.mutate(); }}
            disabled={lock.isPending}>
            <Lock className="w-4 h-4 mr-1" />{lock.isPending ? 'Locking…' : 'Lock Run'}
          </Button>
        )}
        {run.status === 'LOCKED' && (
          <span className="inline-flex items-center text-xs text-muted-foreground"><Lock className="w-3.5 h-3.5 mr-1" />Locked — payment file can no longer be regenerated</span>
        )}
      </div>

      {workflowError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{workflowError}</p>
      )}

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

      <Attachments organisationId={organisationId} entityType="PAYROLL" entityId={run.id} title="Supporting documents" />
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
          <DialogContent className="max-w-3xl">
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

type Tab = 'runs' | 'employees' | 'components' | 'statutory' | 'reports';

const TABS: { key: Tab; label: string }[] = [
  { key: 'runs',       label: 'Payroll Runs' },
  { key: 'employees',  label: 'Employees' },
  { key: 'components', label: 'Salary Components' },
  { key: 'statutory',  label: 'Statutory Config' },
  { key: 'reports',    label: 'Reports' },
];

export function PayrollPage() {
  const orgId = useAuthStore((s) => s.activeOrganisationId) ?? '';
  const { section } = useParams<{ section: string }>();
  const tab: Tab = (TABS.some((t) => t.key === section) ? section : 'runs') as Tab;
  const sectionLabel = TABS.find((t) => t.key === tab)?.label ?? 'Payroll';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Payroll <span className="mx-1">›</span> <span className="text-foreground font-medium">{sectionLabel}</span></p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{sectionLabel}</h1>
          <p className="text-sm text-gray-500 mt-1">Ghana GRA compliant payroll with PAYE, SSNIT Tier 1/2/3 and four-eyes approval workflow</p>
        </div>
      </div>

      {tab === 'runs'       && <RunsTab            organisationId={orgId} />}
      {tab === 'employees'  && <EmployeesTab        organisationId={orgId} />}
      {tab === 'components' && <SalaryComponentsTab organisationId={orgId} />}
      {tab === 'statutory'  && <StatutoryTab        organisationId={orgId} />}
      {tab === 'reports'    && <PayrollReportsPage />}
    </div>
  );
}
