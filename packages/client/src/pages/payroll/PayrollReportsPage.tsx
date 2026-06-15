import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as payrollSvc from '@/services/payroll.service';
import type { ReportRow, ReportParams } from '@/services/payroll.service';
import { listDepartments } from '@/services/budgets.service';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const fmt = (v: number) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Column { key: string; label: string; money?: boolean }

type Scope = 'run' | 'year' | 'either';

interface ReportDef {
  key: string;
  label: string;
  scope: Scope;
  columns: Column[];
  fetch: (orgId: string, p: ReportParams) => Promise<payrollSvc.PayrollReport>;
}

const REGISTER_COLS: Column[] = [
  { key: 'employeeNumber', label: 'Emp No' },
  { key: 'name', label: 'Name' },
  { key: 'department', label: 'Dept' },
  { key: 'basic', label: 'Basic', money: true },
  { key: 'allowances', label: 'Allowances', money: true },
  { key: 'overtime', label: 'Overtime', money: true },
  { key: 'bonus', label: 'Bonus', money: true },
  { key: 'gross', label: 'Gross', money: true },
  { key: 'paye', label: 'Total Tax', money: true },
  { key: 'ssnitEmployee', label: 'SSNIT (EE)', money: true },
  { key: 'otherDeductions', label: 'Other Ded.', money: true },
  { key: 'totalDeductions', label: 'Total Ded.', money: true },
  { key: 'netPay', label: 'Net Pay', money: true },
  { key: 'employerCost', label: 'Employer Cost', money: true },
];

const STATUTORY_COLS: Column[] = [
  { key: 'employeeNumber', label: 'Emp No' },
  { key: 'name', label: 'Name' },
  { key: 'tin', label: 'TIN' },
  { key: 'ssnitNumber', label: 'SSNIT No' },
  { key: 'gross', label: 'Gross', money: true },
  { key: 'payeBase', label: 'PAYE', money: true },
  { key: 'overtimeTax', label: 'Overtime Tax', money: true },
  { key: 'bonusTax', label: 'Bonus Tax', money: true },
  { key: 'totalTax', label: 'Total Tax (GRA)', money: true },
  { key: 'ssnitEmployee', label: 'SSNIT EE 5.5%', money: true },
  { key: 'ssnitEmployer', label: 'SSNIT ER 13%', money: true },
  { key: 'tier2', label: 'Tier 2', money: true },
  { key: 'tier3', label: 'Tier 3', money: true },
  { key: 'totalSsnit', label: 'Total SSNIT', money: true },
];

const BANK_COLS: Column[] = [
  { key: 'employeeNumber', label: 'Emp No' },
  { key: 'name', label: 'Name' },
  { key: 'bankName', label: 'Bank' },
  { key: 'bankBranch', label: 'Branch' },
  { key: 'accountNumber', label: 'Account No' },
  { key: 'netPay', label: 'Net Pay', money: true },
];

const DEPARTMENT_COLS: Column[] = [
  { key: 'department', label: 'Department' },
  { key: 'headcount', label: 'Headcount' },
  { key: 'gross', label: 'Gross', money: true },
  { key: 'deductions', label: 'Deductions', money: true },
  { key: 'netPay', label: 'Net Pay', money: true },
  { key: 'employerContrib', label: 'Employer Contrib.', money: true },
  { key: 'totalCost', label: 'Total Cost (CTC)', money: true },
];

const YTD_COLS: Column[] = [
  { key: 'employeeNumber', label: 'Emp No' },
  { key: 'name', label: 'Name' },
  { key: 'department', label: 'Dept' },
  { key: 'runs', label: 'Runs' },
  { key: 'gross', label: 'Gross YTD', money: true },
  { key: 'paye', label: 'PAYE YTD', money: true },
  { key: 'ssnit', label: 'SSNIT YTD', money: true },
  { key: 'otherDeductions', label: 'Other Ded. YTD', money: true },
  { key: 'netPay', label: 'Net Pay YTD', money: true },
  { key: 'employerCost', label: 'Employer Cost YTD', money: true },
];

const LOAN_COLS: Column[] = [
  { key: 'employeeNumber', label: 'Emp No' },
  { key: 'name', label: 'Name' },
  { key: 'department', label: 'Dept' },
  { key: 'description', label: 'Loan' },
  { key: 'startDate', label: 'Start' },
  { key: 'principal', label: 'Principal', money: true },
  { key: 'repaid', label: 'Repaid', money: true },
  { key: 'balance', label: 'Balance', money: true },
  { key: 'instalment', label: 'Instalment', money: true },
  { key: 'status', label: 'Status' },
];

