import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Globe } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listTaxCodes, createTaxCode, updateTaxCode, listExchangeRates, upsertExchangeRate } from '@/services/tax.service';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR'];

function NewTaxCodeDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => createTaxCode(organisationId, { code, name, rate: Number(rate), description: description || undefined }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tax-codes'] }); setOpen(false); setCode(''); setName(''); setRate(''); setDescription(''); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> New Tax Code</Button>
      </DialogTrigger>
      <DialogContent title="New Tax Code" description="Define a VAT, GST, or withholding tax code.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Code *</label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VAT15" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Rate (%) *</label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="15.00" className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard VAT" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!code || !name || !rate || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewExchangeRateDialog({ organisationId }: { organisationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('GHS');
  const [rate, setRate] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

  const mutation = useMutation({
    mutationFn: () => upsertExchangeRate(organisationId, { fromCurrency, toCurrency, rate: Number(rate), effectiveDate }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['exchange-rates'] }); setOpen(false); setRate(''); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus size={14} /> Add Rate</Button>
      </DialogTrigger>
      <DialogContent title="Add Exchange Rate" description="Record a currency exchange rate (IAS 21).">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">From Currency</label>
              <Select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} className="h-8 text-xs">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">To Currency</label>
              <Select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} className="h-8 text-xs">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Rate *</label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 14.50" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Effective Date</label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!rate || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save Rate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaxPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'tax-codes' | 'exchange-rates'>('tax-codes');

  const { data: taxCodes, isLoading: taxLoading } = useQuery({
    queryKey: ['tax-codes', activeOrganisationId],
    queryFn: () => listTaxCodes(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'tax-codes',
  });

  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ['exchange-rates', activeOrganisationId],
    queryFn: () => listExchangeRates(activeOrganisationId!),
    enabled: !!activeOrganisationId && tab === 'exchange-rates',
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateTaxCode(activeOrganisationId!, id, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tax-codes'] }),
  });

  const tabs = [
    { id: 'tax-codes', label: 'Tax Codes', icon: Receipt },
    { id: 'exchange-rates', label: 'Exchange Rates', icon: Globe },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Receipt size={18} /> Tax & Multi-Currency
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">VAT/GST codes and exchange rates (IAS 21)</p>
        </div>
        <div className="flex gap-2">
          {tab === 'tax-codes' && activeOrganisationId && <NewTaxCodeDialog organisationId={activeOrganisationId} />}
          {tab === 'exchange-rates' && activeOrganisationId && <NewExchangeRateDialog organisationId={activeOrganisationId} />}
        </div>
      </div>

      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'tax-codes' && (
        <Card>
          <CardContent className="p-0">
            {taxLoading ? (
              <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (taxCodes ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No tax codes yet.</p>
                <p className="text-xs text-muted-foreground">Add VAT, GST, or withholding tax rates.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Rate (%)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(taxCodes ?? []).map((tc) => (
                    <TableRow key={tc.id}>
                      <TableCell className="font-mono text-xs font-medium text-primary">{tc.code}</TableCell>
                      <TableCell className="text-sm font-medium">{tc.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tc.description ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{Number(tc.rate).toFixed(2)}%</TableCell>
                      <TableCell><Badge variant={tc.isActive ? 'success' : 'secondary'}>{tc.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell>
                        <button onClick={() => toggleActive.mutate({ id: tc.id, isActive: !tc.isActive })}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                          {tc.isActive ? 'Deactivate' : 'Activate'}
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

      {tab === 'exchange-rates' && (
        <Card>
          <CardContent className="p-0">
            {ratesLoading ? (
              <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (rates ?? []).length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No exchange rates recorded.</p>
                <p className="text-xs text-muted-foreground">Add rates for foreign currency transactions (IAS 21).</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Effective Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rates ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-semibold">{r.fromCurrency}</TableCell>
                      <TableCell className="text-sm font-semibold">{r.toCurrency}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{Number(r.rate).toFixed(6)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.effectiveDate).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
