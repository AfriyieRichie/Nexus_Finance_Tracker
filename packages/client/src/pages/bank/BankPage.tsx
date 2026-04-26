import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, RefreshCw } from 'lucide-react';
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

interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  isActive: boolean;
  ledgerAccountId: string | null;
}

interface BankStatementLine {
  id: string;
  transactionDate: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  reference: string | null;
  isMatched: boolean;
}

function NewBankAccountDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false }),
    enabled: open,
  });
  const bankLedgerAccounts = (accountsData?.accounts ?? []).filter((a) => (a.type === 'BANK' || a.type === 'CASH') && a.isActive);

  const [form, setForm] = useState({ accountName: '', bankName: '', accountNumber: '', currency: 'USD', ledgerAccountId: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => api.post(`/organisations/${organisationId}/bank/accounts`, {
      ...form,
      ledgerAccountId: form.ledgerAccountId || undefined,
    }).then((r) => r.data.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['bank-accounts'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Bank Account</Button>
      </DialogTrigger>
      <DialogContent title="New Bank Account" description="Link a bank account to a ledger account for reconciliation.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Account Name *</label>
              <Input value={form.accountName} onChange={(e) => set('accountName', e.target.value)} placeholder="Main Current Account" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Bank Name *</label>
              <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Ghana Commercial Bank" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Account Number</label>
              <Input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} placeholder="1234567890" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Currency</label>
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="h-8 text-xs">
                {['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          {bankLedgerAccounts.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">Linked Ledger Account</label>
              <Select value={form.ledgerAccountId} onChange={(e) => set('ledgerAccountId', e.target.value)} className="h-8 text-xs">
                <option value="">Auto-match</option>
                {bankLedgerAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.accountName || !form.bankName || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationView({ organisationId, bankAccountId, bankAccountName }: { organisationId: string; bankAccountId: string; bankAccountName: string }) {
  const qc = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['bank-recon-summary', organisationId, bankAccountId],
    queryFn: () => api.get(`/organisations/${organisationId}/bank/accounts/${bankAccountId}/summary`).then((r) => r.data.data),
  });

  const { data: statementsData } = useQuery({
    queryKey: ['bank-statements', organisationId, bankAccountId],
    queryFn: () => api.get(`/organisations/${organisationId}/bank/accounts/${bankAccountId}/statements`).then((r) => r.data.data as { id: string; name: string; importedAt: string; lineCount: number }[]),
  });

  const [selectedStatementId, setSelectedStatementId] = useState('');

  const { data: lines, isLoading: linesLoading } = useQuery({
    queryKey: ['bank-statement-lines', selectedStatementId],
    queryFn: () => api.get(`/organisations/${organisationId}/bank/statements/${selectedStatementId}`).then((r) => r.data.data?.lines as BankStatementLine[]),
    enabled: !!selectedStatementId,
  });

  const autoMatch = useMutation({
    mutationFn: () => api.post(`/organisations/${organisationId}/bank/statements/${selectedStatementId}/auto-match`).then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bank-statement-lines'] }),
  });

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => window.history.back()}>← Back to Accounts</Button>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{bankAccountName} — Reconciliation</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Ledger Balance', value: Number(summary.ledgerBalance ?? 0) },
            { label: 'Statement Balance', value: Number(summary.statementBalance ?? 0) },
            { label: 'Matched Lines', value: summary.matchedLines ?? 0, isCount: true },
            { label: 'Unmatched Lines', value: summary.unmatchedLines ?? 0, isCount: true },
          ].map(({ label, value, isCount }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-lg font-semibold">{isCount ? value : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <Select value={selectedStatementId} onChange={(e) => setSelectedStatementId(e.target.value)} className="w-64 h-8 text-xs">
            <option value="">Select a bank statement…</option>
            {(statementsData ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.lineCount} lines)</option>
            ))}
          </Select>
          {selectedStatementId && (
            <Button variant="outline" size="sm" disabled={autoMatch.isPending} onClick={() => autoMatch.mutate()}>
              <RefreshCw size={14} /> {autoMatch.isPending ? 'Matching…' : 'Auto-Match'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {linesLoading ? (
            <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !selectedStatementId ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Select a bank statement above to view lines.</div>
          ) : (lines ?? []).length === 0 ? (
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
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Matched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lines ?? []).map((line) => (
                  <TableRow key={line.id} className={cn(!line.isMatched && 'bg-orange-50/30 dark:bg-orange-950/10')}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(line.transactionDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm">{line.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{line.reference ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs">{Number(line.debitAmount) > 0 ? Number(line.debitAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</TableCell>
                    <TableCell className="text-right text-xs">{Number(line.creditAmount) > 0 ? Number(line.creditAmount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{Number(line.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={line.isMatched ? 'success' : 'warning'}>{line.isMatched ? 'Matched' : 'Unmatched'}</Badge>
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

export function BankPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['bank-accounts', activeOrganisationId],
    queryFn: () => api.get(`/organisations/${activeOrganisationId}/bank/accounts`).then((r) => r.data.data as BankAccount[]),
    enabled: !!activeOrganisationId && !selectedAccount,
  });

  if (selectedAccount && activeOrganisationId) {
    return (
      <div className="p-6">
        <ReconciliationView
          organisationId={activeOrganisationId}
          bankAccountId={selectedAccount.id}
          bankAccountName={selectedAccount.name}
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
          <p className="text-sm text-muted-foreground mt-0.5">{(accounts ?? []).length} bank accounts</p>
        </div>
        {activeOrganisationId && <NewBankAccountDialog organisationId={activeOrganisationId} />}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (accounts ?? []).length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No bank accounts yet.</p>
              <p className="text-xs text-muted-foreground">Add a bank account to start reconciling.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accounts ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm font-medium">{a.accountName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.bankName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.accountNumber || '—'}</TableCell>
                    <TableCell className="text-xs font-semibold">{a.currency}</TableCell>
                    <TableCell><Badge variant={a.isActive ? 'success' : 'secondary'}>{a.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell>
                      <button onClick={() => setSelectedAccount({ id: a.id, name: a.accountName })}
                        className="text-xs text-primary hover:underline">
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
