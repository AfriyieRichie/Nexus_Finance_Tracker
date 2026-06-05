import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Plus, Trash2, Eye, Printer, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as poSvc from '@/services/po.service';
import type { PurchaseOrder, PurchaseOrderStatus, PoLineInput } from '@/services/po.service';
import { listSuppliers } from '@/services/ap.service';
import { listAccounts } from '@/services/accounts.service';
import { listTaxCodes } from '@/services/tax.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AccountSelect } from '@/components/ui/account-select';
import { AttachmentsDialog } from '@/components/ui/attachments';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'An error occurred';
}

const STATUS_VARIANT: Record<PurchaseOrderStatus, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  DRAFT: 'secondary', PENDING_APPROVAL: 'warning', APPROVED: 'info',
  PARTIALLY_BILLED: 'warning', BILLED: 'success', CLOSED: 'secondary', CANCELLED: 'destructive',
};

const EMPTY_LINE: PoLineInput & { _tax: string } = { description: '', quantity: 1, unitPrice: 0, accountId: undefined, taxCode: undefined, taxAmount: 0, _tax: '' };

// ─── New / Edit PO dialog ──────────────────────────────────────────────────────

function PoFormDialog({ organisationId, po, trigger }: { organisationId: string; po?: poSvc.PurchaseOrderDetail; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? '');
  const [orderDate, setOrderDate] = useState(po?.orderDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState(po?.expectedDate?.split('T')[0] ?? '');
  const [currency, setCurrency] = useState(po?.currency ?? 'GHS');
  const [notes, setNotes] = useState(po?.notes ?? '');
  const [lines, setLines] = useState<(PoLineInput & { _tax: string })[]>(
    po ? po.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), accountId: l.accountId ?? undefined, taxCode: l.taxCode ?? undefined, taxAmount: Number(l.taxAmount), _tax: l.taxCode ?? '' }))
       : [{ ...EMPTY_LINE }],
  );

  const { data: suppliersData } = useQuery({ queryKey: ['ap-suppliers', organisationId], queryFn: () => listSuppliers(organisationId), enabled: open });
  const suppliers = suppliersData?.suppliers ?? [];
  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId], queryFn: () => listAccounts(organisationId, { pageSize: 300 } as Parameters<typeof listAccounts>[1]), enabled: open });
  const expenseAccounts = (accountsData?.accounts ?? []).filter((a) => (a.class === 'EXPENSE' || a.class === 'ASSET') && a.isActive && !a.isControlAccount);
  const { data: taxCodes = [] } = useQuery({ queryKey: ['tax-codes', organisationId], queryFn: () => listTaxCodes(organisationId), enabled: open });

  const setLine = (i: number, patch: Partial<PoLineInput & { _tax: string }>) =>
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, ...patch };
      if ('taxCode' in patch || 'quantity' in patch || 'unitPrice' in patch) {
        const rate = Number(taxCodes.find((t) => t.code === next.taxCode)?.rate ?? 0);
        next.taxAmount = Math.round(next.quantity * next.unitPrice * (rate / 100) * 10000) / 10000;
      }
      return next;
    }));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        supplierId, orderDate, expectedDate: expectedDate || undefined, currency, notes: notes || undefined,
        lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, accountId: l.accountId, taxCode: l.taxCode, taxAmount: l.taxAmount })),
      };
      return po ? poSvc.updatePurchaseOrder(organisationId, po.id, payload) : poSvc.createPurchaseOrder(organisationId, payload);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['purchase-orders'] }); setOpen(false); },
  });

  const canSave = supplierId && orderDate && lines.every((l) => l.description && l.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl" title={po ? `Edit ${po.poNumber}` : 'New Purchase Order'} description="Raise a purchase order to a supplier.">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Supplier *</label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-8 text-xs">
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </Select></div>
            <div><label className="text-xs font-medium mb-1 block">Currency</label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 text-xs">
                {['GHS', 'USD', 'EUR', 'GBP', 'NGN'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select></div>
            <div><label className="text-xs font-medium mb-1 block">Order Date *</label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="h-8 text-xs" /></div>
            <div><label className="text-xs font-medium mb-1 block">Expected Date</label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="h-8 text-xs" /></div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Line items</label>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50"><tr>
                  <th className="text-left px-2 py-1.5">Description</th>
                  <th className="text-right px-2 py-1.5 w-16">Qty</th>
                  <th className="text-right px-2 py-1.5 w-24">Unit Price</th>
                  <th className="text-left px-2 py-1.5 w-40">Account</th>
                  <th className="text-left px-2 py-1.5 w-24">Tax</th>
                  <th className="text-right px-2 py-1.5 w-24">Total</th>
                  <th className="w-8" />
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1"><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Item / service" className="h-7 text-xs" /></td>
                      <td className="px-2 py-1"><Input type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
                      <td className="px-2 py-1"><Input type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
                      <td className="px-2 py-1"><AccountSelect value={l.accountId ?? ''} onChange={(id) => setLine(i, { accountId: id })} accounts={expenseAccounts} placeholder="—" /></td>
                      <td className="px-2 py-1">
                        <Select value={l.taxCode ?? ''} onChange={(e) => setLine(i, { taxCode: e.target.value || undefined })} className="h-7 text-xs">
                          <option value="">None</option>
                          {taxCodes.map((t) => <option key={t.id} value={t.code}>{t.code} ({t.rate}%)</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(l.quantity * l.unitPrice + (l.taxAmount ?? 0))}</td>
                      <td className="px-2 py-1 text-center">
                        {lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="text-destructive"><Trash2 size={13} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}><Plus size={13} /> Add line</Button>
          </div>

          <div className="flex justify-end">
            <div className="text-xs space-y-1 w-48">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(taxTotal)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{fmt(subtotal + taxTotal)} {currency}</span></div>
            </div>
          </div>

          <div><label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, terms…" className="h-8 text-xs" /></div>

          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : po ? 'Save changes' : 'Create PO'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail / actions dialog ───────────────────────────────────────────────────

function PoDetailDialog({ organisationId, poId, canApprove, trigger }: { organisationId: string; poId: string; canApprove: boolean; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const { data: po, isLoading } = useQuery({ queryKey: ['purchase-order', poId], queryFn: () => poSvc.getPurchaseOrder(organisationId, poId), enabled: open });
  const { data: periodsData } = useQuery({ queryKey: ['periods', organisationId], queryFn: () => listPeriods(organisationId), enabled: open });
  const hasOpenPeriod = (periodsData ?? []).some((p) => p.status === 'OPEN');

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['purchase-orders'] }); void qc.invalidateQueries({ queryKey: ['purchase-order', poId] }); };

  const submit = useMutation({ mutationFn: () => poSvc.submitPoForApproval(organisationId, poId), onSuccess: invalidate });
  const approve = useMutation({ mutationFn: () => poSvc.approvePo(organisationId, poId), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: () => poSvc.rejectPo(organisationId, poId, reason), onSuccess: () => { setRejecting(false); setReason(''); invalidate(); } });
  const cancel = useMutation({ mutationFn: () => poSvc.cancelPo(organisationId, poId), onSuccess: invalidate });
  const convert = useMutation({ mutationFn: () => poSvc.convertPoToBill(organisationId, poId, {}), onSuccess: () => { invalidate(); void qc.invalidateQueries({ queryKey: ['ap-invoices'] }); } });

  const printPo = () => {
    if (!po) return;
    const lineRows = po.lines.map((l) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${l.description}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(l.quantity)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(l.unitPrice)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(l.lineTotal)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>${po.poNumber}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;padding:24px;color:#111;"><h2 style="margin:0;">Purchase Order ${po.poNumber}</h2><p style="color:#666;">Supplier: ${po.supplier?.name ?? ''} · Order date: ${new Date(po.orderDate).toLocaleDateString()} · ${po.currency}</p><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;border-bottom:2px solid #333;padding:6px 8px;">Description</th><th style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;">Qty</th><th style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;">Unit</th><th style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;">Total</th></tr></thead><tbody>${lineRows}<tr style="font-weight:bold;"><td colspan="3" style="padding:6px 8px;text-align:right;">Total</td><td style="padding:6px 8px;text-align:right;">${fmt(po.totalAmount)} ${po.currency}</td></tr></tbody></table>${po.notes ? `<p style="margin-top:16px;color:#444;">Notes: ${po.notes}</p>` : ''}</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  const anyError = submit.error ?? approve.error ?? reject.error ?? cancel.error ?? convert.error;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl" title={po ? `Purchase Order ${po.poNumber}` : 'Purchase Order'} description="">
        {isLoading || !po ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><p className="text-muted-foreground">Supplier</p><p className="font-medium">{po.supplier?.name}</p></div>
              <div><p className="text-muted-foreground">Status</p><Badge variant={STATUS_VARIANT[po.status]}>{po.status.replace(/_/g, ' ')}</Badge></div>
              <div><p className="text-muted-foreground">Order Date</p><p>{new Date(po.orderDate).toLocaleDateString()}</p></div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50"><tr><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Unit</th><th className="text-right px-3 py-2">Billed</th><th className="text-right px-3 py-2">Total</th></tr></thead>
                <tbody>
                  {po.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-right">{fmt(l.quantity)}</td>
                      <td className="px-3 py-2 text-right">{fmt(l.unitPrice)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmt(l.quantityBilled)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end text-xs"><div className="w-48 flex justify-between font-semibold"><span>Total</span><span>{fmt(po.totalAmount)} {po.currency}</span></div></div>

            {po.invoices.length > 0 && (
              <div className="border-t pt-2">
                <p className="text-xs font-semibold mb-1">Linked bills</p>
                {po.invoices.map((inv) => (
                  <div key={inv.id} className="flex justify-between text-xs text-muted-foreground"><span>{inv.invoiceNumber} · {inv.status}</span><span>{fmt(inv.totalAmount)}</span></div>
                ))}
              </div>
            )}

            {anyError && <p className="text-xs text-destructive">{errMsg(anyError)}</p>}
            {!hasOpenPeriod && po.status === 'APPROVED' && <p className="text-[11px] text-amber-600">No open accounting period — the bill can be created but you'll need an open period to post it.</p>}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={printPo}><Printer size={14} /> Print</Button>
              {po.status === 'DRAFT' && (
                <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? 'Submitting…' : 'Submit for approval'}</Button>
              )}
              {po.status === 'PENDING_APPROVAL' && canApprove && (
                <>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setRejecting((v) => !v)}>Reject</Button>
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? 'Approving…' : 'Approve'}</Button>
                </>
              )}
              {(po.status === 'APPROVED' || po.status === 'PARTIALLY_BILLED') && (
                <Button size="sm" disabled={convert.isPending} onClick={() => convert.mutate()}><FileText size={14} /> {convert.isPending ? 'Creating bill…' : 'Convert to bill'}</Button>
              )}
              {!['BILLED', 'CANCELLED'].includes(po.status) && (
                <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel PO</Button>
              )}
            </div>
            {rejecting && (
              <div className="flex items-center gap-2 justify-end">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection…" className="h-8 text-xs w-64" />
                <Button size="sm" variant="outline" className="text-destructive" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>Confirm reject</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function PurchaseOrdersPage() {
  const orgId = useAuthStore((s) => s.activeOrganisationId) ?? '';
  const user = useAuthStore((s) => s.user);
  const role = user?.organisations.find((o) => o.organisationId === orgId)?.role;
  const canApprove = role === 'FINANCE_MANAGER' || role === 'ORG_ADMIN' || role === 'SUPER_ADMIN';
  const [statusFilter, setStatusFilter] = useState('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders', orgId, statusFilter],
    queryFn: () => poSvc.listPurchaseOrders(orgId, { status: statusFilter || undefined }),
    enabled: !!orgId,
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><ShoppingBag size={18} /> Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{orders.length} purchase orders</p>
        </div>
        <PoFormDialog organisationId={orgId} trigger={<Button size="sm"><Plus size={14} /> New PO</Button>} />
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48 h-8 text-xs">
          <option value="">All statuses</option>
          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_BILLED', 'BILLED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No purchase orders yet.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead>Order Date</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {orders.map((po: PurchaseOrder) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono text-xs font-semibold text-primary">{po.poNumber}</TableCell>
                  <TableCell className="text-sm">{po.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(po.orderDate).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{fmt(po.totalAmount)} {po.currency}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[po.status]}>{po.status.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <AttachmentsDialog organisationId={orgId} entityType="PURCHASE_ORDER" entityId={po.id} label={po.poNumber} />
                      <PoDetailDialog organisationId={orgId} poId={po.id} canApprove={canApprove}
                        trigger={<button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="View / actions"><Eye size={14} /></button>} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
