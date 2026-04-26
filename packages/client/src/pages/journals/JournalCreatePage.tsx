import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft, AlertCircle, Wand2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  createJournal, updateJournal, submitJournal, getJournal,
} from '@/services/journals.service';
import { listAccounts } from '@/services/accounts.service';
import { listPeriods } from '@/services/periods.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const JOURNAL_TYPES = [
  'GENERAL', 'SALES', 'PURCHASE', 'CASH_RECEIPT',
  'CASH_PAYMENT', 'PAYROLL', 'DEPRECIATION', 'ADJUSTMENT', 'OPENING_BALANCE',
];

interface Line {
  id: number;
  accountId: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
}

function numVal(s: string) { return parseFloat(s) || 0; }

export function JournalCreatePage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const user = useAuthStore((s) => s.user);
  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const currency = activeOrg?.baseCurrency ?? 'USD';

  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState('GENERAL');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [periodId, setPeriodId] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { id: 1, accountId: '', description: '', debitAmount: '', creditAmount: '' },
    { id: 2, accountId: '', description: '', debitAmount: '', creditAmount: '' },
  ]);
  const [nextId, setNextId] = useState(3);
  const [initialized, setInitialized] = useState(false);

  const { data: existingJournal } = useQuery({
    queryKey: ['journal', activeOrganisationId, id],
    queryFn: () => getJournal(activeOrganisationId!, id!),
    enabled: isEdit && !!activeOrganisationId,
  });

  useEffect(() => {
    if (existingJournal && !initialized) {
      setType(existingJournal.type);
      setDescription(existingJournal.description);
      setReference(existingJournal.reference ?? '');
      setEntryDate(existingJournal.entryDate.slice(0, 10));
      if (existingJournal.periodId) setPeriodId(existingJournal.periodId);
      const mapped = (existingJournal.lines ?? []).map((l, i) => ({
        id: i + 1,
        accountId: l.accountId,
        description: l.description ?? '',
        debitAmount: parseFloat(l.debitAmount) > 0 ? l.debitAmount : '',
        creditAmount: parseFloat(l.creditAmount) > 0 ? l.creditAmount : '',
      }));
      if (mapped.length) {
        setLines(mapped);
        setNextId(mapped.length + 1);
      }
      setInitialized(true);
    }
  }, [existingJournal, initialized]);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', activeOrganisationId, 'posting'],
    queryFn: () => listAccounts(activeOrganisationId!, { pageSize: 500, isControlAccount: false }),
    enabled: !!activeOrganisationId,
  });

  const { data: periods } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const openPeriods = (periods ?? []).filter((p) => p.status === 'OPEN');

  const totalDebit = lines.reduce((s, l) => s + numVal(l.debitAmount), 0);
  const totalCredit = lines.reduce((s, l) => s + numVal(l.creditAmount), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0001 && totalDebit > 0;
  const imbalance = totalDebit - totalCredit;

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      { id: nextId, accountId: '', description: '', debitAmount: '', creditAmount: '' },
    ]);
    setNextId((n) => n + 1);
  }, [nextId]);

  const removeLine = useCallback((lineId: number) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }, []);

  const updateLine = useCallback((lineId: number, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        // Mutual exclusion: entering a debit clears credit and vice versa
        if (field === 'debitAmount' && value !== '')
          return { ...l, debitAmount: value, creditAmount: '' };
        if (field === 'creditAmount' && value !== '')
          return { ...l, debitAmount: '', creditAmount: value };
        return { ...l, [field]: value };
      }),
    );
  }, []);

  // Auto-balance: fill the last line's empty side to make totals equal
  const autoBalance = useCallback(() => {
    const lastLine = lines[lines.length - 1];
    if (!lastLine) return;
    const diff = Math.abs(imbalance);
    if (diff < 0.0001) return;
    if (imbalance > 0) {
      // debits > credits → add credit to last line
      setLines((prev) =>
        prev.map((l, i) =>
          i === prev.length - 1
            ? { ...l, debitAmount: '', creditAmount: diff.toFixed(2) }
            : l,
        ),
      );
    } else {
      // credits > debits → add debit to last line
      setLines((prev) =>
        prev.map((l, i) =>
          i === prev.length - 1
            ? { ...l, debitAmount: diff.toFixed(2), creditAmount: '' }
            : l,
        ),
      );
    }
  }, [lines, imbalance]);

  function buildPayload() {
    return {
      type,
      description,
      reference: reference || undefined,
      entryDate,
      periodId,
      currency,
      exchangeRate: 1,
      lines: lines
        .filter((l) => l.accountId)
        .map((l) => ({
          accountId: l.accountId,
          description: l.description || undefined,
          debitAmount: numVal(l.debitAmount),
          creditAmount: numVal(l.creditAmount),
          exchangeRate: 1,
        })),
    };
  }

  const saveMut = useMutation({
    mutationFn: async ({ submitAfter }: { submitAfter: boolean }) => {
      const payload = buildPayload();
      const entry = isEdit
        ? await updateJournal(activeOrganisationId!, id!, payload)
        : await createJournal(activeOrganisationId!, payload);
      if (submitAfter) await submitJournal(activeOrganisationId!, entry.id);
      return entry;
    },
    onSuccess: (entry, { submitAfter }) => {
      void navigate(submitAfter ? `/journals/${entry.id}` : '/journals');
    },
  });

  const accounts = accountsData?.accounts ?? [];
  const canSave = description && periodId && isBalanced && lines.some((l) => l.accountId);

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate(isEdit ? `/journals/${id}` : '/journals')}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">
            {isEdit ? 'Edit Journal Entry' : 'New Journal Entry'}
          </h1>
          <p className="text-sm text-muted-foreground">Double-entry — debits must equal credits</p>
        </div>
      </div>

      {/* Header fields */}
      <Card>
        <CardHeader><CardTitle>Entry Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block">Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {JOURNAL_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Entry Date *</label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Accounting Period *</label>
              {openPeriods.length === 0 ? (
                <p className="text-xs text-destructive mt-2">No open periods. Create a fiscal year first.</p>
              ) : (
                <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                  <option value="">Select period…</option>
                  {openPeriods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.fiscalYear})</option>
                  ))}
                </Select>
              )}
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-medium mb-1.5 block">Description *</label>
              <Input
                placeholder="What is this journal entry for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Reference</label>
              <Input
                placeholder="Invoice #, PO #, etc."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Journal Lines</CardTitle>
            <div className="flex items-center gap-2">
              {!isBalanced && totalDebit > 0 && (
                <button
                  onClick={autoBalance}
                  className="flex items-center gap-1 text-xs text-primary border border-primary/30 px-2 py-1 rounded hover:bg-primary/5"
                >
                  <Wand2 size={11} /> Auto-balance last line
                </button>
              )}
              <div
                className={cn(
                  'text-xs font-mono px-2 py-1 rounded-md',
                  isBalanced ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                )}
              >
                DR {totalDebit.toFixed(2)} / CR {totalCredit.toFixed(2)}
                {isBalanced ? ' ✓' : ' — unbalanced'}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-52">Account *</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-40">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-36">
                    Debit ({currency})
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-36">
                    Credit ({currency})
                  </th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={line.accountId}
                        onChange={(e) => updateLine(line.id, 'accountId', e.target.value)}
                        className="w-full text-xs border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select account…</option>
                        {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((cls) => {
                          const group = accounts.filter((a) => a.class === cls && a.isActive);
                          if (!group.length) return null;
                          return (
                            <optgroup key={cls} label={cls}>
                              {group.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                        placeholder="Optional note"
                        className="w-full text-xs border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={line.debitAmount}
                        onChange={(e) => updateLine(line.id, 'debitAmount', e.target.value)}
                        placeholder="0.00"
                        min={0}
                        step="0.01"
                        className={cn(
                          'w-full text-xs border border-input rounded-md px-2 py-1.5 bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring',
                          line.debitAmount ? 'font-semibold' : '',
                        )}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={line.creditAmount}
                        onChange={(e) => updateLine(line.id, 'creditAmount', e.target.value)}
                        placeholder="0.00"
                        min={0}
                        step="0.01"
                        className={cn(
                          'w-full text-xs border border-input rounded-md px-2 py-1.5 bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring',
                          line.creditAmount ? 'font-semibold' : '',
                        )}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {lines.length > 2 && (
                        <button
                          onClick={() => removeLine(line.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20">
                  <td colSpan={3} className="px-3 py-2">
                    <button
                      onClick={addLine}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Plus size={12} /> Add line
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                    {totalDebit.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                    {totalCredit.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {saveMut.isError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3 border border-destructive/20">
          <AlertCircle size={14} />
          {(saveMut.error as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? 'Failed to save journal entry'}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => void navigate(isEdit ? `/journals/${id}` : '/journals')}
        >
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!canSave || saveMut.isPending}
            onClick={() => saveMut.mutate({ submitAfter: false })}
          >
            {saveMut.isPending && !saveMut.variables?.submitAfter ? 'Saving…' : 'Save as Draft'}
          </Button>
          <Button
            disabled={!canSave || saveMut.isPending}
            onClick={() => saveMut.mutate({ submitAfter: true })}
          >
            {saveMut.isPending && saveMut.variables?.submitAfter ? 'Submitting…' : 'Save & Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}
