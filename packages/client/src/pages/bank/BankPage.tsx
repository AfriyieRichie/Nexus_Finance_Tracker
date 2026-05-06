import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, RefreshCw, Upload, Lock, CheckCircle, FileText, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { listAccounts } from '@/services/accounts.service';
import { listPeriods } from '@/services/periods.service';
import type { AccountingPeriod } from '@/services/periods.service';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  branchCode?: string;
  currency: string;
  isActive: boolean;
  accountId: string;
  account: { code: string; name: string };
}

interface BankStatement {
  id: string;
  statementDate: string;
  openingBalance: string;
  closingBalance: string;
  isReconciled: boolean;
  isLocked: boolean;
  reconciledAt: string | null;
  reconciledBy: string | null;
  bankAccount: { bankName: string; accountNumber: string };
  _count: { lines: number };
}

interface BankStatementLine {
  id: string;
  transactionDate: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  reference: string | null;
  isMatched: boolean;
  matchedEntryId: string | null;
  matchNote: string | null;
  journalEntryId: string | null;
}

interface ReconciliationSummary {
  statementId: string;
  statementDate: string;
  openingBalance: string;
  closingBalance: string;
  isReconciled: boolean;
  isLocked: boolean;
  reconciledAt: string | null;
  reconciledBy: string | null;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  unmatchedDebits: string;
  unmatchedCredits: string;
  difference: string;
  bankAccount: { bankName: string; accountNumber: string; currency: string; account: { code: string; name: string } };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((row) => {
    const vals: string[] = [];
    let cur = '', inQ = false;
    for (const ch of row) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

// ─── NewBankAccountDialog ─────────────────────────────────────────────────────

function NewBankAccountDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'bank-posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
    enabled: open,
  });
  const bankAccounts = (accountsData?.accounts ?? []).filter((a) => (a.type === 'BANK' || a.type === 'CASH') && a.isActive);

