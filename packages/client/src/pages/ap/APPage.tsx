import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Plus, FileText, TrendingDown, Trash2, Pencil, BookOpen, Printer, Mail } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listSuppliers, createSupplier, updateSupplier, getSupplierStatement, emailSupplierStatement, listSupplierInvoices, createSupplierInvoice, postSupplierInvoice, getApAgeing } from '@/services/ap.service';
import type { Supplier, SupplierInput, SupplierStatement } from '@/services/ap.service';
import { listAccounts } from '@/services/accounts.service';
import { listTaxCodes } from '@/services/tax.service';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AccountSelect } from '@/components/ui/account-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AttachmentsDialog } from '@/components/ui/attachments';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  SENT: 'info',
  DRAFT: 'secondary',
  VOID: 'secondary',
};

function SupplierDialog({ organisationId, supplier, trigger }: { organisationId: string; supplier?: Supplier; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const isEdit = !!supplier;
  const [open, setOpen] = useState(false);
  const addr = (supplier?.address ?? {}) as { street?: string; city?: string; country?: string };
  const bank = (supplier?.bankDetails ?? {}) as { bankName?: string; accountNumber?: string; accountName?: string; branch?: string };

  const [code, setCode] = useState(supplier?.code ?? '');
  const [name, setName] = useState(supplier?.name ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [taxId, setTaxId] = useState(supplier?.taxId ?? '');
  const [paymentTerms, setPaymentTerms] = useState(String(supplier?.paymentTerms ?? 30));
  const [street, setStreet] = useState(addr.street ?? '');
  const [city, setCity] = useState(addr.city ?? '');
  const [country, setCountry] = useState(addr.country ?? '');
  const [bankName, setBankName] = useState(bank.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(bank.accountNumber ?? '');
  const [accountName, setAccountName] = useState(bank.accountName ?? '');
  const [branch, setBranch] = useState(bank.branch ?? '');
  const [whtRate, setWhtRate] = useState(supplier?.whtRate ? String(Number(supplier.whtRate)) : '');
  const [whtClassification, setWhtClassification] = useState(supplier?.whtClassification ?? '');

  function buildPayload(): SupplierInput {
    const address = (street || city || country) ? { street, city, country } : undefined;
    const bankDetails = (bankName || accountNumber || accountName || branch)
      ? { bankName, accountNumber, accountName, branch } : undefined;
    return {
      code, name,
      email: email || undefined,
      phone: phone || undefined,
      taxId: taxId || undefined,
      paymentTerms: Number(paymentTerms),
      address, bankDetails,
      whtRate: whtRate !== '' ? Number(whtRate) : undefined,
      whtClassification: whtClassification || undefined,
    };
  }

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? updateSupplier(organisationId, supplier!.id, buildPayload())
      : createSupplier(organisationId, buildPayload()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ap-suppliers'] }); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        title={isEdit ? 'Edit Supplier' : 'New Supplier'}
        description={isEdit ? 'Update supplier details.' : 'Add a new supplier to your accounts payable.'}
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUPP001" className="h-8 text-xs" disabled={isEdit} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Payment Terms (days)</label>
              <Input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0200000000" className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Tax ID / VAT Number</label>
            <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="P00..." className="h-8 text-xs" />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Address</label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" className="h-8 text-xs" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-8 text-xs" />
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="h-8 text-xs" />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold mb-2">Bank Details (for payments)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" className="h-8 text-xs" />
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch" className="h-8 text-xs" />
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name" className="h-8 text-xs" />
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" className="h-8 text-xs" />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold mb-2">Withholding Tax (Ghana)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">WHT Rate (%)</label>
                <Input type="number" step="0.5" value={whtRate} onChange={(e) => setWhtRate(e.target.value)} placeholder="e.g. 7.5" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">WHT Classification</label>
                <Input value={whtClassification} onChange={(e) => setWhtClassification(e.target.value)} placeholder="e.g. Goods / Services" className="h-8 text-xs" />
              </div>
            </div>
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!code || !name || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Supplier Statement Dialog ───────────────────────────────────────────────

function printSupplierStatement(s: SupplierStatement) {
  const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const win = window.open('', '_blank');
  if (!win) return;
  const rows = s.transactions.map((t) => `
    <tr><td>${fmtDate(t.date)}</td><td style="color:#6b7280">${t.reference}</td><td>${t.description}</td>
    <td style="text-align:right">${t.debit > 0 ? fmtAmt(t.debit) : ''}</td>
    <td style="text-align:right;color:#16a34a">${t.credit > 0 ? fmtAmt(t.credit) : ''}</td>
    <td style="text-align:right;font-weight:600">${fmtAmt(t.balance)}</td></tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>Supplier Statement – ${s.supplier.name}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;max-width:760px;margin:0 auto;padding:24px}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;font-size:12px;border-bottom:1px solid #eee}
    thead tr{background:#1d4ed8;color:#fff}</style></head><body>
    <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px;color:#1d4ed8">${s.organisation.name}</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Supplier Account Statement</p></div>
    <table style="margin-bottom:14px;border:none"><tr style="background:none">
      <td style="border:none"><strong>${s.supplier.name}</strong><br><span style="color:#6b7280">${s.supplier.code}</span></td>
      <td style="border:none;text-align:right">Period: ${fmtDate(s.period.from)} – ${fmtDate(s.period.to)}<br>Currency: ${s.currency}</td></tr></table>
    <table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th style="text-align:right">Invoiced</th><th style="text-align:right">Paid/Credit</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody><tr style="background:#f1f5f9"><td colspan="5"><strong>Opening Balance</strong></td><td style="text-align:right"><strong>${fmtAmt(s.openingBalance)}</strong></td></tr>
    ${rows}
    <tr style="background:#1e3a5f;color:#fff"><td colspan="5"><strong>Closing Balance (owed to supplier)</strong></td><td style="text-align:right"><strong>${s.currency} ${fmtAmt(s.closingBalance)}</strong></td></tr>
    </tbody></table></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function SupplierStatementDialog({ organisationId, supplier, trigger }: { organisationId: string; supplier: Supplier; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [toEmail, setToEmail] = useState('');
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [emailMsg, setEmailMsg] = useState('');

  const gen = useMutation({
    mutationFn: () => getSupplierStatement(organisationId, supplier.id, from, to),
    onSuccess: (s) => { setStatement(s); setEmailMsg(''); },
  });
  const mail = useMutation({
    mutationFn: () => emailSupplierStatement(organisationId, supplier.id, { from, to, toEmail: toEmail || undefined }),
    onSuccess: (r) => setEmailMsg(`Statement emailed to ${r.sentTo}`),
  });

  const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setStatement(null); setEmailMsg(''); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl" title={`Statement – ${supplier.name}`} description="Supplier account activity and balance for a period.">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <Button size="sm" disabled={gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? 'Generating…' : 'Generate Statement'}
          </Button>

          {statement && (
            <div className="border rounded-md overflow-hidden">
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1">Date</th><th className="text-left px-2 py-1">Ref</th>
                      <th className="text-left px-2 py-1">Description</th>
                      <th className="text-right px-2 py-1">Invoiced</th><th className="text-right px-2 py-1">Paid/Cr</th><th className="text-right px-2 py-1">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-muted/40"><td colSpan={5} className="px-2 py-1 font-medium">Opening Balance</td><td className="px-2 py-1 text-right font-medium">{fmtAmt(statement.openingBalance)}</td></tr>
                    {statement.transactions.map((t, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{t.date}</td><td className="px-2 py-1 text-muted-foreground">{t.reference}</td>
                        <td className="px-2 py-1">{t.description}</td>
                        <td className="px-2 py-1 text-right">{t.debit > 0 ? fmtAmt(t.debit) : ''}</td>
                        <td className="px-2 py-1 text-right text-green-600">{t.credit > 0 ? fmtAmt(t.credit) : ''}</td>
                        <td className="px-2 py-1 text-right font-medium">{fmtAmt(t.balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-800 text-white"><td colSpan={5} className="px-2 py-1 font-semibold">Closing Balance</td><td className="px-2 py-1 text-right font-semibold">{statement.currency} {fmtAmt(statement.closingBalance)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2 p-2 border-t bg-muted/30">
                <Button size="sm" variant="outline" onClick={() => printSupplierStatement(statement)}><Printer size={14} className="mr-1" />Print / PDF</Button>
                <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder={supplier.email ?? 'recipient@email.com'} className="h-8 text-xs flex-1 min-w-[160px]" />
                <Button size="sm" variant="outline" disabled={mail.isPending} onClick={() => mail.mutate()}><Mail size={14} className="mr-1" />{mail.isPending ? 'Sending…' : 'Email'}</Button>
              </div>
              {emailMsg && <p className="text-xs text-green-600 px-2 pb-2">{emailMsg}</p>}
              {mail.isError && <p className="text-xs text-destructive px-2 pb-2">{(mail.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to email'}</p>}
            </div>
          )}
          {gen.isError && <p className="text-xs text-destructive">{(gen.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to generate'}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Supplier Invoice Dialog ─────────────────────────────────────────────

interface InvoiceLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
  taxAmount: string;
  accountId: string;
}

const EMPTY_LINE: InvoiceLine = { description: '', quantity: '1', unitPrice: '', taxCode: '', taxAmount: '0', accountId: '' };

function NewSupplierInvoiceDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: suppliersData } = useQuery({
    queryKey: ['ap-suppliers', organisationId],
    queryFn: () => listSuppliers(organisationId),
    enabled: open,
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', organisationId, 'posting'],
    queryFn: () => listAccounts(organisationId, { pageSize: 200, isControlAccount: false, postingOnly: true }),
    enabled: open,
  });

  const { data: taxCodes = [] } = useQuery({
    queryKey: ['tax-codes', organisationId],
    queryFn: () => listTaxCodes(organisationId, true),
    enabled: open,
  });

  const [supplierId, setSupplierId] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [apAccountId, setApAccountId] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...EMPTY_LINE }]);

  // Expense accounts for normal bills, plus the Fixed Asset Clearing account so a
  // capital purchase can be coded to clearing and later capitalised in Fixed Assets.
  const expenseAccounts = (accountsData?.accounts ?? []).filter(
    (a) => (a.class === 'EXPENSE' || /asset clearing/i.test(a.name)) && a.isActive,
  );
  const apAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.type === 'PAYABLE' && a.isActive,
  );

  // Selecting a VAT code (or changing qty/price) auto-computes input VAT = net × rate.
  const recalcTax = (line: InvoiceLine): InvoiceLine => {
    if (!line.taxCode) return { ...line, taxAmount: '0' };
    const rate = Number(taxCodes.find((t) => t.code === line.taxCode)?.rate ?? 0);
    const net = Number(line.quantity || 0) * Number(line.unitPrice || 0);
    return { ...line, taxAmount: (net * rate / 100).toFixed(2) };
  };

  const addLine = () => setLines((l) => [...l, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof InvoiceLine, value: string) =>
    setLines((l) => l.map((line, idx) => idx === i ? recalcTax({ ...line, [key]: value }) : line));

  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = lines.reduce((s, l) => s + Number(l.taxAmount || 0), 0);
  const total = subtotal + tax;

  const reset = () => {
    setSupplierId(''); setSupplierRef(''); setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate(''); setCurrency('USD'); setNotes(''); setApAccountId('');
    setLines([{ ...EMPTY_LINE }]);
  };

  const mutation = useMutation({
    mutationFn: () => createSupplierInvoice(organisationId, {
      supplierId,
      supplierRef: supplierRef || undefined,
      invoiceDate,
      dueDate: dueDate || invoiceDate,
      currency,
      exchangeRate: 1,
      notes: notes || undefined,
      apAccountId: apAccountId || apAccounts[0]?.id || '',
      lines: lines.map((l, i) => ({
        lineNumber: i + 1,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxCode: l.taxCode || undefined,
        taxAmount: Number(l.taxAmount),
        accountId: l.accountId || undefined,
      })),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ap-invoices'] });
      setOpen(false);
      reset();
    },
  });

  const canSubmit = supplierId && invoiceDate && lines.every((l) => l.description && Number(l.unitPrice) > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Invoice</Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl"
        title="New Supplier Invoice"
        description="Record a supplier invoice. Save as draft, then post to record it in the ledger."
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Supplier *</label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>
                {(suppliersData?.suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Supplier Reference</label>
              <Input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="Their invoice number" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Invoice Date *</label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Currency</label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            {apAccounts.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-1 block">AP Control Account</label>
                <AccountSelect
                  value={apAccountId}
                  onChange={setApAccountId}
                  accounts={apAccounts}
                  placeholder="Auto-select first PAYABLE account"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Invoice Lines *</label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus size={12} /> Add Line</Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium w-40">Description</th>
                    <th className="text-right px-2 py-1.5 font-medium w-16">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Unit Price</th>
                    <th className="text-left px-2 py-1.5 font-medium w-36">VAT</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Line Total</th>
                    <th className="text-left px-2 py-1.5 font-medium">Expense Account</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-1 py-1">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(i, 'description', e.target.value)}
                          placeholder="Description"
                          className="h-7 text-xs border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Select
                          value={line.taxCode}
                          onChange={(e) => updateLine(i, 'taxCode', e.target.value)}
                          className="h-7 text-xs border-0 shadow-none focus:ring-0 px-1"
                        >
                          <option value="">No VAT</option>
                          {taxCodes.map((tc) => (
                            <option key={tc.id} value={tc.code}>{tc.code} · {Number(tc.rate)}%</option>
                          ))}
                        </Select>
                        {Number(line.taxAmount) > 0 && (
                          <p className="text-[10px] text-muted-foreground text-right pr-1">+{Number(line.taxAmount).toFixed(2)}</p>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-muted-foreground">
                        {(Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(2)}
                      </td>
                      <td className="px-1 py-1">
                        <AccountSelect
                          value={line.accountId}
                          onChange={(id) => updateLine(i, 'accountId', id)}
                          accounts={expenseAccounts}
                          placeholder="Auto (first expense acct)"
                        />
                      </td>
                      <td className="px-1 py-1">
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <td colSpan={3} className="px-2 py-1.5 text-xs text-muted-foreground">Subtotal</td>
                    <td className="px-2 py-1.5 text-xs text-right">{tax.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-xs text-right font-semibold">{subtotal.toFixed(2)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-2 py-1 text-xs font-semibold text-right">Total</td>
                    <td className="px-2 py-1 text-sm font-bold text-right text-primary">{total.toFixed(2)} {currency}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" className="h-8 text-xs" />
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create invoice'}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button size="sm" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Save as Draft'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Post Supplier Invoice Button ─────────────────────────────────────────────

function PostSupplierInvoiceButton({ organisationId, invoiceId, status }: { organisationId: string; invoiceId: string; status: string }) {
  const qc = useQueryClient();
  const { data: periodsData } = useQuery({
    queryKey: ['periods', organisationId],
    queryFn: () => listPeriods(organisationId),
    enabled: status === 'DRAFT',
  });
  const openPeriods = (periodsData ?? []).filter((p) => p.status === 'OPEN');

  const mutation = useMutation({
    mutationFn: (periodId: string) => postSupplierInvoice(organisationId, invoiceId, periodId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ap-invoices'] }),
  });

  if (status !== 'DRAFT') {
    return (
      <span
        title="Invoice already posted"
        className="text-xs text-muted-foreground cursor-default select-none"
      >
        Posted
      </span>
    );
  }

  if (openPeriods.length === 0) return null;

  return (
    <button
      onClick={() => mutation.mutate(openPeriods[0].id)}
      disabled={mutation.isPending}
      className="text-xs text-primary hover:underline disabled:opacity-50"
    >
      {mutation.isPending ? 'Posting…' : 'Post'}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function APPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [tab, setTab] = useState<'invoices' | 'suppliers' | 'ageing'>('invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['ap-invoices', activeOrganisationId, { statusFilter, supplierFilter, fromFilter, toFilter }],
    queryFn: () => listSupplierInvoices(activeOrganisationId!, {
      status: statusFilter || undefined,
      supplierId: supplierFilter || undefined,
      from: fromFilter || undefined,
      to: toFilter || undefined,
      pageSize: 100,
    }),
    enabled: !!activeOrganisationId && tab === 'invoices',
  });

  const { data: supplierData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['ap-suppliers', activeOrganisationId],
    queryFn: () => listSuppliers(activeOrganisationId!),
    enabled: !!activeOrganisationId && (tab === 'suppliers' || tab === 'invoices'),
  });

  const { data: ageing, isLoading: ageingLoading } = useQuery({
    queryKey: ['ap-ageing', activeOrganisationId],
    queryFn: () => getApAgeing(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'ageing',
  });

  const filteredSuppliers = (supplierData?.suppliers ?? []).filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredInvoices = (invoiceData?.invoices ?? []).filter(
    (i) => !search || i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || i.supplier?.name.toLowerCase().includes(search.toLowerCase()),
  );

  const tabs = [
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'suppliers', label: 'Suppliers', icon: ShoppingCart },
    { id: 'ageing', label: 'AP Ageing', icon: TrendingDown },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShoppingCart size={18} /> Accounts Payable
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'invoices' ? `${invoiceData?.total ?? 0} supplier invoices` : tab === 'suppliers' ? `${supplierData?.total ?? 0} suppliers` : 'AP Ageing Analysis'}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'invoices' && activeOrganisationId && <NewSupplierInvoiceDialog organisationId={activeOrganisationId} />}
          {tab === 'suppliers' && activeOrganisationId && (
            <SupplierDialog
              organisationId={activeOrganisationId}
              trigger={<Button size="sm"><Plus size={14} /> New Supplier</Button>}
            />
          )}
        </div>
      </div>

      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSearch(''); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'suppliers' && (
        <Input
          placeholder="Search suppliers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm h-8 text-xs"
        />
      )}

      {/* Invoice filters */}
      {tab === 'invoices' && (
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search invoices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-xs"
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs w-40">
            <option value="">All statuses</option>
            {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </Select>
          <Select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="h-8 text-xs w-44">
            <option value="">All suppliers</option>
            {(supplierData?.suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Input type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} className="h-8 text-xs w-36" placeholder="From" />
          <Input type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} className="h-8 text-xs w-36" placeholder="To" />
          {(statusFilter || supplierFilter || fromFilter || toFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setSupplierFilter(''); setFromFilter(''); setToFilter(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <Card>
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No supplier invoices yet.</p>
                <p className="text-xs text-muted-foreground">Click <strong>New Invoice</strong> above to record one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Supplier Ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{inv.supplier?.name ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{inv.supplierRef ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right text-xs">{(Number(inv.totalAmount) - Number(inv.amountPaid)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[inv.status] ?? 'secondary'}>{inv.status.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell>
                        {activeOrganisationId && (
                          <div className="flex items-center justify-end gap-1">
                            <AttachmentsDialog organisationId={activeOrganisationId} entityType="SUPPLIER_INVOICE" entityId={inv.id} label={inv.invoiceNumber} />
                            <PostSupplierInvoiceButton organisationId={activeOrganisationId} invoiceId={inv.id} status={inv.status} />
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
      )}

      {tab === 'suppliers' && (
        <Card>
          <CardContent className="p-0">
            {suppliersLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No suppliers found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">{s.code}</TableCell>
                      <TableCell className="text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.email ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.paymentTerms} days</TableCell>
                      <TableCell><Badge variant={s.isActive ? 'success' : 'secondary'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <SupplierStatementDialog
                            organisationId={activeOrganisationId!}
                            supplier={s}
                            trigger={<button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Statement"><BookOpen size={14} /></button>}
                          />
                          <SupplierDialog
                            organisationId={activeOrganisationId!}
                            supplier={s}
                            trigger={<button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Edit"><Pencil size={14} /></button>}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'ageing' && (
        <div className="space-y-4">
          {ageingLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : ageing ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Current', key: 'current' },
                  { label: '1–30 days', key: 'days1_30' },
                  { label: '31–60 days', key: 'days31_60' },
                  { label: '61–90 days', key: 'days61_90' },
                  { label: 'Over 90 days', key: 'over90' },
                ].map(({ label, key }) => (
                  <Card key={key}>
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className="text-lg font-semibold">{Number(ageing.buckets?.[key] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium">Overdue Payables — Grand Total: {Number(ageing.grandTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Bucket</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ageing.invoices ?? []).map((inv: { id: string; invoiceNumber: string; supplier?: { name: string }; dueDate: string; outstanding: string; bucket: string }) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{inv.supplier?.name ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{Number(inv.outstanding).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell><Badge variant={inv.bucket === 'over90' ? 'destructive' : inv.bucket === 'current' ? 'success' : 'warning'}>{inv.bucket.replace(/_/g, ' ')}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
