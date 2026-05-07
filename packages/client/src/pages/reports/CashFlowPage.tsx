import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Download, Printer, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getCashFlow, CFSSection, CFSMultiPeriod, CFSLine } from '@/services/reports.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/utils/export';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number | undefined): string {
  if (v === undefined || v === null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  const abs = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return n < 0 ? `(${abs})` : abs;
}

function toIso(d: Date) { return d.toISOString().slice(0, 10); }
function endOfMonth(d: Date) { return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return toIso(new Date(d.getFullYear(), (q + 1) * 3, 0));
}

const QUICK_SELECTS = [
  { label: 'This Month',   resolve: (n: Date) => ({ from: toIso(new Date(n.getFullYear(), n.getMonth(), 1)),  to: endOfMonth(n) }) },
  { label: 'Last Month',   resolve: (n: Date) => { const d = new Date(n.getFullYear(), n.getMonth() - 1, 1); return { from: toIso(d), to: endOfMonth(d) }; } },
  { label: 'This Quarter', resolve: (n: Date) => { const q = Math.floor(n.getMonth() / 3); return { from: toIso(new Date(n.getFullYear(), q * 3, 1)), to: endOfQuarter(n) }; } },
  { label: 'Last Quarter', resolve: (n: Date) => { const q = Math.floor(n.getMonth() / 3); const pq = q === 0 ? 3 : q - 1; const yr = q === 0 ? n.getFullYear() - 1 : n.getFullYear(); const d = new Date(yr, pq * 3, 1); return { from: toIso(d), to: endOfQuarter(d) }; } },
  { label: 'YTD',          resolve: (n: Date) => ({ from: `${n.getFullYear()}-01-01`, to: toIso(n) }) },
  { label: 'Last Year',    resolve: (n: Date) => ({ from: `${n.getFullYear() - 1}-01-01`, to: `${n.getFullYear() - 1}-12-31` }) },
];

// ─── Amount cell ──────────────────────────────────────────────────────────────

function Amt({ value, bold, highlight }: { value?: string; bold?: boolean; highlight?: boolean }) {
  const n = Number(value ?? 0);
  return (
    <span className={cn(
      'font-mono text-xs tabular-nums text-right w-28 inline-block',
      bold && 'font-bold',
      highlight && n > 0 && 'text-emerald-600',
      highlight && n < 0 && 'text-red-500',
      !highlight && n < 0 && 'text-muted-foreground',
    )}>
      {fmt(value)}
    </span>
  );
}

// ─── Column config ────────────────────────────────────────────────────────────

interface ColConfig {
  hasPP: boolean;
  hasPY: boolean;
  ppLabel: string;
  pyLabel: string;
}

function ColHeaders({ cur, cfg }: { cur: string; cfg: ColConfig }) {
  return (
    <div className="grid gap-1 text-[10px] font-semibold text-muted-foreground text-right mb-1 border-b pb-1" style={{ gridTemplateColumns: colGrid(cfg) }}>
      <span className="text-left text-foreground">Item</span>
      <span>{cur}</span>
      {cfg.hasPP && <span>{cfg.ppLabel}</span>}
      {cfg.hasPY && <span>{cfg.pyLabel}</span>}
    </div>
  );
}

function colGrid(cfg: ColConfig) {
  const cols = 1 + (cfg.hasPP ? 1 : 0) + (cfg.hasPY ? 1 : 0);
  return `1fr ${Array(cols).fill('7rem').join(' ')}`;
}

// ─── Section row ──────────────────────────────────────────────────────────────

function SectionRow({
  label, amounts, cfg, indent = false, bold = false, subtotal = false, total = false, highlight = false,
}: {
  label: string; amounts: CFSMultiPeriod; cfg: ColConfig;
  indent?: boolean; bold?: boolean; subtotal?: boolean; total?: boolean; highlight?: boolean;
}) {
  return (
    <div className={cn(
      'grid items-center gap-1 py-0.5 text-xs',
      subtotal && 'border-t border-border/60 mt-0.5 pt-1',
      total && 'border-t-2 border-b-2 border-foreground/30 py-1.5',
    )} style={{ gridTemplateColumns: colGrid(cfg) }}>
      <span className={cn(indent && 'pl-4', bold && 'font-semibold', total && 'font-bold')}>{label}</span>
      <Amt value={amounts.current} bold={bold || subtotal || total} highlight={highlight} />
      {cfg.hasPP && <Amt value={amounts.priorPeriod} bold={bold || subtotal || total} />}
      {cfg.hasPY && <Amt value={amounts.priorYear} bold={bold || subtotal || total} />}
    </div>
  );
}

// ─── CFS section block ────────────────────────────────────────────────────────

function CFSSectionBlock({ section, cfg }: { section: CFSSection; cfg: ColConfig }) {
  if (section.lines.length === 0) {
    return <p className="text-xs text-muted-foreground italic pl-4 py-1">No transactions in this period</p>;
  }
  return (
    <div className="space-y-0">
      {section.lines.map((line: CFSLine) => (
        <SectionRow key={line.accountId} label={line.label ?? line.name} amounts={line.amounts} cfg={cfg} indent />
      ))}
    </div>
  );
}

// ─── Sub-total row ────────────────────────────────────────────────────────────

function SubtotalRow({ label, amounts, cfg }: { label: string; amounts: CFSMultiPeriod; cfg: ColConfig }) {
  return <SectionRow label={label} amounts={amounts} cfg={cfg} subtotal bold />;
}

// ─── Total row ────────────────────────────────────────────────────────────────

function TotalRow({ label, amounts, cfg, highlight }: { label: string; amounts: CFSMultiPeriod; cfg: ColConfig; highlight?: boolean }) {
  return <SectionRow label={label} amounts={amounts} cfg={cfg} total highlight={highlight} />;
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-4 pb-1 border-b">{children}</p>;
}

// ─── Disclosure Note ──────────────────────────────────────────────────────────

function DisclosureNote({ label, amounts, cfg }: { label: string; amounts: CFSMultiPeriod; cfg: ColConfig }) {
  return (
    <div className="grid items-center gap-1 py-0.5 text-xs" style={{ gridTemplateColumns: colGrid(cfg) }}>
      <span className="pl-4 text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums text-right w-28 inline-block text-muted-foreground">{fmt(amounts.current)}</span>
      {cfg.hasPP && <span className="font-mono text-xs tabular-nums text-right w-28 inline-block text-muted-foreground">{fmt(amounts.priorPeriod)}</span>}
      {cfg.hasPY && <span className="font-mono text-xs tabular-nums text-right w-28 inline-block text-muted-foreground">{fmt(amounts.priorYear)}</span>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CashFlowPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const now = new Date();
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate]     = useState(toIso(now));
  const [hasPP, setHasPP] = useState(false);
  const [hasPY, setHasPY] = useState(false);

  const comparisons = [hasPP && 'prior_period', hasPY && 'prior_year'].filter(Boolean).join(',');

  const { data, isLoading } = useQuery({
    queryKey: ['cash-flow', activeOrganisationId, fromDate, toDate, comparisons],
    queryFn: () => getCashFlow(activeOrganisationId!, {
      fromDate, toDate,
      ...(comparisons ? { comparisons } : {}),
    }),
    enabled: !!activeOrganisationId,
  });

  const cfg: ColConfig = {
    hasPP,
    hasPY,
    ppLabel: data?.priorPeriod ? `${data.priorPeriod.fromDate} – ${data.priorPeriod.toDate}` : 'Prior Period',
    pyLabel: data?.priorYear   ? `${data.priorYear.fromDate} – ${data.priorYear.toDate}`     : 'Prior Year',
  };

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [['Item', 'Current', ...(hasPP ? ['Prior Period'] : []), ...(hasPY ? ['Prior Year'] : [])]];
    const addLine = (label: string, mp: CFSMultiPeriod) =>
      rows.push([label, Number(mp.current), ...(hasPP ? [Number(mp.priorPeriod ?? 0)] : []), ...(hasPY ? [Number(mp.priorYear ?? 0)] : [])]);

    addLine('Net Profit', data.netProfit);
    for (const l of data.nonCashAdjustments.lines) addLine(`  ${l.label ?? l.name}`, l.amounts);
    addLine('Total Non-Cash Adjustments', data.nonCashAdjustments.subtotal);
    for (const l of data.workingCapitalChanges.lines) addLine(`  ${l.label ?? l.name}`, l.amounts);
    addLine('Net Cash from Operating', data.netCashFromOperating);
    for (const l of data.investingActivities.lines) addLine(`  ${l.label ?? l.name}`, l.amounts);
    addLine('Net Cash from Investing', data.netCashFromInvesting);
    for (const l of data.financingActivities.lines) addLine(`  ${l.label ?? l.name}`, l.amounts);
    addLine('Net Cash from Financing', data.netCashFromFinancing);
    addLine('Net Change in Cash', data.netChangeInCash);
    addLine('Opening Cash', data.openingCash);
    addLine('Closing Cash (CFS)', data.closingCashCFS);
    rows.push(['Closing Cash (Balance Sheet)', Number(data.closingCashBS)]);
    downloadCsv(`cash-flow-${fromDate}-to-${toDate}.csv`, rows);
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Banknote size={18} /> Cash Flow Statement
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">IAS 7 · Indirect Method · {currency}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}><Download size={14} className="mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} className="mr-1" /> Print</Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-7 w-36 text-xs" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-7 w-36 text-xs" />
        </div>
        <div className="flex gap-1">
          {QUICK_SELECTS.map((q) => (
            <button key={q.label}
              onClick={() => { const r = q.resolve(now); setFromDate(r.from); setToDate(r.to); }}
              className="px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted transition-colors"
            >{q.label}</button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setHasPP((p) => !p)}
            className={cn('px-2 py-0.5 text-[10px] rounded border transition-colors', hasPP ? 'bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
          >Prior Period</button>
          <button onClick={() => setHasPY((p) => !p)}
            className={cn('px-2 py-0.5 text-[10px] rounded border transition-colors', hasPY ? 'bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
          >Prior Year</button>
        </div>
      </div>

      {/* Statement */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(16)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
      ) : !data ? null : (
        <div className="border rounded-lg p-5 bg-card text-sm print:border-0 print:p-0">

          {/* Organisation & period header */}
          <div className="text-center mb-4 print:mb-6">
            <p className="font-bold text-base">{data.organisation.name}</p>
            <p className="text-xs text-muted-foreground">Statement of Cash Flows</p>
            <p className="text-xs text-muted-foreground">For the period {data.fromDate} to {data.toDate} · {currency}</p>
          </div>

          <ColHeaders cur={`${data.fromDate} – ${data.toDate}`} cfg={cfg} />

          {/* ── OPERATING ── */}
          <SectionHeading>Cash Flows from Operating Activities</SectionHeading>

          <SectionRow label="Net profit for the period" amounts={data.netProfit} cfg={cfg} bold />

          {data.nonCashAdjustments.lines.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground italic pl-4 pt-2">Adjustments for non-cash items:</p>
              <CFSSectionBlock section={data.nonCashAdjustments} cfg={cfg} />
              <SubtotalRow label="Total non-cash adjustments" amounts={data.nonCashAdjustments.subtotal} cfg={cfg} />
            </>
          )}

          {data.workingCapitalChanges.lines.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground italic pl-4 pt-2">Changes in working capital:</p>
              <CFSSectionBlock section={data.workingCapitalChanges} cfg={cfg} />
              <SubtotalRow label="Net working capital movement" amounts={data.workingCapitalChanges.subtotal} cfg={cfg} />
            </>
          )}

          <TotalRow label="NET CASH FROM/(USED IN) OPERATING ACTIVITIES" amounts={data.netCashFromOperating} cfg={cfg} highlight />

          {/* ── INVESTING ── */}
          <SectionHeading>Cash Flows from Investing Activities</SectionHeading>
          {data.investingActivities.lines.length === 0
            ? <p className="text-xs text-muted-foreground italic pl-4 py-1">No investing activities in this period</p>
            : <CFSSectionBlock section={data.investingActivities} cfg={cfg} />}
          <TotalRow label="NET CASH FROM/(USED IN) INVESTING ACTIVITIES" amounts={data.netCashFromInvesting} cfg={cfg} highlight />

          {/* ── FINANCING ── */}
          <SectionHeading>Cash Flows from Financing Activities</SectionHeading>
          {data.financingActivities.lines.length === 0
            ? <p className="text-xs text-muted-foreground italic pl-4 py-1">No financing activities in this period</p>
            : <CFSSectionBlock section={data.financingActivities} cfg={cfg} />}
          <TotalRow label="NET CASH FROM/(USED IN) FINANCING ACTIVITIES" amounts={data.netCashFromFinancing} cfg={cfg} highlight />

          {/* ── RECONCILIATION ── */}
          <div className="mt-6 space-y-0">
            <SectionRow label="Net increase/(decrease) in cash and cash equivalents" amounts={data.netChangeInCash} cfg={cfg} bold />
            <SectionRow label="Cash and cash equivalents at beginning of period" amounts={data.openingCash} cfg={cfg} />
            <TotalRow label="CASH AND CASH EQUIVALENTS AT END OF PERIOD" amounts={data.closingCashCFS} cfg={cfg} highlight />
          </div>

          {/* Balance-sheet cross-check */}
          <div className={cn('mt-3 flex items-center gap-2 rounded p-2 text-xs border',
            data.reconciled ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700')}>
            {data.reconciled
              ? <><CheckCircle size={13} className="shrink-0" /><span>Reconciled — closing cash matches Balance Sheet ({fmt(data.closingCashBS)} {currency})</span></>
              : <><AlertTriangle size={13} className="shrink-0" /><span>Unreconciled — CFS closing cash {fmt(data.closingCashCFS.current)} vs Balance Sheet {fmt(data.closingCashBS)} {currency}. Investigate before finalising accounts.</span></>}
          </div>

          {/* ── IAS 7 Disclosure Notes ── */}
          <div className="mt-6 border-t pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
              <Info size={10} /> IAS 7 Disclosures (Note)
            </p>
            <p className="text-[10px] text-muted-foreground mb-2">
              The following amounts are included in net profit and are disclosed separately as required by IAS 7.31–32.
              Amounts are approximated on an accrual basis.
            </p>
            <DisclosureNote label="Interest paid (estimated)" amounts={data.disclosures.interestPaid} cfg={cfg} />
            <DisclosureNote label="Income tax paid (estimated)" amounts={data.disclosures.taxPaid} cfg={cfg} />
            {data.disclosures.nonCashTransactions.map((note, i) => (
              <p key={i} className="text-[10px] text-amber-700 italic mt-2 pl-4 flex items-start gap-1">
                <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {note}
              </p>
            ))}
          </div>

          {/* ── Key metrics bar ── */}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t pt-4">
            {[
              { label: 'Operating CF', value: data.netCashFromOperating.current },
              { label: 'Investing CF', value: data.netCashFromInvesting.current },
              { label: 'Financing CF', value: data.netCashFromFinancing.current },
            ].map(({ label, value }) => {
              const n = Number(value);
              return (
                <div key={label} className="text-center border rounded p-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={cn('text-sm font-bold font-mono mt-0.5 flex items-center justify-center gap-1',
                    n >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {n >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {fmt(value)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <p className="text-[9px] text-muted-foreground mt-5 text-center">
            Prepared using the indirect method in accordance with IAS 7 Statement of Cash Flows.
            Restricted cash, security deposits, and cash not freely available are excluded from cash and cash equivalents.
            Generated {new Date().toLocaleString()}.
          </p>
        </div>
      )}
    </div>
  );
}