  const [form, setForm] = useState({ accountId: '', bankName: '', accountNumber: '', branchCode: '', currency: 'USD' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => api.post(`/organisations/${organisationId}/bank/accounts`, {
      accountId: form.accountId,
      bankName: form.bankName,
      accountNumber: form.accountNumber,
      branchCode: form.branchCode || undefined,
      currency: form.currency,
    }).then((r) => r.data.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['bank-accounts'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Bank Account</Button>
      </DialogTrigger>
      <DialogContent title="New Bank Account" description="Link a GL bank/cash account to a physical bank account for reconciliation.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">GL Account (Bank/Cash) *</label>
            <Select value={form.accountId} onChange={(e) => set('accountId', e.target.value)} className="h-8 text-xs w-full">
              <option value="">Select account…</option>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Bank Name *</label>
              <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Ghana Commercial Bank" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Account Number</label>
              <Input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} placeholder="1234567890" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Branch Code</label>
              <Input value={form.branchCode} onChange={(e) => set('branchCode', e.target.value)} placeholder="Optional" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Currency</label>
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="h-8 text-xs">
                {['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error creating account'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.accountId || !form.bankName || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ImportStatementDialog ────────────────────────────────────────────────────

interface ParsedLine {
  transactionDate: string;
  description: string;
  reference: string;
  debitAmount: number;
  creditAmount: number;
  error?: string;
}

function ImportStatementDialog({ organisationId, bankAccountId, onSuccess }: { organisationId: string; bankAccountId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState({ statementDate: '', openingBalance: '', closingBalance: '' });
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [parseError, setParseError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/organisations/${organisationId}/bank/statements`, {
      bankAccountId,
      statementDate: meta.statementDate,
      openingBalance: Number(meta.openingBalance),
      closingBalance: Number(meta.closingBalance),
      lines: parsedLines.filter((l) => !l.error).map((l) => ({
        transactionDate: l.transactionDate,
        description: l.description,
        reference: l.reference || undefined,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
      })),
    }).then((r) => r.data.data),
    onSuccess: () => { onSuccess(); setOpen(false); setParsedLines([]); setMeta({ statementDate: '', openingBalance: '', closingBalance: '' }); },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setParseError('');
    setParsedLines([]);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const rows = parseCSV(text);
        if (rows.length === 0) { setParseError('CSV is empty or could not be parsed. Expected columns: Date, Description, Reference, Debit, Credit'); return; }
        const lines: ParsedLine[] = rows.map((row, i) => {
          const dateVal = row['Date'] || row['date'] || row['Transaction Date'] || row['TransactionDate'] || '';
          const desc = row['Description'] || row['Narration'] || row['description'] || '';
          const ref = row['Reference'] || row['Ref'] || row['reference'] || '';
          const debit = parseFloat(row['Debit'] || row['Withdrawal'] || row['Dr'] || '0') || 0;
          const credit = parseFloat(row['Credit'] || row['Deposit'] || row['Cr'] || '0') || 0;
          const dateMatch = dateVal.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})|(\d{2}-\d{2}-\d{4})/);
          let transactionDate = dateVal;
          if (dateMatch) {
            if (dateVal.includes('/')) {
              const [d, m, y] = dateVal.split('/');
              transactionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            } else if (dateVal.match(/^\d{2}-\d{2}-\d{4}$/)) {
              const [d, m, y] = dateVal.split('-');
              transactionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
          }
          const error = !transactionDate.match(/^\d{4}-\d{2}-\d{2}$/) ? `Row ${i + 2}: Invalid date "${dateVal}"` :
            !desc ? `Row ${i + 2}: Description is required` :
            (debit === 0 && credit === 0) ? `Row ${i + 2}: Both debit and credit are zero` : undefined;
          return { transactionDate, description: desc, reference: ref, debitAmount: debit, creditAmount: credit, error };
        });
        setParsedLines(lines);
      } catch {
        setParseError('Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  }

  const hasErrors = parsedLines.some((l) => l.error);
  const validLines = parsedLines.filter((l) => !l.error);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Upload size={14} /> Import Statement</Button>
      </DialogTrigger>
      <DialogContent title="Import Bank Statement" description="Upload a CSV file with columns: Date, Description, Reference, Debit, Credit">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Statement Date *</label>
              <Input type="date" value={meta.statementDate} onChange={(e) => setMeta((m) => ({ ...m, statementDate: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Opening Balance *</label>
              <Input type="number" step="0.01" value={meta.openingBalance} onChange={(e) => setMeta((m) => ({ ...m, openingBalance: e.target.value }))} placeholder="0.00" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Closing Balance *</label>
              <Input type="number" step="0.01" value={meta.closingBalance} onChange={(e) => setMeta((m) => ({ ...m, closingBalance: e.target.value }))} placeholder="0.00" className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">CSV File *</label>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="text-xs" />
            <p className="text-xs text-muted-foreground mt-1">Columns: Date, Description, Reference, Debit, Credit</p>
          </div>

          {parseError && <p className="text-xs text-destructive">{parseError}</p>}

          {parsedLines.length > 0 && (
            <div className="border rounded-md overflow-auto max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Debit</TableHead>
                    <TableHead className="text-xs text-right">Credit</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedLines.map((l, i) => (
                    <TableRow key={i} className={l.error ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                      <TableCell className="text-xs">{l.transactionDate}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">{l.description}</TableCell>
                      <TableCell className="text-xs text-right">{l.debitAmount > 0 ? fmt(l.debitAmount) : '—'}</TableCell>
                      <TableCell className="text-xs text-right">{l.creditAmount > 0 ? fmt(l.creditAmount) : '—'}</TableCell>
                      <TableCell className="text-xs">{l.error ? <span className="text-destructive">{l.error}</span> : <span className="text-green-600">OK</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {parsedLines.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {validLines.length} valid line(s){hasErrors ? `, ${parsedLines.filter((l) => l.error).length} error(s) — fix CSV and re-upload` : ''}
            </p>
          )}

          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Import failed'}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm"
              disabled={hasErrors || validLines.length === 0 || !meta.statementDate || !meta.openingBalance || !meta.closingBalance || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Importing…' : `Import ${validLines.length} Line(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CreateJournalDialog ──────────────────────────────────────────────────────

function CreateJournalDialog({ organisationId, line, onSuccess }: { organisationId: string; line: BankStatementLine; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false }),
    enabled: open,
  });
  const { data: periods } = useQuery({
    queryKey: ['periods', organisationId, 'open'],
    queryFn: () => listPeriods(organisationId, { status: 'OPEN' }),
    enabled: open,
  });

  const postingAccounts = (accountsData?.accounts ?? []).filter((a) => a.isActive && a.type !== 'BANK' && a.type !== 'CASH');
  const isDebit = Number(line.debitAmount) > 0;
  const amount = isDebit ? line.debitAmount : line.creditAmount;

  const [form, setForm] = useState({ accountId: '', periodId: '', description: line.description, note: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => api.post(`/organisations/${organisationId}/bank/lines/${line.id}/journal`, form).then((r) => r.data.data),
    onSuccess: () => { onSuccess(); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2"><FileText size={12} /> Create Journal</Button>
      </DialogTrigger>
      <DialogContent title="Create Journal Entry" description={`Create a journal entry for this unmatched bank statement line.`}>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{new Date(line.transactionDate).toLocaleDateString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span className="font-medium">{line.description}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isDebit ? 'Debit (payment out)' : 'Credit (receipt in)'}</span>
              <span className="font-semibold">{fmt(amount)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {isDebit ? 'Dr expense/other account · Cr bank account' : 'Dr bank account · Cr income/other account'}
          </p>
          <div>
            <label className="text-xs font-medium mb-1 block">Contra Account (non-bank) *</label>
            <Select value={form.accountId} onChange={(e) => set('accountId', e.target.value)} className="h-8 text-xs w-full">
              <option value="">Select account…</option>
              {postingAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Accounting Period *</label>
            <Select value={form.periodId} onChange={(e) => set('periodId', e.target.value)} className="h-8 text-xs w-full">
              <option value="">Select period…</option>
              {(periods ?? []).map((p: AccountingPeriod) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Description *</label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Note (optional)</label>
            <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Reconciliation note" className="h-8 text-xs" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error creating journal'}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.accountId || !form.periodId || !form.description || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create & Match'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ConfirmReconciliationButton ──────────────────────────────────────────────

function ConfirmReconciliationButton({ organisationId, statementId, unmatchedLines, onSuccess }: { organisationId: string; statementId: string; unmatchedLines: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [segregationError, setSegregationError] = useState('');

  const mutation = useMutation({
    mutationFn: (f: boolean) => api.post(`/organisations/${organisationId}/bank/statements/${statementId}/confirm`, { force: f }).then((r) => r.data.data),
    onSuccess: () => { onSuccess(); setOpen(false); },
    onError: (err: any) => {
      const msg: string = err?.response?.data?.message ?? '';
      if (msg.startsWith('SEGREGATION_VIOLATION:')) {
        setSegregationError(msg.replace('SEGREGATION_VIOLATION:', ''));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setSegregationError(''); setForce(false); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" disabled={unmatchedLines > 0}>
          <Lock size={14} /> Confirm & Lock
        </Button>
      </DialogTrigger>
      <DialogContent title="Confirm Reconciliation" description="This will lock the statement. No further changes can be made after locking.">
        <div className="space-y-4">
          {unmatchedLines > 0 ? (
            <p className="text-sm text-destructive">{unmatchedLines} line(s) are still unmatched. Resolve all lines before confirming.</p>
          ) : (
            <p className="text-sm">All lines are matched. Confirm and lock this reconciliation?</p>
          )}

          {segregationError && (
            <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 space-y-2">
              <div className="flex items-start gap-2 text-orange-700 dark:text-orange-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <p className="text-xs">{segregationError}</p>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                I am a supervisor — override segregation of duties check
              </label>
            </div>
          )}

          {mutation.isError && !segregationError && (
            <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error confirming reconciliation'}</p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" variant="destructive" disabled={mutation.isPending || unmatchedLines > 0}
              onClick={() => { setSegregationError(''); mutation.mutate(force); }}>
              {mutation.isPending ? 'Locking…' : segregationError ? 'Override & Lock' : 'Confirm & Lock'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── StatementDetailView ──────────────────────────────────────────────────────

function StatementDetailView({ organisationId, statement, onBack }: { organisationId: string; statement: BankStatement; onBack: () => void }) {
  const qc = useQueryClient();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['bank-recon-summary', organisationId, statement.id],
    queryFn: () => api.get(`/organisations/${organisationId}/bank/statements/${statement.id}/summary`).then((r) => r.data.data as ReconciliationSummary),
  });

  const { data: stmtDetail, isLoading: linesLoading } = useQuery({
    queryKey: ['bank-statement-lines', statement.id],
    queryFn: () => api.get(`/organisations/${organisationId}/bank/statements/${statement.id}`).then((r) => r.data.data),
  });

  const lines: BankStatementLine[] = stmtDetail?.lines ?? [];

  const autoMatch = useMutation({
    mutationFn: () => api.post(`/organisations/${organisationId}/bank/statements/${statement.id}/auto-match`).then((r) => r.data.data),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['bank-statement-lines', statement.id] });
      void qc.invalidateQueries({ queryKey: ['bank-recon-summary', organisationId, statement.id] });
      alert(`Auto-match complete: ${data.matched} matched, ${data.unmatched} remaining.`);
    },
  });

  const unmatch = useMutation({
    mutationFn: (lineId: string) => api.delete(`/organisations/${organisationId}/bank/lines/${lineId}/match`).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bank-statement-lines', statement.id] });
      void qc.invalidateQueries({ queryKey: ['bank-recon-summary', organisationId, statement.id] });
    },
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['bank-statement-lines', statement.id] });
    void qc.invalidateQueries({ queryKey: ['bank-recon-summary', organisationId, statement.id] });
    void qc.invalidateQueries({ queryKey: ['bank-statements', organisationId] });
  };

  const isLocked = summary?.isLocked ?? statement.isLocked;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft size={14} /> Back to Statements</Button>
        <span className="text-sm font-semibold">{statement.bankAccount.bankName} — {new Date(statement.statementDate).toLocaleDateString()}</span>
        {isLocked && <Badge variant="secondary" className="gap-1"><Lock size={10} /> Locked</Badge>}
        {summary?.isReconciled && !isLocked && <Badge variant="success"><CheckCircle size={10} /> Reconciled</Badge>}
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Opening Balance', value: summary.openingBalance, money: true },
              { label: 'Closing Balance', value: summary.closingBalance, money: true },
              { label: 'Matched', value: `${summary.matchedLines} / ${summary.totalLines}`, money: false },
              { label: 'Difference', value: summary.difference, money: true, diff: true },
            ].map(({ label, value, money, diff }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className={cn('text-lg font-semibold', diff && Number(value) !== 0 && 'text-destructive')}>
                    {money ? fmt(value as string) : value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          {summary.unmatchedLines > 0 && (
            <div className="rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 text-xs text-orange-700 dark:text-orange-400">
              {summary.unmatchedLines} unmatched line(s) — Unmatched debits: {fmt(summary.unmatchedDebits)} · Unmatched credits: {fmt(summary.unmatchedCredits)}
            </div>
          )}
          {isLocked && summary.reconciledAt && (
            <p className="text-xs text-muted-foreground">Locked on {new Date(summary.reconciledAt).toLocaleString()} by {summary.reconciledBy}</p>
          )}
        </>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <p className="text-sm font-medium">Statement Lines</p>
          {!isLocked && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={autoMatch.isPending} onClick={() => autoMatch.mutate()}>
                <RefreshCw size={14} className={autoMatch.isPending ? 'animate-spin' : ''} />
                {autoMatch.isPending ? 'Matching…' : 'Auto-Match'}
              </Button>
              <ConfirmReconciliationButton
                organisationId={organisationId}
                statementId={statement.id}
                unmatchedLines={summary?.unmatchedLines ?? 1}
                onSuccess={refreshAll}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {linesLoading ? (
            <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : lines.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No lines in this statement.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Status</TableHead>
                  {!isLocked && <TableHead>Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id} className={cn(!line.isMatched && 'bg-orange-50/30 dark:bg-orange-950/10')}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(line.transactionDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm">
                      <div>{line.description}</div>
                      {line.matchNote && <div className="text-xs text-muted-foreground mt-0.5">Note: {line.matchNote}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{line.reference ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs">{Number(line.debitAmount) > 0 ? fmt(line.debitAmount) : '—'}</TableCell>
                    <TableCell className="text-right text-xs">{Number(line.creditAmount) > 0 ? fmt(line.creditAmount) : '—'}</TableCell>
                    <TableCell>
                      {line.isMatched ? (
                        <Badge variant="success" className="text-xs">{line.journalEntryId ? 'Journal Created' : 'Matched'}</Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">Unmatched</Badge>
                      )}
                    </TableCell>
                    {!isLocked && (
                      <TableCell>
                        {line.isMatched ? (
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-muted-foreground"
                            disabled={unmatch.isPending} onClick={() => unmatch.mutate(line.id)}>
                            Unmatch
                          </Button>
                        ) : (
                          <CreateJournalDialog
                            organisationId={organisationId}
                            line={line}
                            onSuccess={() => {
                              void qc.invalidateQueries({ queryKey: ['bank-statement-lines', statement.id] });
                              void qc.invalidateQueries({ queryKey: ['bank-recon-summary', organisationId, statement.id] });
                            }}
                          />
                        )}
                      </TableCell>
                    )}
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

// ─── StatementsView ───────────────────────────────────────────────────────────

function StatementsView({ organisationId, bankAccount, onBack }: { organisationId: string; bankAccount: BankAccount; onBack: () => void }) {
  const qc = useQueryClient();
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);

  const { data: statementsData, isLoading } = useQuery({
    queryKey: ['bank-statements', organisationId, bankAccount.id],
    queryFn: () => api.get(`/organisations/${organisationId}/bank/statements`, { params: { bankAccountId: bankAccount.id, pageSize: 50 } }).then((r) => r.data.data as { statements: BankStatement[]; total: number }),
  });

  const statements = statementsData?.statements ?? [];

  if (selectedStatement) {
    return (
      <StatementDetailView
        organisationId={organisationId}
        statement={selectedStatement}
        onBack={() => { setSelectedStatement(null); void qc.invalidateQueries({ queryKey: ['bank-statements', organisationId, bankAccount.id] }); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft size={14} /> Back to Accounts</Button>
          <div>
            <p className="text-sm font-semibold">{bankAccount.bankName}</p>
            <p className="text-xs text-muted-foreground">{bankAccount.account.code} — {bankAccount.account.name} · {bankAccount.accountNumber}</p>
          </div>
        </div>
        <ImportStatementDialog
          organisationId={organisationId}
          bankAccountId={bankAccount.id}
          onSuccess={() => void qc.invalidateQueries({ queryKey: ['bank-statements', organisationId, bankAccount.id] })}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : statements.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No statements imported yet.</p>
              <p className="text-xs text-muted-foreground">Import a bank statement CSV to begin reconciliation.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statement Date</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm font-medium">{new Date(s.statementDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmt(s.openingBalance)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmt(s.closingBalance)}</TableCell>
                    <TableCell className="text-xs text-right">{s._count.lines}</TableCell>
                    <TableCell>
                      {s.isLocked ? (
                        <Badge variant="secondary" className="gap-1"><Lock size={10} /> Locked</Badge>
                      ) : s.isReconciled ? (
                        <Badge variant="success">Reconciled</Badge>
                      ) : (
                        <Badge variant="warning">In Progress</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <button onClick={() => setSelectedStatement(s)} className="text-xs text-primary hover:underline">
                        {s.isLocked ? 'View' : 'Reconcile'} →
                      </button>
                    </TableCell>
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

// ─── BankPage ─────────────────────────────────────────────────────────────────

export function BankPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['bank-accounts', activeOrganisationId],
    queryFn: () => api.get(`/organisations/${activeOrganisationId}/bank/accounts`).then((r) => r.data.data as BankAccount[]),
    enabled: !!activeOrganisationId,
  });

  if (!activeOrganisationId) return null;

  if (selectedAccount) {
    return (
      <div className="p-6">
        <StatementsView
          organisationId={activeOrganisationId}
          bankAccount={selectedAccount}
          onBack={() => setSelectedAccount(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Landmark size={18} /> Bank Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{(accounts ?? []).length} bank account(s) linked</p>
        </div>
        <NewBankAccountDialog organisationId={activeOrganisationId} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (accounts ?? []).length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No bank accounts linked yet.</p>
              <p className="text-xs text-muted-foreground">Create a bank account to start reconciling against your GL.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>GL Account</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accounts ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm font-medium">{a.bankName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.account.code} — {a.account.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.accountNumber || '—'}</TableCell>
                    <TableCell className="text-xs font-semibold">{a.currency}</TableCell>
                    <TableCell><Badge variant={a.isActive ? 'success' : 'secondary'}>{a.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell>
                      <button onClick={() => setSelectedAccount(a)} className="text-xs text-primary hover:underline">
                        Reconcile →
                      </button>
                    </TableCell>
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
