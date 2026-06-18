import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Settings, Play, Download, Upload, ChevronDown, ChevronRight, CheckCircle, XCircle, Plus, Trash2, Lock, Check } from 'lucide-react';
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
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number | null | undefined, dp = 2) {
  const v = Number(n ?? 0);
  return isNaN(v) ? '0.00' : v.toLocaleString('en-GH', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const RETIREMENT_AGE = 60; // Ghana statutory retirement age

// ── Reducing-balance loan amortization (matches the server's computeLoanEmi) ──
function emiOf(principal: number, annualRate: number, termMonths: number): number {
  if (!termMonths || termMonths <= 0 || !principal) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  const f = Math.pow(1 + r, termMonths);
  return (principal * r * f) / (f - 1);
}
function buildAmortization(principal: number, annualRate: number, termMonths: number) {
  const emi = emiOf(principal, annualRate, termMonths);
  const r = annualRate / 12;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows: { period: number; payment: number; interest: number; principal: number; balance: number }[] = [];
  let bal = principal;
  for (let i = 1; i <= termMonths && bal > 0; i++) {
    const interest = r <= 0 ? 0 : r2(bal * r);
    let principalPart = r2(emi - interest);
    if (i === termMonths || principalPart > bal) principalPart = r2(bal);
    bal = r2(bal - principalPart);
    rows.push({ period: i, payment: r2(principalPart + interest), interest, principal: principalPart, balance: Math.max(0, bal) });
  }
  const totalInterest = r2(rows.reduce((s, x) => s + x.interest, 0));
  return { emi, rows, totalInterest };
}

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

  const defaultForm = { code: '', name: '', type: 'ALLOWANCE' as SalaryComponentType, isTaxable: true, isVariable: false, glAccountId: '', description: '' };
  const [form, setForm] = useState(defaultForm);
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() { setEditComp(null); setForm(defaultForm); setOpen(true); }
  function openEdit(c: SalaryComponent) {
    setEditComp(c);
    setForm({ code: c.code, name: c.name, type: c.type, isTaxable: c.isTaxable, isVariable: c.isVariable, glAccountId: c.glAccountId ?? '', description: c.description ?? '' });
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
            <TableHead>Frequency</TableHead>
            <TableHead>Taxable</TableHead><TableHead>GL Account</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {components.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">No salary components defined</TableCell></TableRow>
            )}
            {components.map((c) => (
              <TableRow key={c.id} className={!c.isActive ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-sm">{c.code}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell><Badge variant="outline">{COMP_TYPE_LABELS[c.type]}</Badge></TableCell>
                <TableCell><Badge variant={c.isVariable ? 'secondary' : 'outline'} className="text-[10px]">{c.isVariable ? 'Variable' : 'Fixed'}</Badge></TableCell>
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
              <label className="text-sm font-medium">Frequency</label>
              <Select value={form.isVariable ? 'VARIABLE' : 'FIXED'} onChange={(e) => set('isVariable', e.target.value === 'VARIABLE')}>
                <option value="FIXED">Fixed — standing element, assigned to employees, runs every period</option>
                <option value="VARIABLE">Variable — entered each run via the pay-run import</option>
              </Select>
              <p className="text-xs text-muted-foreground mt-0.5">Variable elements appear as columns in the payroll-run import template (alongside overtime &amp; bonus).</p>
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
  const incomeAccountOptions: AccountOption[] = toAccountOptions(
    (assetAccountsData?.accounts ?? []).filter((a) => a.class === 'REVENUE'),
  );
  const defaultLoanForm = { description: '', principalAmount: '', startDate: today, glAccountId: '', disbursedFromAccountId: '', interestRate: '', termMonths: '', interestIncomeAccountId: '' };
  const [loanForm, setLoanForm] = useState(defaultLoanForm);
  const [interestBearing, setInterestBearing] = useState(false);
  const setL = (k: string, v: string) => setLoanForm((f) => ({ ...f, [k]: v }));

  // Live EMI + amortization preview for the New Loan form.
  const loanPrincipalNum = Number(loanForm.principalAmount) || 0;
  const loanRateFrac = interestBearing && loanForm.interestRate ? Number(loanForm.interestRate) / 100 : 0;
  const loanTermNum = Number(loanForm.termMonths) || 0;
  const loanAmort = loanPrincipalNum > 0 && loanTermNum > 0 ? buildAmortization(loanPrincipalNum, loanRateFrac, loanTermNum) : null;

  const [loanError, setLoanError] = useState<string | null>(null);

  const createLoan = useMutation({
    mutationFn: () => payrollSvc.createLoan(organisationId, effectiveEmpId!, {
      description:      loanForm.description,
      principalAmount:  Number(loanForm.principalAmount),
      startDate:        loanForm.startDate,
      glAccountId:      loanForm.glAccountId || undefined,
      disbursedFromAccountId: loanForm.disbursedFromAccountId || undefined,
      termMonths:       Number(loanForm.termMonths),
      interestRate:     interestBearing && loanForm.interestRate ? Number(loanForm.interestRate) / 100 : 0,
      interestIncomeAccountId: interestBearing ? (loanForm.interestIncomeAccountId || undefined) : undefined,
    }),
    onSuccess: () => { void refetchLoans(); setAddingLoan(false); setLoanForm(defaultLoanForm); setInterestBearing(false); setLoanError(null); },
    onError: (err: unknown) => {
      setLoanError((err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err as Error)?.message ?? 'Failed to create loan');
    },
  });

  const updateLoanStatus = useMutation({
    mutationFn: ({ loanId, status }: { loanId: string; status: EmployeeLoan['status'] }) =>
      payrollSvc.updateLoan(organisationId, effectiveEmpId!, loanId, { status }),
    onSuccess: () => void refetchLoans(),
  });

  const setLoanGl = useMutation({
    mutationFn: ({ loanId, glAccountId }: { loanId: string; glAccountId: string }) =>
      payrollSvc.updateLoan(organisationId, effectiveEmpId!, loanId, { glAccountId }),
    onSuccess: () => void refetchLoans(),
  });

  // Re-amortize the remaining balance over a new term (loan restructuring).
  const [adjustLoan, setAdjustLoan] = useState<EmployeeLoan | null>(null);
  const [adjustTerm, setAdjustTerm] = useState('');
  const reamortize = useMutation({
    mutationFn: ({ loanId, instalmentAmount, termMonths }: { loanId: string; instalmentAmount: number; termMonths: number }) =>
      payrollSvc.updateLoan(organisationId, effectiveEmpId!, loanId, { instalmentAmount, termMonths }),
    onSuccess: () => { void refetchLoans(); setAdjustLoan(null); setAdjustTerm(''); },
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
                  Uncheck for non-resident employees — taxed at a flat 25% on all employment income (GRA rule), with no graduated bands, tax-free threshold, or reliefs.
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
                    <label className="text-xs font-medium">Term — number of payroll periods (months) <span className="text-destructive">*</span></label>
                    <Input type="number" value={loanForm.termMonths} onChange={(e) => setL('termMonths', e.target.value)} placeholder="e.g. 6" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Repayment Start Date <span className="text-destructive">*</span></label>
                    <Input type="date" value={loanForm.startDate} onChange={(e) => setL('startDate', e.target.value)} />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <input type="checkbox" id="interestBearing" checked={interestBearing} onChange={(e) => setInterestBearing(e.target.checked)} />
                    <label htmlFor="interestBearing" className="text-xs font-medium">Interest-bearing loan</label>
                  </div>
                  {interestBearing && (
                    <>
                      <div>
                        <label className="text-xs font-medium">Interest Rate (% per annum) <span className="text-destructive">*</span></label>
                        <Input type="number" step="0.1" value={loanForm.interestRate} onChange={(e) => setL('interestRate', e.target.value)} placeholder="e.g. 12" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Interest Income account (revenue) <span className="text-destructive">*</span></label>
                        <AccountSelect value={loanForm.interestIncomeAccountId} onChange={(id) => setL('interestIncomeAccountId', id)} accounts={incomeAccountOptions} placeholder="— select —" />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-xs font-medium">GL Account — Loans Receivable (asset)</label>
                    <AccountSelect value={loanForm.glAccountId} onChange={(id) => setL('glAccountId', id)} accounts={assetAccountOptions} placeholder="— optional —" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Disburse from — Bank / Cash</label>
                    <AccountSelect value={loanForm.disbursedFromAccountId} onChange={(id) => setL('disbursedFromAccountId', id)} accounts={assetAccountOptions} placeholder="— don't post —" />
                  </div>
                </div>

                {/* Live EMI + amortization preview */}
                {loanAmort && (
                  <div className="rounded-md border bg-background p-2.5 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <p className="text-sm font-semibold">Equal payment (EMI): <span className="text-primary">GHS {fmt(loanAmort.emi)}</span> / month × {loanTermNum}</p>
                      <p className="text-xs text-muted-foreground">{interestBearing ? <>Total interest ≈ GHS {fmt(loanAmort.totalInterest)} · Total repayable GHS {fmt(loanPrincipalNum + loanAmort.totalInterest)}</> : 'Interest-free'}</p>
                    </div>
                    <div className="max-h-44 overflow-y-auto border rounded">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50 sticky top-0"><tr className="text-left text-muted-foreground">
                          <th className="px-2 py-1 font-medium">#</th><th className="px-2 py-1 font-medium text-right">Payment</th>
                          <th className="px-2 py-1 font-medium text-right">Interest</th><th className="px-2 py-1 font-medium text-right">Principal</th>
                          <th className="px-2 py-1 font-medium text-right">Balance</th>
                        </tr></thead>
                        <tbody>
                          {loanAmort.rows.map((row) => (
                            <tr key={row.period} className="border-t">
                              <td className="px-2 py-1">{row.period}</td><td className="px-2 py-1 text-right">{fmt(row.payment)}</td>
                              <td className="px-2 py-1 text-right">{fmt(row.interest)}</td><td className="px-2 py-1 text-right">{fmt(row.principal)}</td>
                              <td className="px-2 py-1 text-right">{fmt(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {loanForm.disbursedFromAccountId
                  ? <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">On create, the disbursement posts automatically: <strong>DR Loans Receivable</strong> / <strong>CR Bank/Cash</strong> for GHS {loanForm.principalAmount || '0'}. Requires the receivable account above and an open period on the start date.</p>
                  : <p className="text-[11px] text-muted-foreground">Pick a <strong>Disburse from</strong> account to auto-post the disbursement (DR receivable / CR bank). Leave blank if you booked it elsewhere.</p>}
                {loanError && <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{loanError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setAddingLoan(false); setLoanForm(defaultLoanForm); setInterestBearing(false); setLoanError(null); }}>Cancel</Button>
                  <Button size="sm" disabled={!loanForm.description || !loanPrincipalNum || !loanTermNum || (interestBearing && (!loanForm.interestRate || !loanForm.interestIncomeAccountId)) || createLoan.isPending} onClick={() => { setLoanError(null); createLoan.mutate(); }}>
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
                  <TableHead>GL Account (receivable)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No loans recorded</TableCell></TableRow>
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
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {pct}% repaid · {loan.termMonths ? `${loan.termMonths} mo` : '—'} · {Number(loan.interestRate) > 0 ? `${(Number(loan.interestRate) * 100).toFixed(1)}% p.a.` : 'interest-free'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">GHS {fmt(loan.principalAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{Number(loan.balance) > 0 ? `GHS ${fmt(loan.balance)}` : <span className="text-green-600">Cleared</span>}</TableCell>
                      <TableCell className="text-right font-mono text-sm">GHS {fmt(loan.instalmentAmount)}</TableCell>
                      <TableCell className="text-sm">{loan.startDate.split('T')[0]}</TableCell>
                      <TableCell className="w-56">
                        <AccountSelect
                          value={loan.glAccountId ?? ''}
                          onChange={(id) => { if (id && id !== loan.glAccountId) setLoanGl.mutate({ loanId: loan.id, glAccountId: id }); }}
                          accounts={assetAccountOptions}
                          placeholder="— set receivable —"
                        />
                        {!loan.glAccountId && <p className="text-[10px] text-amber-600 mt-0.5">Required to post the payroll GL</p>}
                      </TableCell>
                      <TableCell><Badge className={LOAN_STATUS_COLORS[loan.status] ?? ''}>{loan.status}</Badge></TableCell>
                      <TableCell>
                        {loan.status === 'ACTIVE' && Number(loan.balance) > 0 && (
                          <Button variant="ghost" size="sm" onClick={() => { setAdjustLoan(loan); setAdjustTerm(''); }}>Adjust</Button>
                        )}
                        {loan.status === 'ACTIVE' && (
                          <Button variant="ghost" size="sm" onClick={() => updateLoanStatus.mutate({ loanId: loan.id, status: 'SUSPENDED' })}>Suspend</Button>
                        )}
                        {loan.status === 'SUSPENDED' && (
                          <Button variant="ghost" size="sm" onClick={() => updateLoanStatus.mutate({ loanId: loan.id, status: 'ACTIVE' })}>Resume</Button>
                        )}
                        {loan.status === 'ACTIVE' && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => updateLoanStatus.mutate({ loanId: loan.id, status: 'CANCELLED' })}>Cancel</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Adjust (re-amortize) dialog */}
            <Dialog open={!!adjustLoan} onOpenChange={(v) => { if (!v) { setAdjustLoan(null); setAdjustTerm(''); } }}>
              <DialogContent className="max-w-md">
                <h2 className="text-lg font-semibold mb-1">Adjust loan — re-amortize</h2>
                {adjustLoan && (() => {
                  const bal = Number(adjustLoan.balance);
                  const rate = Number(adjustLoan.interestRate);
                  const newTerm = Number(adjustTerm) || 0;
                  const newEmi = newTerm > 0 ? emiOf(bal, rate, newTerm) : 0;
                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">Spread the <strong>remaining balance</strong> of GHS {fmt(bal)} over a new number of periods. {rate > 0 ? `Interest continues at ${(rate * 100).toFixed(1)}% p.a. on the reducing balance.` : 'Interest-free.'}</p>
                      <div>
                        <label className="text-xs font-medium">New remaining term (months) <span className="text-destructive">*</span></label>
                        <Input type="number" value={adjustTerm} onChange={(e) => setAdjustTerm(e.target.value)} placeholder="e.g. 2" />
                      </div>
                      {newTerm > 0 && (
                        <p className="text-sm font-semibold">New instalment (EMI): <span className="text-primary">GHS {fmt(newEmi)}</span> / month × {newTerm}</p>
                      )}
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => { setAdjustLoan(null); setAdjustTerm(''); }}>Cancel</Button>
                        <Button size="sm" disabled={newTerm <= 0 || reamortize.isPending} onClick={() => reamortize.mutate({ loanId: adjustLoan.id, instalmentAmount: newEmi, termMonths: newTerm })}>
                          {reamortize.isPending ? 'Saving…' : 'Apply new schedule'}
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </DialogContent>
            </Dialog>
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
  const active = (e.activatedReliefs ?? []).length;
  if (active > 0) parts.push(`✓ ${active} relief${active === 1 ? '' : 's'} active`);
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

// ─── Bulk employee import (CSV) ────────────────────────────────────────────────

type ColType = 'string' | 'number' | 'boolean';
interface ImportCol { header: string; field: string; type: ColType; required?: boolean; example: string; note?: string }

// Generated from the end-to-end employee onboarding form's data requirements.
const IMPORT_COLUMNS: ImportCol[] = [
  { header: 'employeeNumber', field: 'employeeNumber', type: 'string', example: '', note: 'blank = auto' },
  { header: 'firstName', field: 'firstName', type: 'string', required: true, example: 'Ama' },
  { header: 'lastName', field: 'lastName', type: 'string', required: true, example: 'Mensah' },
  { header: 'email', field: 'email', type: 'string', example: 'ama@company.com' },
  { header: 'phone', field: 'phone', type: 'string', example: '0244000000' },
  { header: 'nationalId', field: 'nationalId', type: 'string', example: 'GHA-000000000-0' },
  { header: 'tinNumber', field: 'tinNumber', type: 'string', example: 'P0001234567' },
  { header: 'ssnitNumber', field: 'ssnitNumber', type: 'string', example: 'C000000000000' },
  { header: 'gender', field: 'gender', type: 'string', example: 'FEMALE', note: 'MALE/FEMALE/OTHER' },
  { header: 'dateOfBirth', field: 'dateOfBirth', type: 'string', example: '1992-05-14', note: 'YYYY-MM-DD' },
  { header: 'employmentType', field: 'employmentType', type: 'string', example: 'FULL_TIME', note: 'FULL_TIME/PART_TIME/CONTRACT/CASUAL' },
  { header: 'payFrequency', field: 'payFrequency', type: 'string', example: 'MONTHLY', note: 'MONTHLY/FORTNIGHTLY/WEEKLY' },
  { header: 'startDate', field: 'startDate', type: 'string', required: true, example: '2026-01-01', note: 'YYYY-MM-DD' },
  { header: 'jobTitle', field: 'jobTitle', type: 'string', example: 'Accountant' },
  { header: 'department', field: 'department', type: 'string', example: 'Finance', note: 'department name' },
  { header: 'basicSalary', field: 'basicSalary', type: 'number', required: true, example: '5000' },
  { header: 'bankName', field: 'bankName', type: 'string', example: 'Ecobank' },
  { header: 'bankAccountNumber', field: 'bankAccountNumber', type: 'string', example: '1234567890' },
  { header: 'bankBranch', field: 'bankBranch', type: 'string', example: 'Accra Main' },
  { header: 'isResident', field: 'isResident', type: 'boolean', example: 'true' },
  { header: 'isMarried', field: 'isMarried', type: 'boolean', example: 'false' },
  { header: 'isDisabled', field: 'isDisabled', type: 'boolean', example: 'false' },
  { header: 'numberOfChildren', field: 'numberOfChildren', type: 'number', example: '0' },
  { header: 'agedDependants', field: 'agedDependants', type: 'number', example: '0' },
  { header: 'accommodationCode', field: 'accommodationCode', type: 'string', example: '', note: 'AF/AO/FO/SA' },
  { header: 'vehicleCode', field: 'vehicleCode', type: 'string', example: '', note: 'FVD/VF/V/F' },
  { header: 'isNsp', field: 'isNsp', type: 'boolean', example: 'false' },
  { header: 'tier3EmployeeRate', field: 'tier3EmployeeRate', type: 'number', example: '', note: 'decimal e.g. 0.05' },
  { header: 'tier3EmployerRate', field: 'tier3EmployerRate', type: 'number', example: '', note: 'decimal e.g. 0.05' },
  // Inline standing pay elements (optional convenience).
  { header: 'cashAllowance', field: 'cashAllowance', type: 'number', example: '', note: 'monthly GHS, taxable (full PAYE)' },
  { header: 'fixedMonthlyBonus', field: 'fixedMonthlyBonus', type: 'number', example: '', note: 'monthly GHS, taxed as bonus (5%/excess)' },
];

function parseCsvLine(line: string, delim = ','): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else { if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Pick the delimiter (comma / semicolon / tab) that the header splits into most
// columns — Excel in some locales saves CSVs with ';'.
function detectDelimiter(headerLine: string): string {
  let best = ',', bestN = 0;
  for (const d of [',', ';', '\t']) { const n = headerLine.split(d).length; if (n > bestN) { bestN = n; best = d; } }
  return best;
}

function downloadEmployeeTemplate() {
  const headers = IMPORT_COLUMNS.map((c) => c.header).join(',');
  const example = IMPORT_COLUMNS.map((c) => c.example).join(',');
  const blob = new Blob(['﻿' + headers + '\n' + example + '\n'], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'employee-import-template.csv'; a.click();
  URL.revokeObjectURL(a.href);
}

// Accept ISO (YYYY-MM-DD) and DD-MM-YYYY / DD/MM/YYYY (and 2-digit years), and
// normalise to ISO for the server. Returns the input unchanged if unrecognised.
function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) { const yy = parseInt(m[3], 10); const yyyy = yy <= 30 ? 2000 + yy : 1900 + yy; return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return s;
}

const DATE_FIELDS = new Set(['dateOfBirth', 'startDate', 'endDate']);

function parseEmployeeCsv(text: string): { rows: Record<string, unknown>[]; errors: string[] } {
  // Split on every line-ending variant (\r\n, \r-only/Mac, \n, or mixed) so rows
  // aren't collapsed into one. Strip a leading BOM from the first header.
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['File has no data rows.'] };
  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim).map((h) => h.replace(/^﻿/, '').replace(/^"|"$/g, '').trim());
  const colByHeader = new Map(IMPORT_COLUMNS.map((c) => [c.header.toLowerCase(), c]));
  if (!headers.some((h) => colByHeader.has(h.toLowerCase()))) {
    return { rows: [], errors: ['Header row not recognised. Re-download the template and keep the column headers unchanged.'] };
  }
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i], delim);
    const row: Record<string, unknown> = {};
    const rowErr: string[] = [];
    headers.forEach((h, idx) => {
      const col = colByHeader.get(h.toLowerCase());
      if (!col) return;
      const raw = (vals[idx] ?? '').trim();
      if (raw === '') return;
      if (DATE_FIELDS.has(col.field)) { const d = normalizeDate(raw); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) rowErr.push(`${col.header} must be YYYY-MM-DD or DD-MM-YYYY`); else row[col.field] = d; }
      else if (col.type === 'number') { const n = Number(raw); if (isNaN(n)) rowErr.push(`${col.header} not a number`); else row[col.field] = n; }
      else if (col.type === 'boolean') row[col.field] = /^(true|yes|y|1)$/i.test(raw);
      else row[col.field] = col.field === 'gender' || col.field === 'employmentType' || col.field === 'payFrequency' || col.field === 'accommodationCode' || col.field === 'vehicleCode' ? raw.toUpperCase() : raw;
    });
    // Skip blank/trailing rows entirely (e.g. Excel's empty comma rows).
    if (Object.keys(row).length === 0 && rowErr.length === 0) continue;
    for (const c of IMPORT_COLUMNS) if (c.required && (row[c.field] === undefined || row[c.field] === '')) rowErr.push(`${c.header} required`);
    if (rowErr.length) errors.push(`Row ${i + 1}: ${rowErr.join(', ')}`);
    else rows.push(row);
  }
  return { rows, errors };
}

// ─── Per-run overtime & bonus import ───────────────────────────────────────────
// A "pay-run input" file: variable overtime and one-off bonus for this run only.
// overtimeMode = AMOUNT (flat GHS, → overtimePay) or HOURS (→ overtimeHours, valued
// by the employee's configured hourly rate × multiplier).

const OT_BONUS_HEADERS = ['employeeNumber', 'overtimeMode', 'overtimeValue', 'bonus'];

// Variable pay elements become extra columns (one per component code) appended after
// the fixed overtime/bonus columns. The template is generated from the live list, so
// a newly-configured variable element automatically shows up here.
type VarComp = { id: string; code: string };

function downloadOtBonusTemplate(emps: { employeeNumber: string; overtimeType: OvertimeType }[], variableComps: VarComp[]) {
  const header = [...OT_BONUS_HEADERS, ...variableComps.map((c) => c.code)].join(',');
  const extraZeros = variableComps.map(() => '0').join(variableComps.length ? ',' : '');
  // Pre-fill one row per active employee with the right mode so the user just edits values.
  const rows = emps.map((e) => {
    const base = `${e.employeeNumber},${e.overtimeType === 'RATE_BASED' ? 'HOURS' : 'AMOUNT'},0,0`;
    return variableComps.length ? `${base},${extraZeros}` : base;
  });
  const blob = new Blob(['﻿' + header + '\n' + rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'payrun-input.csv'; a.click();
  URL.revokeObjectURL(a.href);
}

interface OtBonusRow { employeeNumber: string; overtimeMode: 'AMOUNT' | 'HOURS'; overtimeValue: number; bonus: number; components: { componentId: string; amount: number }[] }

function parseOtBonusCsv(text: string, variableComps: VarComp[]): { rows: OtBonusRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['File has no data rows.'] };
  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim).map((h) => h.replace(/^﻿/, '').toLowerCase());
  const iNum = headers.indexOf('employeenumber');
  const iMode = headers.indexOf('overtimemode');
  const iVal = headers.indexOf('overtimevalue');
  const iBonus = headers.indexOf('bonus');
  if (iNum < 0) return { rows: [], errors: ['Header row not recognised. Keep the headers: employeeNumber, overtimeMode, overtimeValue, bonus.'] };
  // Map variable-component columns by header code.
  const compCols = variableComps
    .map((c) => ({ componentId: c.id, idx: headers.indexOf(c.code.toLowerCase()) }))
    .filter((c) => c.idx >= 0);
  const rows: OtBonusRow[] = []; const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const v = parseCsvLine(lines[i], delim);
    const num = (v[iNum] ?? '').trim();
    if (!num) continue;
    const mode = (iMode >= 0 ? v[iMode] ?? '' : '').trim().toUpperCase();
    const valRaw = (iVal >= 0 ? v[iVal] ?? '' : '').trim();
    const bonusRaw = (iBonus >= 0 ? v[iBonus] ?? '' : '').trim();
    const overtimeValue = valRaw === '' ? 0 : Number(valRaw);
    const bonus = bonusRaw === '' ? 0 : Number(bonusRaw);
    if (valRaw && isNaN(overtimeValue)) { errors.push(`Row ${i + 1}: overtimeValue not a number`); continue; }
    if (bonusRaw && isNaN(bonus)) { errors.push(`Row ${i + 1}: bonus not a number`); continue; }
    if (mode && mode !== 'AMOUNT' && mode !== 'HOURS') { errors.push(`Row ${i + 1}: overtimeMode must be AMOUNT or HOURS`); continue; }
    const components: { componentId: string; amount: number }[] = [];
    let compErr = false;
    for (const c of compCols) {
      const raw = (v[c.idx] ?? '').trim();
      if (raw === '') continue;
      const amt = Number(raw);
      if (isNaN(amt)) { errors.push(`Row ${i + 1}: ${headers[c.idx]} not a number`); compErr = true; break; }
      if (amt > 0) components.push({ componentId: c.componentId, amount: amt });
    }
    if (compErr) continue;
    if (overtimeValue <= 0 && bonus <= 0 && components.length === 0) continue; // nothing to apply
    rows.push({ employeeNumber: num, overtimeMode: mode === 'HOURS' ? 'HOURS' : 'AMOUNT', overtimeValue, bonus, components });
  }
  return { rows, errors };
}

// ─── Bulk pay-element (component) import ───────────────────────────────────────
const PAY_ELEMENT_HEADERS = ['employeeNumber', 'componentCode', 'amount', 'rate', 'effectiveFrom'];

function downloadPayElementsTemplate(codes: string[]) {
  const header = PAY_ELEMENT_HEADERS.join(',');
  const code = codes[0] ?? 'TRANSPORT';
  const example = `IEP-0002,${code},400,,${new Date().toISOString().split('T')[0]}`;
  const blob = new Blob(['﻿' + header + '\n' + example + '\n'], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'pay-elements-import.csv'; a.click();
  URL.revokeObjectURL(a.href);
}

function parsePayElementsCsv(text: string): { rows: Record<string, unknown>[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['File has no data rows.'] };
  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim).map((h) => h.replace(/^﻿/, '').toLowerCase());
  const iNum = headers.indexOf('employeenumber');
  const iCode = headers.indexOf('componentcode');
  const iAmt = headers.indexOf('amount');
  const iRate = headers.indexOf('rate');
  const iEff = headers.indexOf('effectivefrom');
  if (iNum < 0 || iCode < 0) return { rows: [], errors: ['Header row not recognised. Keep the headers: employeeNumber, componentCode, amount, rate, effectiveFrom.'] };
  const rows: Record<string, unknown>[] = []; const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const v = parseCsvLine(lines[i], delim);
    const employeeNumber = (v[iNum] ?? '').trim();
    const componentCode = (v[iCode] ?? '').trim();
    if (!employeeNumber && !componentCode) continue;
    const rowErr: string[] = [];
    if (!employeeNumber) rowErr.push('employeeNumber required');
    if (!componentCode) rowErr.push('componentCode required');
    const amtRaw = (iAmt >= 0 ? v[iAmt] ?? '' : '').trim();
    const rateRaw = (iRate >= 0 ? v[iRate] ?? '' : '').trim();
    const effRaw = (iEff >= 0 ? v[iEff] ?? '' : '').trim();
    const eff = effRaw ? normalizeDate(effRaw) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eff)) rowErr.push('effectiveFrom must be YYYY-MM-DD or DD-MM-YYYY');
    if (amtRaw && isNaN(Number(amtRaw))) rowErr.push('amount not a number');
    if (rateRaw && isNaN(Number(rateRaw))) rowErr.push('rate not a number');
    const hasAmt = amtRaw !== '' && Number(amtRaw) > 0;
    const hasRate = rateRaw !== '' && Number(rateRaw) > 0;
    if (hasAmt === hasRate) rowErr.push('provide either amount or rate (exactly one)');
    if (rowErr.length) { errors.push(`Row ${i + 1}: ${rowErr.join(', ')}`); continue; }
    rows.push({ employeeNumber, componentCode, amount: hasAmt ? Number(amtRaw) : undefined, rate: hasRate ? Number(rateRaw) : undefined, effectiveFrom: eff });
  }
  return { rows, errors };
}

function BulkImportPayElementsDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  const { data: components = [] } = useQuery({
    queryKey: ['salary-components', organisationId, 'active'],
    queryFn:  () => payrollSvc.listSalaryComponents(organisationId, true),
    enabled:  open,
  });

  const reset = () => { setRows([]); setParseErrors([]); setFileName(''); previewMut.reset(); mutation.reset(); };
  const onFile = (file: File) => {
    setFileName(file.name);
    previewMut.reset(); mutation.reset();
    const reader = new FileReader();
    reader.onload = (e) => { const { rows: r, errors } = parsePayElementsCsv(e.target?.result as string); setRows(r); setParseErrors(errors); };
    reader.readAsText(file);
  };

  // Dry run: validate employee numbers and component codes against the DB without writing.
  const previewMut = useMutation({ mutationFn: () => payrollSvc.bulkAssignComponents(organisationId, rows, true) });
  const mutation = useMutation({
    mutationFn: () => payrollSvc.bulkAssignComponents(organisationId, rows, false),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['payroll-employees', organisationId] });
      if (res.errors.length === 0) { setOpen(false); reset(); }
    },
  });
  const preview = previewMut.data;
  const result = mutation.data;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Upload size={14} className="mr-1" /> Import pay elements</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-1">Bulk import pay elements</h2>
        <p className="text-xs text-muted-foreground mb-3">Assign recurring components (allowances, recurring deductions, etc.) to employees by number + component code. One row per assignment — an employee can have many. Use either an amount or a rate (rate is a fraction of basic, e.g. 0.15).</p>
        <div className="space-y-3">
          <Button size="sm" variant="outline" onClick={() => downloadPayElementsTemplate(components.map((c) => c.code))}><Download size={14} className="mr-1" /> Download CSV template</Button>
          {components.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Available codes: {components.map((c) => c.code).join(', ')}</p>
          )}
          <input type="file" accept=".csv" className="text-xs block w-full border rounded p-2 cursor-pointer"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

          {fileName && (
            <p className="text-xs">{rows.length + parseErrors.length} rows · <span className="text-green-600 font-medium">{rows.length} ready</span>{parseErrors.length > 0 && <> · <span className="text-destructive font-medium">{parseErrors.length} with errors</span></>}</p>
          )}
          {parseErrors.length > 0 && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2 max-h-28 overflow-y-auto space-y-0.5">
              {parseErrors.slice(0, 50).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {/* Dry-run preview */}
          {preview && !result && (
            <div className="text-xs rounded border bg-muted/30 p-2 space-y-1.5">
              <p className="font-medium">
                <span className="text-green-600">{preview.wouldCreate} will be assigned</span>
                {preview.errors.length > 0 && <> · <span className="text-destructive">{preview.errors.length} row{preview.errors.length > 1 ? 's' : ''} with errors (skipped)</span></>}
              </p>
              {preview.errors.length > 0 && (
                <div className="text-destructive max-h-24 overflow-y-auto space-y-0.5">
                  {preview.errors.slice(0, 50).map((e, i) => <p key={i}>Row {e.row}: {e.message}</p>)}
                </div>
              )}
              {preview.preview.length > 0 && (
                <div className="max-h-40 overflow-y-auto border rounded">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0"><tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Emp #</th><th className="px-2 py-1 font-medium">Component</th>
                      <th className="px-2 py-1 font-medium text-right">Amount</th><th className="px-2 py-1 font-medium text-right">Rate</th>
                      <th className="px-2 py-1 font-medium">From</th>
                    </tr></thead>
                    <tbody>
                      {preview.preview.slice(0, 200).map((p) => (
                        <tr key={p.row} className="border-t">
                          <td className="px-2 py-1 font-mono">{p.employeeNumber}</td><td className="px-2 py-1 font-mono">{p.componentCode}</td>
                          <td className="px-2 py-1 text-right">{p.amount != null ? fmt(p.amount) : '—'}</td>
                          <td className="px-2 py-1 text-right">{p.rate != null ? `${(p.rate * 100).toFixed(1)}%` : '—'}</td>
                          <td className="px-2 py-1">{p.effectiveFrom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {mutation.isError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
              Import failed: {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'server error — please try again'}
            </p>
          )}
          {result && (
            <div className="text-xs rounded p-2 bg-muted/40 space-y-1">
              <p className="text-green-600 font-medium">Assigned {result.created} of {result.total}.</p>
              {result.errors.length > 0 && (
                <div className="text-destructive max-h-28 overflow-y-auto space-y-0.5">
                  {result.errors.map((e, i) => <p key={i}>Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Close</Button></DialogClose>
            <Button size="sm" variant="outline" disabled={rows.length === 0 || previewMut.isPending} onClick={() => previewMut.mutate()}>
              {previewMut.isPending ? 'Validating…' : 'Preview & validate'}
            </Button>
            <Button size="sm" disabled={!preview || preview.wouldCreate === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Importing…' : `Import ${preview?.wouldCreate ?? rows.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkImportEmployeesDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  const reset = () => { setRows([]); setParseErrors([]); setFileName(''); previewMut.reset(); mutation.reset(); };

  const onFile = (file: File) => {
    setFileName(file.name);
    previewMut.reset(); mutation.reset();
    const reader = new FileReader();
    reader.onload = (e) => { const { rows: r, errors } = parseEmployeeCsv(e.target?.result as string); setRows(r); setParseErrors(errors); };
    reader.readAsText(file);
  };

  // Dry run: validate against the DB (departments, duplicate numbers) without writing.
  const previewMut = useMutation({ mutationFn: () => payrollSvc.bulkCreateEmployees(organisationId, rows, true) });
  const mutation = useMutation({
    mutationFn: () => payrollSvc.bulkCreateEmployees(organisationId, rows, false),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['payroll-employees', organisationId] });
      if (res.errors.length === 0) { setOpen(false); reset(); }
    },
  });
  const preview = previewMut.data;
  const result = mutation.data;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Upload size={14} className="mr-1" /> Bulk import</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-1">Bulk import employees</h2>
        <p className="text-xs text-muted-foreground mb-3">Download the template, fill a row per employee, then upload. Department is matched by name; blank employee numbers auto-generate. Optional <strong>cashAllowance</strong> (taxable, full PAYE) and <strong>fixedMonthlyBonus</strong> (taxed as a bonus — 5%/excess) columns create standing pay elements. For multiple/other components per employee, use “Import pay elements”.</p>
        <div className="space-y-3">
          <Button size="sm" variant="outline" onClick={downloadEmployeeTemplate}><Download size={14} className="mr-1" /> Download CSV template</Button>
          <input type="file" accept=".csv" className="text-xs block w-full border rounded p-2 cursor-pointer"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

          {fileName && (
            <p className="text-xs">{rows.length + parseErrors.length} rows · <span className="text-green-600 font-medium">{rows.length} ready</span>{parseErrors.length > 0 && <> · <span className="text-destructive font-medium">{parseErrors.length} with errors</span></>}</p>
          )}
          {parseErrors.length > 0 && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2 max-h-28 overflow-y-auto space-y-0.5">
              {parseErrors.slice(0, 50).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {/* Dry-run preview */}
          {preview && !result && (
            <div className="text-xs rounded border bg-muted/30 p-2 space-y-1.5">
              <p className="font-medium">
                <span className="text-green-600">{preview.wouldCreate} will be created</span>
                {preview.errors.length > 0 && <> · <span className="text-destructive">{preview.errors.length} row{preview.errors.length > 1 ? 's' : ''} with errors (skipped)</span></>}
              </p>
              {preview.errors.length > 0 && (
                <div className="text-destructive max-h-24 overflow-y-auto space-y-0.5">
                  {preview.errors.slice(0, 50).map((e, i) => <p key={i}>Row {e.row} ({e.employee}): {e.message}</p>)}
                </div>
              )}
              {preview.preview.length > 0 && (
                <div className="max-h-40 overflow-y-auto border rounded">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0"><tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Emp #</th><th className="px-2 py-1 font-medium">Name</th>
                      <th className="px-2 py-1 font-medium">Dept</th><th className="px-2 py-1 font-medium text-right">Basic</th>
                      <th className="px-2 py-1 font-medium text-right">Allow.</th><th className="px-2 py-1 font-medium text-right">Bonus</th>
                    </tr></thead>
                    <tbody>
                      {preview.preview.slice(0, 200).map((p) => (
                        <tr key={p.row} className="border-t">
                          <td className="px-2 py-1 font-mono">{p.employeeNumber}</td><td className="px-2 py-1">{p.name}</td>
                          <td className="px-2 py-1">{p.department ?? '—'}</td><td className="px-2 py-1 text-right">{fmt(p.basicSalary)}</td>
                          <td className="px-2 py-1 text-right">{p.cashAllowance ? fmt(p.cashAllowance) : '—'}</td>
                          <td className="px-2 py-1 text-right">{p.fixedMonthlyBonus ? fmt(p.fixedMonthlyBonus) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {mutation.isError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
              Import failed: {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'server error — please try again'}
            </p>
          )}
          {result && (
            <div className="text-xs rounded p-2 bg-muted/40 space-y-1">
              <p className="text-green-600 font-medium">Imported {result.created} of {result.total}.</p>
              {result.errors.length > 0 && (
                <div className="text-destructive max-h-28 overflow-y-auto space-y-0.5">
                  {result.errors.map((e, i) => <p key={i}>Row {e.row} ({e.employee}): {e.message}</p>)}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Close</Button></DialogClose>
            <Button size="sm" variant="outline" disabled={rows.length === 0 || previewMut.isPending} onClick={() => previewMut.mutate()}>
              {previewMut.isPending ? 'Validating…' : 'Preview & validate'}
            </Button>
            <Button size="sm" disabled={!preview || preview.wouldCreate === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Importing…' : `Import ${preview?.wouldCreate ?? rows.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RELIEF_TYPES: { code: string; label: string; eligible: (e: Employee) => boolean; note: string }[] = [
  { code: 'MARRIAGE', label: 'Marriage / Responsibility relief', eligible: (e) => e.isMarried, note: 'requires Married' },
  { code: 'CHILD_EDUCATION', label: 'Child Education relief', eligible: (e) => e.numberOfChildren > 0, note: 'requires children' },
  { code: 'OLD_AGE', label: 'Old Age relief (60+)', eligible: (e) => { const a = ageFromDob(e.dateOfBirth); return a !== null && a >= 60; }, note: 'requires age ≥ 60' },
  { code: 'AGED_DEPENDANT', label: 'Aged Dependant relief', eligible: (e) => e.agedDependants > 0, note: 'requires aged dependants' },
  { code: 'DISABILITY', label: 'Disability relief (25% of AI)', eligible: (e) => e.isDisabled, note: 'requires Disabled' },
];

function ActivateReliefsDialog({ organisationId, employee }: { organisationId: string; employee: Employee }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(employee.activatedReliefs ?? []));

  const save = useMutation({
    mutationFn: () => payrollSvc.updateEmployee(organisationId, employee.id, { activatedReliefs: [...selected] as Employee['activatedReliefs'] }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payroll-employees', organisationId] }); setOpen(false); },
  });

  const toggle = (code: string) => setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setSelected(new Set(employee.activatedReliefs ?? [])); }}>
      <DialogTrigger asChild>
        <button className="text-xs text-primary hover:underline" title="Activate GRA-granted reliefs">Reliefs</button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <h2 className="text-lg font-semibold mb-1">Activate reliefs — {employee.firstName} {employee.lastName}</h2>
        <p className="text-xs text-muted-foreground mb-3">Tick only the reliefs GRA has actually granted this employee. A relief affects PAYE only when activated here, even if the employee qualifies.</p>
        <div className="space-y-2">
          {RELIEF_TYPES.map((r) => {
            const eligible = r.eligible(employee);
            return (
              <label key={r.code} className={`flex items-center gap-2 text-sm p-2 rounded border ${eligible ? 'cursor-pointer' : 'opacity-50'}`}>
                <input type="checkbox" disabled={!eligible} checked={selected.has(r.code)} onChange={() => toggle(r.code)} />
                <span className="flex-1">{r.label}</span>
                {!eligible && <span className="text-[10px] text-muted-foreground">{r.note}</span>}
              </label>
            );
          })}
        </div>
        {save.isError && <p className="text-xs text-destructive mt-2">Could not save. Please try again.</p>}
        <div className="flex justify-end gap-2 pt-3">
          <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save activation'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesTab({ organisationId }: { organisationId: string }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['payroll-employees', organisationId],
    queryFn:  () => payrollSvc.listEmployees(organisationId),
  });

  function openCreate() { navigate('/payroll/employees/new'); }
  function openEdit(e: Employee) { navigate(`/payroll/employees/${e.id}/edit`); }

  if (isLoading) return <Skeleton className="h-40" />;

  const q = search.trim().toLowerCase();
  const filtered = employees.filter((e) =>
    (!statusFilter || e.status === statusFilter) &&
    (!q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)),
  );
  const activeCount = employees.filter((e) => e.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or number…"
            className="h-8 text-xs w-56"
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs w-40">
            <option value="">All ({employees.length})</option>
            <option value="ACTIVE">Active ({activeCount})</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="RESIGNED">Resigned</option>
            <option value="DISMISSED">Dismissed</option>
          </Select>
          <span className="text-xs text-muted-foreground">Payroll runs only for <strong>Active</strong> employees.</span>
        </div>
        <div className="flex gap-2">
          <BulkImportEmployeesDialog organisationId={organisationId} />
          <BulkImportPayElementsDialog organisationId={organisationId} />
          <Button size="sm" onClick={openCreate}><Users className="w-4 h-4 mr-1" />Add Employee</Button>
        </div>
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
                    <div className="flex items-center gap-2 justify-end">
                      <ActivateReliefsDialog organisationId={organisationId} employee={e} />
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
  const { data: allComponents = [] } = useQuery({ queryKey: ['salary-components', organisationId, 'active'], queryFn: () => payrollSvc.listSalaryComponents(organisationId, true) });

  const allAccounts = accountsData?.accounts ?? [];
  const liabilityOptions: AccountOption[] = toAccountOptions(allAccounts.filter((a) => a.class === 'LIABILITY'));
  const openPeriods = periodsData.filter((p) => p.status === 'OPEN');

  // Variable pay elements → extra columns in the per-run import (overtime/bonus stay separate).
  const VARIABLE_TYPES = new Set(['ALLOWANCE', 'BONUS', 'COMMISSION', 'OTHER_EARNING', 'EMPLOYEE_DEDUCTION']);
  const variableComps: VarComp[] = allComponents
    .filter((c) => c.isVariable && VARIABLE_TYPES.has(c.type))
    .map((c) => ({ id: c.id, code: c.code }));

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

  // Variable pay-element amounts from the import: empId → componentId → amount.
  const [compOverrides, setCompOverrides] = useState<Record<string, Record<string, number>>>({});

  const [runError, setRunError] = useState<string | null>(null);
  const [otImportMsg, setOtImportMsg] = useState<string[] | null>(null);
  const [empSearch, setEmpSearch] = useState('');

  function handleOtBonusFile(file: File) {
    setOtImportMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, errors } = parseOtBonusCsv(String(reader.result ?? ''), variableComps);
      const byNumber = new Map(employees.map((e) => [e.employeeNumber.toLowerCase(), e]));
      let matched = 0; const unmatched: string[] = []; const warnings: string[] = []; let elementCount = 0;
      const next: Record<string, Override> = { ...overrides };
      const nextComp: Record<string, Record<string, number>> = { ...compOverrides };
      for (const r of rows) {
        const emp = byNumber.get(r.employeeNumber.toLowerCase());
        if (!emp) { unmatched.push(r.employeeNumber); continue; }
        const cur: Override = { ...(next[emp.id] ?? { overtimePay: '', overtimeHours: '', bonuses: '' }) };
        const isRateBased = emp.overtimeType === 'RATE_BASED';
        if (r.overtimeValue > 0) {
          if (r.overtimeMode === 'HOURS') {
            if (!isRateBased) warnings.push(`${r.employeeNumber}: HOURS given but employee isn't rate-based — overtime ignored`);
            cur.overtimeHours = String(r.overtimeValue);
          } else {
            if (isRateBased) warnings.push(`${r.employeeNumber}: AMOUNT given but employee is rate-based — overtime ignored`);
            cur.overtimePay = String(r.overtimeValue);
          }
        }
        if (r.bonus > 0) cur.bonuses = String(r.bonus);
        next[emp.id] = cur;
        if (r.components.length > 0) {
          const map = { ...(nextComp[emp.id] ?? {}) };
          for (const c of r.components) { map[c.componentId] = c.amount; elementCount++; }
          nextComp[emp.id] = map;
        }
        matched++;
      }
      setOverrides(next);
      setCompOverrides(nextComp);
      const summary = [`${matched} matched`];
      if (elementCount) summary.push(`${elementCount} variable element value${elementCount > 1 ? 's' : ''}`);
      if (unmatched.length) summary.push(`${unmatched.length} unmatched`);
      if (warnings.length) summary.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`);
      if (errors.length) summary.push(`${errors.length} error${errors.length > 1 ? 's' : ''}`);
      setOtImportMsg([
        summary.join(' · '),
        ...unmatched.slice(0, 6).map((u) => `Unmatched employee #: ${u}`),
        ...warnings.slice(0, 6),
        ...errors.slice(0, 6),
      ]);
    };
    reader.readAsText(file);
  }

  const create = useMutation({
    mutationFn: () => {
      const builtOverrides = employees
        .map((e) => {
          const ov = overrides[e.id];
          const isRateBased = e.overtimeType === 'RATE_BASED';
          const components = Object.entries(compOverrides[e.id] ?? {})
            .filter(([, amt]) => amt > 0)
            .map(([componentId, amount]) => ({ componentId, amount }));
          return {
            employeeId:    e.id,
            overtimePay:   (!isRateBased && ov?.overtimePay)   ? Number(ov.overtimePay)   : undefined,
            overtimeHours: (isRateBased  && ov?.overtimeHours) ? Number(ov.overtimeHours) : undefined,
            bonuses:       ov?.bonuses ? Number(ov.bonuses) : undefined,
            components:    components.length > 0 ? components : undefined,
          };
        })
        .filter((o) => o.overtimePay !== undefined || o.overtimeHours !== undefined || o.bonuses !== undefined || o.components !== undefined);

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
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div>
              <p className="text-xs text-gray-500 font-semibold">Per-Employee Adjustments (optional)</p>
              {variableComps.length > 0 && (
                <p className="text-[10px] text-muted-foreground">Variable element columns: {variableComps.map((c) => c.code).join(', ')}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => downloadOtBonusTemplate(employees, variableComps)}>
                <Download className="w-3.5 h-3.5 mr-1" />Template
              </Button>
              <label className="inline-flex items-center h-7 px-2.5 text-xs rounded-md border cursor-pointer hover:bg-accent">
                <Upload className="w-3.5 h-3.5 mr-1" />Import pay-run input
                <input type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOtBonusFile(f); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          {otImportMsg && (
            <div className="mb-2 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded px-2.5 py-2 space-y-0.5">
              {otImportMsg.map((line, i) => <p key={i} className={i === 0 ? 'font-semibold' : ''}>{line}</p>)}
            </div>
          )}
          <Input
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            placeholder="Search employee by name or number…"
            className="h-8 text-xs mb-2"
          />
          <div className="border rounded-md overflow-hidden text-sm">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Employee</span>
              <span className="w-32 text-center">Overtime</span>
              <span className="w-28 text-center">Bonus (GHS)</span>
              <span className="w-16 text-center">OT Type</span>
            </div>
            {employees.filter((e) => {
              const s = empSearch.trim().toLowerCase();
              return !s || `${e.firstName} ${e.lastName}`.toLowerCase().includes(s) || e.employeeNumber.toLowerCase().includes(s);
            }).map((e) => {
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
  const navigate = useNavigate();
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [slipSearch, setSlipSearch] = useState('');

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

  const allPayslips = detail?.payslips ?? [];
  const slipQuery = slipSearch.trim().toLowerCase();
  const payslips = slipQuery
    ? allPayslips.filter((s) => {
        const name = s.employee ? `${s.employee.firstName} ${s.employee.lastName}`.toLowerCase() : '';
        return name.includes(slipQuery) || (s.employee?.employeeNumber ?? '').toLowerCase().includes(slipQuery);
      })
    : allPayslips;

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
        {run.status === 'SUBMITTED' && detail && !detail.approval && (
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

      {detail?.approval && (run.status === 'SUBMITTED' || detail.approval.status === 'PENDING') && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-800">
              Awaiting multi-level approval — Level {detail.approval.currentLevel} of {detail.approval.levels.length}
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/approvals')}>Go to Approvals</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detail.approval.levels.map((lvl) => {
              const done = detail.approval!.decisions.some((d) => d.levelNumber === lvl.levelNumber && d.decision === 'APPROVED');
              const current = lvl.levelNumber === detail.approval!.currentLevel && detail.approval!.status === 'PENDING';
              return (
                <span key={lvl.levelNumber}
                  className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border',
                    done ? 'bg-green-100 text-green-800 border-green-200'
                    : current ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-muted text-muted-foreground border-border')}>
                  {done && <Check className="w-3 h-3" />}L{lvl.levelNumber} {lvl.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {workflowError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{workflowError}</p>
      )}

      {allPayslips.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-medium text-sm text-gray-700">Employee Payslips ({allPayslips.length})</h3>
            <Input
              value={slipSearch}
              onChange={(e) => setSlipSearch(e.target.value)}
              placeholder="Search name or number…"
              className="h-8 text-xs w-56"
            />
          </div>
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
                {payslips.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-6">No payslip matches “{slipSearch}”.</TableCell></TableRow>
                )}
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
