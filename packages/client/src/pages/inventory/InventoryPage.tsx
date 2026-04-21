import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, BarChart3 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listItems, createItem, receiveStock, issueStock, getValuationReport } from '@/services/inventory.service';
import { listAccounts } from '@/services/accounts.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function NewItemDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId],
    queryFn: () => listAccounts(organisationId, { pageSize: 200 }),
    enabled: open,
  });
  const [form, setForm] = useState({
    code: '', name: '', description: '', category: '', unit: 'unit',
    costMethod: 'WEIGHTED_AVERAGE', unitCost: '0', reorderLevel: '',
    inventoryAccountId: '', cogsAccountId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const inventoryAccounts = (accountsData?.accounts ?? []).filter((a) => a.type === 'INVENTORY' && a.isActive);
  const expenseAccounts = (accountsData?.accounts ?? []).filter((a) => a.class === 'EXPENSE' && a.isActive);

  const mutation = useMutation({
    mutationFn: () => createItem(organisationId, {
      ...form,
      unitCost: Number(form.unitCost),
      reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : undefined,
      inventoryAccountId: form.inventoryAccountId || undefined,
      cogsAccountId: form.cogsAccountId || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['inventory'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Item</Button>
      </DialogTrigger>
      <DialogContent title="New Inventory Item" description="Add a stock item to the inventory register.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="INV001" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Unit</label>
              <Select value={form.unit} onChange={(e) => set('unit', e.target.value)} className="h-8 text-xs">
                {['unit', 'kg', 'g', 'litre', 'ml', 'box', 'carton', 'piece', 'pair', 'set', 'hour'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Item name" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Category</label>
              <Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Raw Materials" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Cost Method</label>
              <Select value={form.costMethod} onChange={(e) => set('costMethod', e.target.value)} className="h-8 text-xs">
                <option value="WEIGHTED_AVERAGE">Weighted Average</option>
                <option value="FIFO">FIFO</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Unit Cost</label>
              <Input type="number" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Reorder Level</label>
              <Input type="number" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} placeholder="Optional" className="h-8 text-xs" />
            </div>
          </div>
          {inventoryAccounts.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">Inventory Account</label>
              <Select value={form.inventoryAccountId} onChange={(e) => set('inventoryAccountId', e.target.value)} className="h-8 text-xs">
                <option value="">Auto-select</option>
                {inventoryAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}
          {expenseAccounts.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">COGS Account</label>
              <Select value={form.cogsAccountId} onChange={(e) => set('cogsAccountId', e.target.value)} className="h-8 text-xs">
                <option value="">Auto-select</option>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </Select>
            </div>
          )}
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
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

function StockMovementDialog({
  organisationId, itemId, itemName, type,
}: { organisationId: string; itemId: string; itemName: string; type: 'receive' | 'issue' }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => type === 'receive'
      ? receiveStock(organisationId, itemId, { quantity: Number(quantity), unitCost: Number(unitCost), notes: notes || undefined })
      : issueStock(organisationId, itemId, { quantity: Number(quantity), notes: notes || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      setOpen(false); setQuantity(''); setUnitCost(''); setNotes('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={cn('text-xs hover:underline', type === 'receive' ? 'text-green-600' : 'text-orange-500')}>
          {type === 'receive' ? 'Receive' : 'Issue'}
        </button>
      </DialogTrigger>
      <DialogContent title={type === 'receive' ? `Receive Stock — ${itemName}` : `Issue Stock — ${itemName}`} description="">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Quantity *</label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="h-8 text-xs" />
          </div>
          {type === 'receive' && (
            <div>
              <label className="text-xs font-medium mb-1 block">Unit Cost *</label>
              <Input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" className="h-8 text-xs" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm"
              disabled={!quantity || (type === 'receive' && !unitCost) || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Processing…' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InventoryPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'items' | 'valuation'>('items');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', activeOrganisationId],
    queryFn: () => listItems(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'items',
  });

  const { data: valuation, isLoading: valLoading } = useQuery({
    queryKey: ['inventory-valuation', activeOrganisationId],
    queryFn: () => getValuationReport(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'valuation',
  });

  const items = (data?.items ?? []).filter(
    (i) => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase()),
  );

  const grandTotal = (valuation ?? []).reduce((s, i) => s + Number(i.totalValue), 0);

  const tabs = [
    { id: 'items', label: 'Stock Items', icon: Archive },
    { id: 'valuation', label: 'Valuation Report', icon: BarChart3 },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Archive size={18} /> Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'items' ? `${data?.total ?? 0} stock items` : 'Inventory Valuation (IAS 2)'}
          </p>
        </div>
        {tab === 'items' && activeOrganisationId && <NewItemDialog organisationId={activeOrganisationId} />}
      </div>

      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setSearch(''); }}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <>
          <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-8 text-xs" />
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
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
                      <TableHead className="w-24">Code</TableHead>
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
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs font-medium text-muted-foreground">{item.code}</TableCell>
                        <TableCell className="text-sm font-medium">{item.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.category ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.costMethod.replace('_', ' ')}</TableCell>
                        <TableCell className="text-right text-xs">{Number(item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          <span className={cn(Number(item.quantityOnHand) <= Number(item.reorderLevel ?? Infinity) && Number(item.reorderLevel) > 0 ? 'text-orange-500' : '')}>
                            {Number(item.quantityOnHand).toLocaleString(undefined, { minimumFractionDigits: 2 })} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {(Number(item.unitCost) * Number(item.quantityOnHand)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.isActive ? 'success' : 'secondary'}>{item.isActive ? 'Active' : 'Inactive'}</Badge>
                        </TableCell>
                        <TableCell>
                          {activeOrganisationId && (
                            <div className="flex gap-3">
                              <StockMovementDialog organisationId={activeOrganisationId} itemId={item.id} itemName={item.name} type="receive" />
                              <StockMovementDialog organisationId={activeOrganisationId} itemId={item.id} itemName={item.name} type="issue" />
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
        </>
      )}

      {tab === 'valuation' && (
        <div className="space-y-4">
          {valLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium">Inventory Valuation Report</p>
                  <p className="text-xs text-muted-foreground">Total inventory value: <strong>{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(valuation ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs font-medium text-muted-foreground">{item.code}</TableCell>
                          <TableCell className="text-sm font-medium">{item.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.category ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.costMethod.replace('_', ' ')}</TableCell>
                          <TableCell className="text-right text-xs">{Number(item.quantityOnHand).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right text-xs">{Number(item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right text-xs font-semibold">{Number(item.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <div className="text-sm font-bold border-t pt-2">
                  Grand Total: {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