const REPORTS: ReportDef[] = [
  { key: 'register', label: 'Payroll Register', scope: 'either', columns: REGISTER_COLS, fetch: payrollSvc.reportRegister },
  { key: 'statutory', label: 'Statutory (PAYE & SSNIT)', scope: 'either', columns: STATUTORY_COLS, fetch: payrollSvc.reportStatutory },
  { key: 'gl', label: 'GL / Journal Summary', scope: 'run', columns: [], fetch: payrollSvc.reportRegister },
  { key: 'bank', label: 'Bank Disbursement', scope: 'run', columns: BANK_COLS, fetch: payrollSvc.reportBank },
  { key: 'department', label: 'Department Cost Analysis', scope: 'either', columns: DEPARTMENT_COLS, fetch: payrollSvc.reportDepartment },
  { key: 'employee-ytd', label: 'Employee Earnings (YTD)', scope: 'year', columns: YTD_COLS, fetch: payrollSvc.reportEmployeeYtd },
  { key: 'loans', label: 'Loan Report', scope: 'year', columns: LOAN_COLS, fetch: payrollSvc.reportLoans },
];

// ── CSV + print helpers (generic) ──────────────────────────────────────────────

function exportCsv(filename: string, columns: Column[], rows: ReportRow[], totals: Record<string, number | boolean>) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => (c.money ? fmt(Number(r[c.key] ?? 0)) : r[c.key] ?? '')));
  const totalRow = columns.map((c, i) => (i === 0 ? 'TOTAL' : c.money && totals[c.key] != null ? fmt(Number(totals[c.key])) : ''));
  const csv = [header, ...body, totalRow].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function printReport(title: string, subtitle: string, columns: Column[], rows: ReportRow[], totals: Record<string, number | boolean>) {
  const cell = (v: unknown, money?: boolean, align = false) =>
    `<td style="padding:4px 8px;border-bottom:1px solid #eee;${align ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}">${money ? fmt(Number(v ?? 0)) : String(v ?? '')}</td>`;
  const head = columns.map((c) => `<th style="padding:6px 8px;text-align:${c.money ? 'right' : 'left'};border-bottom:2px solid #333;">${c.label}</th>`).join('');
  const body = rows.map((r) => `<tr>${columns.map((c) => cell(r[c.key], c.money, c.money)).join('')}</tr>`).join('');
  const totalRow = `<tr style="font-weight:bold;background:#f5f5f5;">${columns.map((c, i) =>
    i === 0 ? `<td style="padding:6px 8px;">TOTAL</td>` : c.money && totals[c.key] != null ? `<td style="padding:6px 8px;text-align:right;">${fmt(Number(totals[c.key]))}</td>` : '<td></td>').join('')}</tr>`;
  const html = `<!doctype html><html><head><title>${title}</title></head>
    <body style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#111;padding:24px;">
      <h2 style="margin:0;">${title}</h2>
      <p style="color:#666;margin:4px 0 16px;">${subtitle}</p>
      <table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>
      <p style="color:#999;margin-top:16px;font-size:10px;">Generated ${new Date().toLocaleString()}</p>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
}

// ── Page ────────────────────────────────────────────────────────────────────

export function PayrollReportsPage() {
  const orgId = useAuthStore((s) => s.activeOrganisationId) ?? '';
  const [reportKey, setReportKey] = useState('register');
  const def = REPORTS.find((r) => r.key === reportKey)!;

  const thisYear = new Date().getFullYear();
  const [scopeMode, setScopeMode] = useState<'run' | 'year'>('run');
  const [runId, setRunId] = useState('');
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(0); // 0 = whole year
  const [departmentId, setDepartmentId] = useState('');

  const effectiveScope: 'run' | 'year' = def.scope === 'either' ? scopeMode : def.scope;
  const isGl = def.key === 'gl';

  const { data: runsData } = useQuery({
    queryKey: ['payroll-runs', orgId],
    queryFn: () => payrollSvc.listPayrollRuns(orgId, { pageSize: 200 }),
    enabled: !!orgId,
  });
  const runs = runsData?.runs ?? [];

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', orgId],
    queryFn: () => listDepartments(orgId),
    enabled: !!orgId,
  });

  const params: ReportParams = {
    ...(effectiveScope === 'run' ? { runId: runId || undefined } : { year, month: month || undefined }),
    ...(departmentId ? { departmentId } : {}),
  };
  const ready = effectiveScope === 'run' ? !!runId : !!year;

  const report = useQuery({
    queryKey: ['payroll-report', orgId, reportKey, params],
    queryFn: () => def.fetch(orgId, params),
    enabled: !!orgId && ready && !isGl,
  });

  const gl = useQuery({
    queryKey: ['payroll-gl', orgId, runId],
    queryFn: () => payrollSvc.reportGlSummary(orgId, { runId }),
    enabled: !!orgId && isGl && !!runId,
  });

  const subtitle = effectiveScope === 'run'
    ? `Run: ${runs.find((r) => r.id === runId)?.runNumber ?? '—'}`
    : `Period: ${month ? new Date(year, month - 1).toLocaleString(undefined, { month: 'long' }) + ' ' : ''}${year}`;

  return (
    <div className="space-y-4">
      {/* Report selector */}
      <div className="flex flex-wrap gap-1.5">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => { setReportKey(r.key); if (r.scope !== 'either') setScopeMode(r.scope === 'run' ? 'run' : 'year'); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${reportKey === r.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card><CardContent className="p-3 flex flex-wrap items-end gap-3">
        {def.scope === 'either' && (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Scope</label>
            <Select value={scopeMode} onChange={(e) => setScopeMode(e.target.value as 'run' | 'year')} className="h-8 text-xs w-32">
              <option value="run">By payroll run</option>
              <option value="year">By period / year</option>
            </Select>
          </div>
        )}
        {effectiveScope === 'run' ? (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Payroll run</label>
            <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="h-8 text-xs w-64">
              <option value="">— Select a run —</option>
              {runs.map((r) => <option key={r.id} value={r.id}>{r.runNumber} · {r.description} ({r.status})</option>)}
            </Select>
          </div>
        ) : (
          <>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Year</label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 text-xs w-24" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Month</label>
              <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-8 text-xs w-32">
                <option value={0}>Whole year</option>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString(undefined, { month: 'long' })}</option>)}
              </Select>
            </div>
          </>
        )}
        {!isGl && (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Department</label>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="h-8 text-xs w-44">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {!isGl && report.data && report.data.rows.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => exportCsv(`${def.key}-${subtitle}`, def.columns, report.data!.rows, report.data!.totals)}>
                <Download size={14} /> Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => printReport(def.label, subtitle, def.columns, report.data!.rows, report.data!.totals)}>
                <Printer size={14} /> Print
              </Button>
            </>
          )}
        </div>
      </CardContent></Card>

      {/* Body */}
      {!ready ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Select a {effectiveScope === 'run' ? 'payroll run' : 'period'} to generate the report.</div>
      ) : isGl ? (
        <GlReportView data={gl.data} loading={gl.isLoading} subtitle={subtitle} />
      ) : report.isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : !report.data || report.data.rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">No payroll data for this selection.</div>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="text-[10px]">
              {def.columns.map((c) => <TableHead key={c.key} className={c.money ? 'text-right' : ''}>{c.label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {report.data.rows.map((r, i) => (
                <TableRow key={i} className="text-[11px]">
                  {def.columns.map((c) => (
                    <TableCell key={c.key} className={c.money ? 'text-right font-mono' : ''}>
                      {c.money ? fmt(Number(r[c.key] ?? 0)) : String(r[c.key] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="text-[11px] font-semibold border-t-2 bg-muted/30">
                {def.columns.map((c, i) => (
                  <TableCell key={c.key} className={c.money ? 'text-right font-mono' : ''}>
                    {i === 0 ? `Total (${report.data!.rows.length})` : c.money && report.data!.totals[c.key] != null ? fmt(Number(report.data!.totals[c.key])) : ''}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}

function GlReportView({ data, loading, subtitle }: { data?: payrollSvc.PayrollGlReport; loading: boolean; subtitle: string }) {
  if (loading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
  if (!data) return <div className="py-16 text-center text-sm text-muted-foreground">No data.</div>;

  const printGl = () => {
    const rows = data.lines.map((l) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${l.account}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;color:#666;">${l.description}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${l.debit ? fmt(l.debit) : ''}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${l.credit ? fmt(l.credit) : ''}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Payroll GL Summary</title></head><body style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;padding:24px;"><h2 style="margin:0;">Payroll GL / Journal Summary</h2><p style="color:#666;">${subtitle}</p><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;border-bottom:2px solid #333;padding:6px 8px;">Account</th><th style="text-align:left;border-bottom:2px solid #333;padding:6px 8px;">Description</th><th style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;">Debit</th><th style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;">Credit</th></tr></thead><tbody>${rows}<tr style="font-weight:bold;background:#f5f5f5;"><td colspan="2" style="padding:6px 8px;">TOTAL</td><td style="padding:6px 8px;text-align:right;">${fmt(data.totals.totalDebit)}</td><td style="padding:6px 8px;text-align:right;">${fmt(data.totals.totalCredit)}</td></tr></tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <p className="text-xs font-semibold">Accounting entries — how this run posts to the GL</p>
        <div className="flex items-center gap-2">
          <Badge variant={data.totals.balanced ? 'success' : 'destructive'}>{data.totals.balanced ? 'Balanced' : 'Unbalanced'}</Badge>
          <Button variant="outline" size="sm" onClick={printGl}><Printer size={14} /> Print</Button>
        </div>
      </div>
      <Table>
        <TableHeader><TableRow className="text-[10px]">
          <TableHead>Account</TableHead><TableHead>Description</TableHead>
          <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.lines.map((l, i) => (
            <TableRow key={i} className="text-[11px]">
              <TableCell className="font-medium">{l.account}</TableCell>
              <TableCell className="text-muted-foreground">{l.description}</TableCell>
              <TableCell className="text-right font-mono">{l.debit ? fmt(l.debit) : ''}</TableCell>
              <TableCell className="text-right font-mono">{l.credit ? fmt(l.credit) : ''}</TableCell>
            </TableRow>
          ))}
          <TableRow className="text-[11px] font-semibold border-t-2 bg-muted/30">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right font-mono">{fmt(data.totals.totalDebit)}</TableCell>
            <TableCell className="text-right font-mono">{fmt(data.totals.totalCredit)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
