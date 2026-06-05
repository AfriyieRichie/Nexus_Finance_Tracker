import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Eye, Printer, Banknote } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as pvSvc from '@/services/pv.service';
import type { PaymentVoucher, PaymentVoucherStatus } from '@/services/pv.service';
import { listSuppliers, listSupplierInvoices } from '@/services/ap.service';
import { listAccounts } from '@/services/accounts.service';
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

const STATUS_VARIANT: Record<PaymentVoucherStatus, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  DRAFT: 'secondary', PENDING_APPROVAL: 'warning', APPROVED: 'info', PAID: 'success', CANCELLED: 'destructive',
};

// ─── Raise PV dialog ───────────────────────────────────────────────────────────

function RaisePvDialog({ organisationId, trigger }: { organisationId: string; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [payeeMemo, setPayeeMemo] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({}); // invoiceId -> amount

  const { data: suppliersData } = useQuery({ queryKey: ['ap-suppliers', organisationId], queryFn: () => listSuppliers(organisationId), enabled: open });
  const suppliers = suppliersData?.suppliers ?? [];
  const { data: accountsData } = useQuery({ queryKey: ['accounts', organisationId], queryFn: () => listAccounts(organisationId, { pageSize: 300 } as Parameters<typeof listAccounts>[1]), enabled: open });
  const bankAccounts = (accountsData?.accounts ?? []).filter((a) => (a.type === 'BANK' || a.type === 'CASH') && a.isActive && !a.isControlAccount);
  const { data: invoicesData } = useQuery({
    queryKey: ['ap-invoices', organisationId, supplierId],
    queryFn: () => listSupplierInvoices(organisationId, { supplierId, pageSize: 100 }),
    enabled: open && !!supplierId,
  });
  const payable = (invoicesData?.invoices ?? []).filter(
    (i) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'APPROVED'].includes(i.status) && Number(i.totalAmount) - Number(i.amountPaid) > 0.0001,
  );

  const toggle = (invId: string, outstanding: number) =>
    setSelected((s) => { const n = { ...s }; if (n[invId] != null) delete n[invId]; else n[invId] = outstanding.toFixed(2); return n; });

  const total = Object.values(selected).reduce((s, a) => s + Number(a || 0), 0);

  const mutation = useMutation({
    mutationFn: () => pvSvc.createPaymentVoucher(organisationId, {
      supplierId, voucherDate, bankAccountId: bankAccountId || undefined, payeeMemo: payeeMemo || undefined,
      lines: Object.entries(selected).map(([supplierInvoiceId, amount]) => ({ supplierInvoiceId, amount: Number(amount) })),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payment-vouchers'] }); setOpen(false); setSelected({}); setSupplierId(''); },
  });

  const canSave = supplierId && voucherDate && Object.keys(selected).length > 0 && total > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl" title="Raise Payment Voucher" description="Authorise payment of one or more outstanding supplier bills.">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium mb-1 block">Supplier *</label>
              <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setSelected({}); }} className="h-8 text-xs">
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </Select></div>
            <div><label className="text-xs font-medium mb-1 block">Voucher Date *</label>
              <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className="h-8 text-xs" /></div>
            <div className="col-span-2"><label className="text-xs font-medium mb-1 block">Pay from (bank / cash)</label>
              <AccountSelect value={bankAccountId} onChange={setBankAccountId} accounts={bankAccounts} placeholder="— Select account —" /></div>
          </div>

          {supplierId && (
            <div>
              <label className="text-xs font-medium mb-1 block">Outstanding bills</label>
              {payable.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center border rounded-md">No outstanding posted bills for this supplier.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50"><tr><th className="w-8 px-2 py-1.5" /><th className="text-left px-2 py-1.5">Invoice</th><th className="text-right px-2 py-1.5">Outstanding</th><th className="text-right px-2 py-1.5 w-28">Pay amount</th></tr></thead>
                    <tbody>
                      {payable.map((inv) => {
                        const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
                        const checked = selected[inv.id] != null;
                        return (
                          <tr key={inv.id} className="border-t">
                            <td className="px-2 py-1 text-center"><input type="checkbox" checked={checked} onChange={() => toggle(inv.id, outstanding)} /></td>
                            <td className="px-2 py-1 font-mono">{inv.invoiceNumber}</td>
                            <td className="px-2 py-1 text-right">{fmt(outstanding)}</td>
                            <td className="px-2 py-1">
                              {checked && <Input type="number" value={selected[inv.id]} max={outstanding} onChange={(e) => setSelected((s) => ({ ...s, [inv.id]: e.target.value }))} className="h-7 text-xs text-right" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end text-xs"><div className="w-48 flex justify-between font-semibold"><span>Total to pay</span><span>{fmt(total)}</span></div></div>
          <div><label className="text-xs font-medium mb-1 block">Memo</label>
            <Input value={payeeMemo} onChange={(e) => setPayeeMemo(e.target.value)} placeholder="Being payment for…" className="h-8 text-xs" /></div>

          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving…' : 'Raise voucher'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail / actions ──────────────────────────────────────────────────────────

function PvDetailDialog({ organisationId, pvId, canApprove, trigger }: { organisationId: string; pvId: string; canApprove: boolean; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const { data: pv, isLoading } = useQuery({ queryKey: ['payment-voucher', pvId], queryFn: () => pvSvc.getPaymentVoucher(organisationId, pvId), enabled: open });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['payment-vouchers'] }); void qc.invalidateQueries({ queryKey: ['payment-voucher', pvId] }); };

  const submit = useMutation({ mutationFn: () => pvSvc.submitPvForApproval(organisationId, pvId), onSuccess: invalidate });
  const approve = useMutation({ mutationFn: () => pvSvc.approvePv(organisationId, pvId), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: () => pvSvc.rejectPv(organisationId, pvId, reason), onSuccess: () => { setRejecting(false); setReason(''); invalidate(); } });
  const cancel = useMutation({ mutationFn: () => pvSvc.cancelPv(organisationId, pvId), onSuccess: invalidate });
  const pay = useMutation({ mutationFn: () => pvSvc.payPv(organisationId, pvId, {}), onSuccess: () => { invalidate(); void qc.invalidateQueries({ queryKey: ['ap-invoices'] }); } });

  const printPv = () => {
    if (!pv) return;
    const lineRows = pv.lines.map((l) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${l.supplierInvoice.invoiceNumber}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(l.amount)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>${pv.pvNumber}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;padding:24px;color:#111;"><h2 style="margin:0;">Payment Voucher ${pv.pvNumber}</h2><p style="color:#666;">Payee: ${pv.supplier?.name ?? ''} · Date: ${new Date(pv.voucherDate).toLocaleDateString()} · ${pv.currency}</p>${pv.payeeMemo ? `<p>${pv.payeeMemo}</p>` : ''}<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;border-bottom:2px solid #333;padding:6px 8px;">Invoice</th><th style="text-align:right;border-bottom:2px solid #333;padding:6px 8px;">Amount</th></tr></thead><tbody>${lineRows}<tr style="font-weight:bold;"><td style="padding:6px 8px;text-align:right;">Total</td><td style="padding:6px 8px;text-align:right;">${fmt(pv.totalAmount)} ${pv.currency}</td></tr></tbody></table><div style="margin-top:48px;display:flex;justify-content:space-between;"><div>Prepared by: ____________</div><div>Approved by: ____________</div><div>Received by: ____________</div></div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  const anyError = submit.error ?? approve.error ?? reject.error ?? cancel.error ?? pay.error;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl" title={pv ? `Payment Voucher ${pv.pvNumber}` : 'Payment Voucher'} description="">
        {isLoading || !pv ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><p className="text-muted-foreground">Payee</p><p className="font-medium">{pv.supplier?.name}</p></div>
              <div><p className="text-muted-foreground">Status</p><Badge variant={STATUS_VARIANT[pv.status]}>{pv.status.replace(/_/g, ' ')}</Badge></div>
              <div><p className="text-muted-foreground">Date</p><p>{new Date(pv.voucherDate).toLocaleDateString()}</p></div>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50"><tr><th className="text-left px-3 py-2">Invoice</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
                <tbody>
                  {pv.lines.map((l) => (
                    <tr key={l.id} className="border-t"><td className="px-3 py-2 font-mono">{l.supplierInvoice.invoiceNumber}</td><td className="px-3 py-2 text-muted-foreground">{l.supplierInvoice.status}</td><td className="px-3 py-2 text-right font-medium">{fmt(l.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end text-xs"><div className="w-48 flex justify-between font-semibold"><span>Total</span><span>{fmt(pv.totalAmount)} {pv.currency}</span></div></div>
            {pv.payeeMemo && <p className="text-xs text-muted-foreground">{pv.payeeMemo}</p>}
            {anyError && <p className="text-xs text-destructive">{errMsg(anyError)}</p>}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={printPv}><Printer size={14} /> Print</Button>
              {pv.status === 'DRAFT' && <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? 'Submitting…' : 'Submit for approval'}</Button>}
              {pv.status === 'PENDING_APPROVAL' && canApprove && (
                <>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setRejecting((v) => !v)}>Reject</Button>
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? 'Approving…' : 'Approve'}</Button>
                </>
              )}
              {pv.status === 'APPROVED' && canApprove && (
                <Button size="sm" disabled={pay.isPending} onClick={() => pay.mutate()}><Banknote size={14} /> {pay.isPending ? 'Paying…' : 'Pay now'}</Button>
              )}
              {!['PAID', 'CANCELLED'].includes(pv.status) && (
                <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</Button>
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

export function PaymentVouchersPage() {
  const orgId = useAuthStore((s) => s.activeOrganisationId) ?? '';
  const user = useAuthStore((s) => s.user);
  const role = user?.organisations.find((o) => o.organisationId === orgId)?.role;
  const canApprove = role === 'FINANCE_MANAGER' || role === 'ORG_ADMIN' || role === 'SUPER_ADMIN';
  const [statusFilter, setStatusFilter] = useState('');

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ['payment-vouchers', orgId, statusFilter],
    queryFn: () => pvSvc.listPaymentVouchers(orgId, { status: statusFilter || undefined }),
    enabled: !!orgId,
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Receipt size={18} /> Payment Vouchers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{vouchers.length} payment vouchers</p>
        </div>
        <RaisePvDialog organisationId={orgId} trigger={<Button size="sm"><Plus size={14} /> Raise PV</Button>} />
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48 h-8 text-xs">
          <option value="">All statuses</option>
          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : vouchers.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No payment vouchers yet.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>PV #</TableHead><TableHead>Payee</TableHead><TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {vouchers.map((pv: PaymentVoucher) => (
                <TableRow key={pv.id}>
                  <TableCell className="font-mono text-xs font-semibold text-primary">{pv.pvNumber}</TableCell>
                  <TableCell className="text-sm">{pv.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(pv.voucherDate).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{fmt(pv.totalAmount)} {pv.currency}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[pv.status]}>{pv.status.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <AttachmentsDialog organisationId={orgId} entityType="PAYMENT_VOUCHER" entityId={pv.id} label={pv.pvNumber} />
                      <PvDetailDialog organisationId={orgId} pvId={pv.id} canApprove={canApprove}
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
