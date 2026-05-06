import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, BarChart3, RefreshCw, CheckCircle, XCircle, ClipboardList, AlertTriangle, Package, MapPin } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as inv from '@/services/inventory.service';
import { listAccounts } from '@/services/accounts.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const UNITS = ['unit', 'pcs', 'kg', 'g', 'litre', 'ml', 'box', 'carton', 'pair', 'set', 'hour', 'metre'];

const MOVEMENT_LABELS: Record<inv.MovementType, string> = {
  RECEIPT: 'Receipt', ISSUE: 'Issue', ADJUSTMENT_IN: 'Adj In', ADJUSTMENT_OUT: 'Adj Out',
  TRANSFER_IN: 'Transfer In', TRANSFER_OUT: 'Transfer Out',
  STOCKTAKE_IN: 'Stocktake +', STOCKTAKE_OUT: 'Stocktake −', OPENING: 'Opening Balance',
};

const MOVEMENT_VARIANT: Record<inv.MovementType, string> = {
  RECEIPT: 'success', ISSUE: 'warning', ADJUSTMENT_IN: 'default', ADJUSTMENT_OUT: 'warning',
  TRANSFER_IN: 'default', TRANSFER_OUT: 'default', STOCKTAKE_IN: 'default', STOCKTAKE_OUT: 'warning', OPENING: 'secondary',
};

const STATUS_VARIANT: Record<inv.MovementStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  POSTED: 'success', APPROVED: 'default' as any, PENDING: 'warning', REJECTED: 'destructive',
};

// ─── NewCategoryDialog ────────────────────────────────────────────────────────

function NewCategoryDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const mutation = useMutation({
    mutationFn: () => inv.createCategory(organisationId, { name: form.name, description: form.description || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['inv-categories', organisationId] }); setOpen(false); setForm({ name: '', description: '' }); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Category</Button></DialogTrigger>
      <DialogContent title="New Category" description="Add an inventory category.">
        <div className="space-y-3">
          <div><label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-8 text-xs" />
          </div>
          <div><label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-8 text-xs" />
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error'}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── NewLocationDialog ────────────────────────────────────────────────────────

function NewLocationDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const mutation = useMutation({
    mutationFn: () => inv.createLocation(organisationId, { name: form.name, description: form.description || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['inv-locations', organisationId] }); setOpen(false); setForm({ name: '', description: '' }); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Location</Button></DialogTrigger>
      <DialogContent title="New Location" description="Add a warehouse or storage location.">
        <div className="space-y-3">
          <div><label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Warehouse" className="h-8 text-xs" />
          </div>
          <div><label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-8 text-xs" />
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error'}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── NewItemDialog ────────────────────────────────────────────────────────────

function NewItemDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId, 'posting'], queryFn: () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false }), enabled: open });
  const { data: categories } = useQuery({ queryKey: ['inv-categories', organisationId], queryFn: () => inv.listCategories(organisationId), enabled: open });

  const [form, setForm] = useState({
    code: '', name: '', description: '', categoryId: '', unit: 'pcs',
    costMethod: 'WEIGHTED_AVERAGE' as inv.CostMethod,
    unitCost: '0', standardCost: '', reorderLevel: '', reorderQuantity: '',
    inventoryAccountId: '', cogsAccountId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const invAccounts = (accountsData?.accounts ?? []).filter((a) => a.type === 'INVENTORY' && a.isActive);
  const expAccounts = (accountsData?.accounts ?? []).filter((a) => (a.type === 'COST_OF_SALES' || a.class === 'EXPENSE') && a.isActive);

  const mutation = useMutation({
    mutationFn: () => inv.createItem(organisationId, {
      code: form.code, name: form.name,
      description: form.description || undefined,
      categoryId: form.categoryId || undefined,
      unit: form.unit, costMethod: form.costMethod,
      unitCost: form.unitCost,
      standardCost: form.standardCost || undefined,
      reorderLevel: form.reorderLevel || undefined,
      reorderQuantity: form.reorderQuantity || undefined,
      inventoryAccountId: form.inventoryAccountId || undefined,
      cogsAccountId: form.cogsAccountId || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['inventory', organisationId] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} /> New Item</Button></DialogTrigger>
      <DialogContent title="New Inventory Item" description="Add a stock item to the register.">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">SKU / Code *</label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="INV-001" className="h-8 text-xs" />
            </div>
            <div><label className="text-xs font-medium mb-1 block">Unit of Measure</label>
              <Select value={form.unit} onChange={(e) => set('unit', e.target.value)} className="h-8 text-xs">
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
          </div>
          <div><label className="text-xs font-medium mb-1 block">Name / Description *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Item name" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Category</label>
              <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className="h-8 text-xs">
                <option value="">No category</option>
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div><label className="text-xs font-medium mb-1 block">Costing Method</label>
              <Select value={form.costMethod} onChange={(e) => set('costMethod', e.target.value)} className="h-8 text-xs">
                <option value="WEIGHTED_AVERAGE">Weighted Average (AVCO)</option>
                <option value="FIFO">FIFO</option>
                <option value="STANDARD">Standard Cost</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">{form.costMethod === 'STANDARD' ? 'Opening Unit Cost' : 'Opening Unit Cost'}</label>
              <Input type="number" step="0.01" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} className="h-8 text-xs" />
            </div>
            {form.costMethod === 'STANDARD' && (
              <div><label className="text-xs font-medium mb-1 block">Standard Cost *</label>
                <Input type="number" step="0.01" value={form.standardCost} onChange={(e) => set('standardCost', e.target.value)} className="h-8 text-xs" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Reorder Level</label>
              <Input type="number" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} placeholder="Alert threshold" className="h-8 text-xs" />
            </div>
            <div><label className="text-xs font-medium mb-1 block">Reorder Quantity</label>
              <Input type="number" value={form.reorderQuantity} onChange={(e) => set('reorderQuantity', e.target.value)} placeholder="Suggested PO qty" className="h-8 text-xs" />
            </div>
          </div>
          {invAccounts.length > 0 && (
            <div><label className="text-xs font-medium mb-1 block">Inventory Control Account</label>
              <Select value={form.inventoryAccountId} onChange={(e) => set('inventoryAccountId', e.target.value)} className="h-8 text-xs w-full">
                <option value="">Select…</option>
                {invAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}
          {expAccounts.length > 0 && (
            <div><label className="text-xs font-medium mb-1 block">COGS / Cost of Sales Account</label>
              <Select value={form.cogsAccountId} onChange={(e) => set('cogsAccountId', e.target.value)} className="h-8 text-xs w-full">
                <option value="">Select…</option>
                {expAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error creating item'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.code || !form.name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save Item'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CreateMovementDialog ─────────────────────────────────────────────────────

function CreateMovementDialog({ organisationId, item, onSuccess }: { organisationId: string; item: inv.InventoryItem; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId, 'posting'], queryFn: () => listAccounts(organisationId, { pageSize: 300, isControlAccount: false }), enabled: open });
  const { data: periods } = useQuery({ queryKey: ['periods', organisationId, 'open'], queryFn: () => listPeriods(organisationId, { status: 'OPEN' }), enabled: open });
  const { data: locations } = useQuery({ queryKey: ['inv-locations', organisationId], queryFn: () => inv.listLocations(organisationId), enabled: open });

  const [form, setForm] = useState({
    movementType: 'RECEIPT' as inv.MovementType,
    quantity: '', unitCost: '', description: '', reference: '', reasonCode: '',
    contraAccountId: '', periodId: '', locationId: '',
    transactionDate: new Date().toISOString().slice(0, 10),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const needsUnitCost = ['RECEIPT', 'OPENING', 'ADJUSTMENT_IN'].includes(form.movementType);
  const needsContra = ['RECEIPT', 'ISSUE', 'OPENING', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(form.movementType);
  const needsReason = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(form.movementType);
  const allAccounts = (accountsData?.accounts ?? []).filter((a) => a.isActive);

  const mutation = useMutation({
    mutationFn: () => inv.createMovement(organisationId, {
      itemId: item.id,
      movementType: form.movementType,
      quantity: Number(form.quantity),
      unitCost: needsUnitCost && form.unitCost ? Number(form.unitCost) : undefined,
      description: form.description || undefined,
      reference: form.reference || undefined,
      reasonCode: form.reasonCode || undefined,
      contraAccountId: form.contraAccountId || undefined,
      periodId: form.periodId || undefined,
      locationId: form.locationId || undefined,
      transactionDate: form.transactionDate,
    }),
    onSuccess: () => { onSuccess(); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2">+ Movement</Button>
      </DialogTrigger>
      <DialogContent title={`Stock Movement — ${item.code}`} description={`${item.name} · Current: ${fmt(item.quantityOnHand)} ${item.unit}`}>
        <div className="space-y-3">
          <div><label className="text-xs font-medium mb-1 block">Type *</label>
            <Select value={form.movementType} onChange={(e) => set('movementType', e.target.value)} className="h-8 text-xs w-full">
              <option value="RECEIPT">Receipt (goods in)</option>
              <option value="ISSUE">Issue (goods out / COGS)</option>
              <option value="ADJUSTMENT_IN">Adjustment In (requires approval)</option>
              <option value="ADJUSTMENT_OUT">Adjustment Out / Write-off (requires approval)</option>
              <option value="OPENING">Opening Balance</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Quantity *</label>
              <Input type="number" step="0.001" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className="h-8 text-xs" />
            </div>
            {needsUnitCost && (
              <div><label className="text-xs font-medium mb-1 block">Unit Cost *</label>
                <Input type="number" step="0.01" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} className="h-8 text-xs" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Date *</label>
              <Input type="date" value={form.transactionDate} onChange={(e) => set('transactionDate', e.target.value)} className="h-8 text-xs" />
            </div>
            {locations && locations.length > 0 && (
              <div><label className="text-xs font-medium mb-1 block">Location</label>
                <Select value={form.locationId} onChange={(e) => set('locationId', e.target.value)} className="h-8 text-xs">
                  <option value="">Default</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </div>
            )}
          </div>
          {needsReason && (
            <div><label className="text-xs font-medium mb-1 block">Reason Code *</label>
              <Select value={form.reasonCode} onChange={(e) => set('reasonCode', e.target.value)} className="h-8 text-xs w-full">
                <option value="">Select reason…</option>
                {['DAMAGE', 'THEFT', 'EXPIRY', 'CORRECTION', 'WRITE_OFF', 'FOUND_STOCK', 'OTHER'].map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </Select>
            </div>
          )}
          <div><label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          {needsContra && (
            <div><label className="text-xs font-medium mb-1 block">Contra Account (for GL posting)</label>
              <Select value={form.contraAccountId} onChange={(e) => set('contraAccountId', e.target.value)} className="h-8 text-xs w-full">
                <option value="">None (skip GL posting)</option>
                {allAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}
          {needsContra && form.contraAccountId && (
            <div><label className="text-xs font-medium mb-1 block">Accounting Period</label>
              <Select value={form.periodId} onChange={(e) => set('periodId', e.target.value)} className="h-8 text-xs w-full">
                <option value="">Select period…</option>
                {(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          )}
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error'}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm"
              disabled={!form.quantity || (needsUnitCost && !form.unitCost) || (needsReason && !form.reasonCode) || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Posting…' : 'Submit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── StocktakeSessionView ─────────────────────────────────────────────────────

function StocktakeSessionView({ organisationId, session, onBack }: { organisationId: string; session: inv.StocktakeSession; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['stocktake-session', session.id],
    queryFn: () => inv.getStocktakeSession(organisationId, session.id),
  });
  const { data: periods } = useQuery({ queryKey: ['periods', organisationId, 'open'], queryFn: () => listPeriods(organisationId, { status: 'OPEN' }) });
  const [periodId, setPeriodId] = useState('');

  const updateCount = useMutation({
    mutationFn: ({ itemId, countedQuantity }: { itemId: string; countedQuantity: number }) =>
      inv.updateStocktakeCount(organisationId, session.id, itemId, { countedQuantity }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stocktake-session', session.id] }),
  });

  const postVariances = useMutation({
    mutationFn: () => inv.postStocktakeVariances(organisationId, session.id, periodId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocktake-session', session.id] });
      void qc.invalidateQueries({ queryKey: ['stocktake-sessions', organisationId] });
      void qc.invalidateQueries({ queryKey: ['inventory', organisationId] });
    },
  });

  const counts = data?.counts ?? [];
  const isLocked = data?.status === 'POSTED' || data?.status === 'CANCELLED';
  const allCounted = counts.every((c) => c.countedQuantity !== null);
  const variances = counts.filter((c) => c.varianceQuantity !== null && Number(c.varianceQuantity) !== 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <div>
            <p className="text-sm font-semibold">{session.name}</p>
            <p className="text-xs text-muted-foreground">{new Date(session.sessionDate).toLocaleDateString()} · {counts.length} items</p>
          </div>
          <Badge variant={session.status === 'POSTED' ? 'success' : session.status === 'CANCELLED' ? 'destructive' : 'warning'}>
            {session.status}
          </Badge>
        </div>
        {!isLocked && allCounted && variances.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-8 text-xs">
              <option value="">Select period…</option>
              {(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Button size="sm" disabled={!periodId || postVariances.isPending} onClick={() => postVariances.mutate()}>
              {postVariances.isPending ? 'Posting…' : `Post ${variances.length} Variance(s)`}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">System Qty</TableHead>
                  <TableHead className="text-right">Counted Qty</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => {
                  const variance = Number(c.varianceQuantity ?? 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.item?.code}</TableCell>
                      <TableCell className="text-sm">{c.item?.name}</TableCell>
                      <TableCell className="text-right text-xs">{fmt(c.systemQuantity)} {c.item?.unit}</TableCell>
                      <TableCell className="text-right">
                        {isLocked ? (
                          <span className="text-xs">{c.countedQuantity !== null ? fmt(c.countedQuantity) : '—'}</span>
                        ) : (
                          <Input
                            type="number" step="0.001"
                            defaultValue={c.countedQuantity !== null ? Number(c.countedQuantity) : ''}
                            className="h-7 text-xs w-24 text-right ml-auto"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val)) updateCount.mutate({ itemId: c.itemId, countedQuantity: val });
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className={cn('text-right text-xs font-medium', variance > 0 ? 'text-green-600' : variance < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {c.varianceQuantity !== null ? (variance > 0 ? '+' : '') + fmt(c.varianceQuantity) : '—'}
                      </TableCell>
                      <TableCell className={cn('text-right text-xs', Number(c.varianceValue ?? 0) < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {c.varianceValue !== null ? fmt(c.varianceValue) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── InventoryPage ────────────────────────────────────────────────────────────

export function InventoryPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'items' | 'movements' | 'valuation' | 'stocktake' | 'setup'>('items');
  const [search, setSearch] = useState('');
  const [movFilter, setMovFilter] = useState<inv.MovementStatus | ''>('');
  const [selectedStocktakeSession, setSelectedStocktakeSession] = useState<inv.StocktakeSession | null>(null);

  const orgId = activeOrganisationId!;

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory', orgId],
    queryFn: () => inv.listItems(orgId, { pageSize: 200 }),
    enabled: !!orgId && tab === 'items',
  });

  const { data: movData, isLoading: movLoading } = useQuery({
    queryKey: ['inv-movements', orgId, movFilter],
    queryFn: () => inv.listMovements(orgId, { status: movFilter || undefined, pageSize: 100 }),
    enabled: !!orgId && tab === 'movements',
  });

  const { data: valuation, isLoading: valLoading } = useQuery({
    queryKey: ['inv-valuation', orgId],
    queryFn: () => inv.getValuationReport(orgId),
    enabled: !!orgId && tab === 'valuation',
  });

  const { data: stocktakeSessions, isLoading: stocktakeLoading } = useQuery({
    queryKey: ['stocktake-sessions', orgId],
    queryFn: () => inv.listStocktakeSessions(orgId),
    enabled: !!orgId && tab === 'stocktake',
  });

  const { data: categories } = useQuery({ queryKey: ['inv-categories', orgId], queryFn: () => inv.listCategories(orgId), enabled: !!orgId && tab === 'setup' });
  const { data: locations } = useQuery({ queryKey: ['inv-locations', orgId], queryFn: () => inv.listLocations(orgId), enabled: !!orgId && tab === 'setup' });

  const approveMovement = useMutation({
    mutationFn: (id: string) => inv.approveMovement(orgId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inv-movements'] }),
  });

  const rejectMovement = useMutation({
    mutationFn: (id: string) => inv.rejectMovement(orgId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inv-movements'] }),
  });

  const items = (itemsData?.items ?? []).filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase()),
  );

  const pendingCount = (movData?.movements ?? []).filter((m) => m.status === 'PENDING').length;

  if (!orgId) return null;

  const tabs = [
    { id: 'items', label: 'Stock Items', icon: Archive },
    { id: 'movements', label: `Movements${pendingCount > 0 && tab !== 'movements' ? ` (${pendingCount} pending)` : ''}`, icon: RefreshCw },
    { id: 'valuation', label: 'Valuation', icon: BarChart3 },
    { id: 'stocktake', label: 'Stocktake', icon: ClipboardList },
    { id: 'setup', label: 'Setup', icon: Package },
  ] as const;

  // Stocktake session drill-in
  if (tab === 'stocktake' && selectedStocktakeSession) {
    return (
      <div className="p-6">
        <StocktakeSessionView
          organisationId={orgId}
          session={selectedStocktakeSession}
          onBack={() => setSelectedStocktakeSession(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Archive size={18} /> Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'items' && `${itemsData?.total ?? 0} items`}
            {tab === 'valuation' && `Total value: ${valuation ? fmt(valuation.grandTotal) : '—'}`}
            {tab === 'movements' && `${movData?.total ?? 0} movements`}
            {tab === 'stocktake' && 'Physical stock counts'}
            {tab === 'setup' && 'Categories and locations'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'items' && <NewItemDialog organisationId={orgId} />}
          {tab === 'setup' && <>
            <NewCategoryDialog organisationId={orgId} />
            <NewLocationDialog organisationId={orgId} />
          </>}
          {tab === 'stocktake' && <NewStocktakeDialog organisationId={orgId} onSuccess={() => void qc.invalidateQueries({ queryKey: ['stocktake-sessions', orgId] })} />}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setSearch(''); }}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── Items ─────────────────────────────────────────────────────────────── */}
      {tab === 'items' && (
        <>
          <Input placeholder="Search by code or name…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-8 text-xs" />
          <Card>
            <CardContent className="p-0">
              {itemsLoading ? (
                <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">No items found.</p>
                  <p className="text-xs text-muted-foreground">Click <strong>New Item</strong> to add stock items.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Qty on Hand</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const qty = Number(item.quantityOnHand);
                      const reorder = Number(item.reorderLevel ?? Infinity);
                      const isLow = reorder > 0 && qty <= reorder;
                      const value = Number(item.unitCost) * qty;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs font-medium text-muted-foreground">{item.code}</TableCell>
                          <TableCell className="text-sm font-medium">{item.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.inventoryCategory?.name ?? item.category ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.costMethod === 'WEIGHTED_AVERAGE' ? 'AVCO' : item.costMethod}
                          </TableCell>
                          <TableCell className="text-right text-xs">{fmt(item.unitCost)}</TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            <span className={cn(isLow && 'text-orange-500 font-semibold')}>
                              {fmt(qty)} {item.unit}
                              {isLow && <AlertTriangle size={10} className="inline ml-1" />}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs">{fmt(value)}</TableCell>
                          <TableCell><Badge variant={item.isActive ? 'success' : 'secondary'}>{item.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                          <TableCell>
                            <CreateMovementDialog
                              organisationId={orgId}
                              item={item}
                              onSuccess={() => void qc.invalidateQueries({ queryKey: ['inventory', orgId] })}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Movements ────────────────────────────────────────────────────────── */}
      {tab === 'movements' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(['', 'PENDING', 'APPROVED', 'POSTED', 'REJECTED'] as const).map((s) => (
              <button key={s} onClick={() => setMovFilter(s)}
                className={cn('px-3 py-1 text-xs rounded-md border', movFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                {s || 'All'}
              </button>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              {movLoading ? (
                <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (movData?.movements ?? []).length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No movements found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(movData?.movements ?? []).map((m) => (
                      <TableRow key={m.id} className={cn(m.status === 'PENDING' && 'bg-orange-50/30 dark:bg-orange-950/10')}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(m.transactionDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={MOVEMENT_VARIANT[m.movementType] as any} className="text-xs">{MOVEMENT_LABELS[m.movementType]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{m.item?.code} — {m.item?.name}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(m.quantity)} {m.item?.unit}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(m.unitCost)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold">{fmt(m.totalCost)}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[m.status]} className="text-xs">{m.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{m.description ?? m.reasonCode ?? '—'}</TableCell>
                        <TableCell>
                          {m.status === 'PENDING' && (
                            <div className="flex gap-1">
                              <Button size="sm" className="h-6 px-2 text-xs" disabled={approveMovement.isPending} onClick={() => approveMovement.mutate(m.id)}>
                                <CheckCircle size={11} /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" disabled={rejectMovement.isPending} onClick={() => rejectMovement.mutate(m.id)}>
                                <XCircle size={11} />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Valuation ────────────────────────────────────────────────────────── */}
      {tab === 'valuation' && (
        <div className="space-y-3">
          {valLoading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <p className="text-sm font-medium">Stock Valuation Report (IAS 2)</p>
                <p className="text-xs text-muted-foreground">Current quantities at cost · Grand Total: <strong>{valuation ? fmt(valuation.grandTotal) : '—'}</strong></p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Qty on Hand</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(valuation?.items ?? []).map((item) => (
                      <TableRow key={item.itemId}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{item.code}</TableCell>
                        <TableCell className="text-sm font-medium">{item.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.category ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.costMethod === 'WEIGHTED_AVERAGE' ? 'AVCO' : item.costMethod}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(item.quantityOnHand)} {item.unit}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(item.unitCost)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold">{fmt(item.totalValue)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/30">
                      <TableCell colSpan={6} className="text-right text-sm">Grand Total</TableCell>
                      <TableCell className="text-right text-sm">{valuation ? fmt(valuation.grandTotal) : '—'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Stocktake ─────────────────────────────────────────────────────────── */}
      {tab === 'stocktake' && (
        <Card>
          <CardContent className="p-0">
            {stocktakeLoading ? (
              <div className="p-6 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (stocktakeSessions ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No stocktake sessions yet.</p>
                <p className="text-xs text-muted-foreground">Create a session to perform a physical count.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stocktakeSessions ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.sessionDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.location?.name ?? 'All locations'}</TableCell>
                      <TableCell className="text-xs">{s._count?.counts ?? 0} items</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'POSTED' ? 'success' : s.status === 'CANCELLED' ? 'destructive' : 'warning'}>{s.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => setSelectedStocktakeSession(s)} className="text-xs text-primary hover:underline">
                          {s.status === 'POSTED' ? 'View' : 'Enter Counts'} →
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Setup ─────────────────────────────────────────────────────────────── */}
      {tab === 'setup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <CardHeader className="pb-2"><p className="text-sm font-semibold flex items-center gap-1.5"><Package size={14} /> Categories</p></CardHeader>
            <CardContent className="p-0">
              {(categories ?? []).length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground text-center">No categories yet.</p>
              ) : (
                <Table>
                  <TableBody>
                    {(categories ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{c.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.description ?? '—'}</TableCell>
                        <TableCell><Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><p className="text-sm font-semibold flex items-center gap-1.5"><MapPin size={14} /> Locations</p></CardHeader>
            <CardContent className="p-0">
              {(locations ?? []).length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground text-center">No locations yet. Movements default to a global balance if no location is set.</p>
              ) : (
                <Table>
                  <TableBody>
                    {(locations ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm">{l.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.description ?? '—'}</TableCell>
                        <TableCell><Badge variant={l.isActive ? 'success' : 'secondary'}>{l.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── NewStocktakeDialog ───────────────────────────────────────────────────────
// (declared after InventoryPage to avoid hoisting issues with JSX)

function NewStocktakeDialog({ organisationId, onSuccess }: { organisationId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: locations } = useQuery({ queryKey: ['inv-locations', organisationId], queryFn: () => inv.listLocations(organisationId), enabled: open });
  const [form, setForm] = useState({ name: '', sessionDate: new Date().toISOString().slice(0, 10), locationId: '', notes: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => inv.createStocktakeSession(organisationId, {
      name: form.name,
      sessionDate: form.sessionDate,
      locationId: form.locationId || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => { onSuccess(); setOpen(false); setForm({ name: '', sessionDate: new Date().toISOString().slice(0, 10), locationId: '', notes: '' }); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><ClipboardList size={14} /> New Stocktake</Button></DialogTrigger>
      <DialogContent title="New Stocktake Session" description="Creates a count snapshot of current stock. Staff will enter physical counts and variances will be posted.">
        <div className="space-y-3">
          <div><label className="text-xs font-medium mb-1 block">Session Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Q1 2026 Stocktake" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Count Date *</label>
              <Input type="date" value={form.sessionDate} onChange={(e) => set('sessionDate', e.target.value)} className="h-8 text-xs" />
            </div>
            <div><label className="text-xs font-medium mb-1 block">Location (optional)</label>
              <Select value={form.locationId} onChange={(e) => set('locationId', e.target.value)} className="h-8 text-xs">
                <option value="">All locations</option>
                {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
          </div>
          <div><label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} className="h-8 text-xs" />
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{(mutation.error as any)?.response?.data?.message ?? 'Error'}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!form.name || !form.sessionDate || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create Session'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
