import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, BookOpen, Download, CheckCircle, Plus, Pencil, Lock,
  LockOpen, PowerOff, Trash2, ShieldAlert, Landmark, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listAccounts, createAccount, updateAccount, deleteAccount, importTemplate,
  ACCOUNT_TYPES_BY_CLASS, type Account,
} from '@/services/accounts.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASSES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

const CLASS_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ASSET: 'info', LIABILITY: 'destructive', EQUITY: 'warning', REVENUE: 'success', EXPENSE: 'secondary',
};

const TEMPLATES = [
  { value: 'technology', label: 'Technology / SaaS' },
  { value: 'services', label: 'Professional Services' },
  { value: 'retail', label: 'Retail' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'manufacturing', label: 'Manufacturing' },
];

// ─── Import Template Dialog ───────────────────────────────────────────────────

function ImportTemplateDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('technology');
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => importTemplate(organisationId, template),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['accounts'] }); setTimeout(() => setOpen(false), 1200); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Download size={14} /> Import Template</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" title="Import Chart of Accounts" description="Load a pre-built IFRS-compliant account structure for your industry.">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Industry Template</label>
            <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Import failed'}
            </p>
          )}
          {mutation.isSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle size={14} /> Template imported successfully</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Account Form Dialog (Create / Edit) ─────────────────────────────────────

interface AccountFormProps {
  organisationId: string;
  account?: Account | null;
  allAccounts: Account[];
  onClose: () => void;
}

function AccountFormDialog({ organisationId, account, allAccounts, onClose }: AccountFormProps) {
  const qc = useQueryClient();
  const isEdit = !!account;

  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [accountClass, setAccountClass] = useState(account?.class ?? 'ASSET');
  const [type, setType] = useState(account?.type ?? '');
  const [subClass, setSubClass] = useState(account?.subClass ?? '');
  const [parentId, setParentId] = useState(account?.parentId ?? '');
  const [description, setDescription] = useState(account?.description ?? '');
  const [isControlAccount, setIsControlAccount] = useState(account?.isControlAccount ?? false);
  const [isBankAccount, setIsBankAccount] = useState(account?.isBankAccount ?? false);

  // Reset type when class changes
  useEffect(() => {
    const types = ACCOUNT_TYPES_BY_CLASS[accountClass] ?? [];
    if (!types.find((t) => t.value === type)) setType(types[0]?.value ?? '');
  }, [accountClass]);

  // Eligible parents: same class, not self, not a child of self
  const eligibleParents = allAccounts.filter(
    (a) => a.class === accountClass && a.id !== account?.id && a.isActive,
  );

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? updateAccount(organisationId, account!.id, { name: name.trim(), type, subClass: subClass.trim() || undefined, parentId: parentId || null, description: description.trim() || undefined, isControlAccount, isBankAccount })
      : createAccount(organisationId, { code: code.trim(), name: name.trim(), class: accountClass, type, subClass: subClass.trim() || undefined, parentId: parentId || null, description: description.trim() || undefined, isControlAccount, isBankAccount }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
  });

  const canSubmit = name.trim().length > 0 && type.length > 0 && (isEdit || code.trim().length > 0);
  const types = ACCOUNT_TYPES_BY_CLASS[accountClass] ?? [];

  return (
    <DialogContent className="max-w-lg" title={isEdit ? 'Edit Account' : 'New Account'} description={isEdit ? 'Update account details.' : 'Add a new account to the chart of accounts.'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Code — locked on edit */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Account Code *</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 1100"
              className="h-8 text-xs font-mono"
              disabled={isEdit}
            />
          </div>
          {/* Class — locked on edit */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Class *</label>
            <Select value={accountClass} onChange={(e) => setAccountClass(e.target.value)} className="h-8 text-xs" disabled={isEdit}>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-xs font-medium">Account Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trade Receivables" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Type *</label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="h-8 text-xs">
              <option value="">Select type…</option>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Sub-class</label>
            <Input value={subClass} onChange={(e) => setSubClass(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-xs font-medium">Parent Account</label>
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-8 text-xs">
              <option value="">None (top-level)</option>
              {eligibleParents.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-xs font-medium">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="h-8 text-xs" />
          </div>
        </div>

        {/* Flags */}
        <div className="flex gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={isControlAccount} onChange={(e) => setIsControlAccount(e.target.checked)} className="rounded" />
            <ShieldAlert size={12} className="text-amber-500" />
            Control Account
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={isBankAccount} onChange={(e) => setIsBankAccount(e.target.checked)} className="rounded" />
            <Landmark size={12} className="text-blue-500" />
            Bank Account
          </label>
        </div>

        {isControlAccount && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            Control accounts only receive postings through AR/AP sub-ledgers — direct journal entries are blocked.
          </div>
        )}

        {mutation.isError && (
          <p className="text-xs text-destructive">
            {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to save account'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <DialogClose asChild><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button></DialogClose>
          <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({ organisationId, account, onClose }: { organisationId: string; account: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteAccount(organisationId, account.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['accounts'] }); onClose(); },
  });

  return (
    <DialogContent className="max-w-sm" title="Delete Account" description="This action cannot be undone.">
      <div className="space-y-4">
        <p className="text-sm">
          Delete <span className="font-semibold font-mono">{account.code}</span> — <span className="font-semibold">{account.name}</span>?
        </p>
        <p className="text-xs text-muted-foreground">Accounts with posted transactions cannot be deleted — they can only be deactivated.</p>
        {mutation.isError && (
          <p className="text-xs text-destructive">
            {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Delete failed'}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <DialogClose asChild><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button></DialogClose>
          <Button size="sm" variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Deleting…' : 'Delete Account'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Row Actions ──────────────────────────────────────────────────────────────

function AccountRowActions({ account, organisationId, onEdit }: {
  account: Account;
  organisationId: string;
  allAccounts?: Account[];
  onEdit: (a: Account) => void;
}) {
  const qc = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);

  const toggleActive = useMutation({
    mutationFn: () => updateAccount(organisationId, account.id, { isActive: !account.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const toggleLock = useMutation({
    mutationFn: () => updateAccount(organisationId, account.id, { isLocked: !account.isLocked }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Edit */}
      <button
        onClick={() => onEdit(account)}
        title="Edit account"
        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        <Pencil size={13} />
      </button>

      {/* Lock / Unlock */}
      <button
        onClick={() => toggleLock.mutate()}
        title={account.isLocked ? 'Unlock account' : 'Lock account'}
        className={cn('p-1.5 rounded hover:bg-accent', account.isLocked ? 'text-destructive hover:text-destructive' : 'text-muted-foreground hover:text-foreground')}
        disabled={toggleLock.isPending}
      >
        {account.isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>

      {/* Activate / Deactivate */}
      <button
        onClick={() => toggleActive.mutate()}
        title={account.isActive ? 'Deactivate account' : 'Activate account'}
        className={cn('p-1.5 rounded hover:bg-accent', !account.isActive ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground hover:text-amber-600')}
        disabled={toggleActive.isPending || account.isLocked}
      >
        <PowerOff size={13} />
      </button>

      {/* Delete */}
      <button
        onClick={() => setShowDelete(true)}
        title="Delete account"
        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={13} />
      </button>

      {showDelete && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowDelete(false); }}>
          <DeleteConfirmDialog organisationId={organisationId} account={account} onClose={() => setShowDelete(false)} />
        </Dialog>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AccountsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null | undefined>(undefined); // undefined = closed, null = new

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', activeOrganisationId, classFilter],
    queryFn: () => listAccounts(activeOrganisationId!, { class: classFilter || undefined, pageSize: 500 }),
    enabled: !!activeOrganisationId,
  });

  const allAccounts = data?.accounts ?? [];

  const accounts = allAccounts.filter((a) => {
    if (!showInactive && !a.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><BookOpen size={18} /> Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} accounts</p>
        </div>
        <div className="flex items-center gap-2">
          {activeOrganisationId && <ImportTemplateDialog organisationId={activeOrganisationId} />}
          <Button size="sm" onClick={() => setEditAccount(null)}>
            <Plus size={14} /> New Account
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search by code or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['', ...CLASSES] as string[]).map((cls) => (
                <button
                  key={cls || 'all'}
                  onClick={() => setClassFilter(cls)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    classFilter === cls
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent',
                  )}
                >
                  {cls || 'All'}
                </button>
              ))}
              <button
                onClick={() => setShowInactive((v) => !v)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors ml-2',
                  showInactive
                    ? 'bg-muted text-foreground border-border'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent',
                )}
              >
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No accounts found.</p>
              {allAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Use <strong>Import Template</strong> to load a pre-built chart, or <strong>New Account</strong> to add manually.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-20 text-center">Flags</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow
                    key={account.id}
                    className={cn('group', !account.isActive && 'opacity-50')}
                  >
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                      {account.code}
                    </TableCell>
                    <TableCell>
                      <span
                        style={{ paddingLeft: `${(account.level - 1) * 16}px` }}
                        className={cn('text-sm', account.level === 1 && 'font-semibold')}
                      >
                        {account.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={CLASS_VARIANT[account.class] ?? 'secondary'} className="text-[10px]">
                        {account.class}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {account.type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {account.isControlAccount && (
                          <span title="Control account — no direct journal postings">
                            <ShieldAlert size={13} className="text-amber-500" />
                          </span>
                        )}
                        {account.isBankAccount && (
                          <span title="Bank account">
                            <Landmark size={13} className="text-blue-500" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {account.isLocked ? (
                        <Badge variant="destructive" className="text-[10px] gap-1"><Lock size={9} /> Locked</Badge>
                      ) : account.isActive ? (
                        <Badge variant="success" className="text-[10px]">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {activeOrganisationId && (
                        <AccountRowActions
                          account={account}
                          organisationId={activeOrganisationId}
                          allAccounts={allAccounts}
                          onEdit={(a) => setEditAccount(a)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      {editAccount !== undefined && activeOrganisationId && (
        <Dialog open onOpenChange={(open) => { if (!open) setEditAccount(undefined); }}>
          <AccountFormDialog
            organisationId={activeOrganisationId}
            account={editAccount}
            allAccounts={allAccounts}
            onClose={() => setEditAccount(undefined)}
          />
        </Dialog>
      )}
    </div>
  );
}
