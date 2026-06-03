import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { createOrganisation, type CoaTemplate } from '@/services/organisations.service';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'CAD', 'AUD'];

export function SetupOrgPage() {
  const navigate = useNavigate();
  const { setUser, setActiveOrganisation } = useAuthStore();

  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [country, setCountry] = useState('');
  const [template, setTemplate] = useState<CoaTemplate>('retail');

  const mutation = useMutation({
    mutationFn: () => createOrganisation({ name, baseCurrency, country: country || undefined, template }),
    onSuccess: async (org) => {
      // Refresh user profile to pick up new org membership
      const profile = await api.get('/auth/me').then((r) => r.data.data);
      setUser(profile);
      setActiveOrganisation(org.id);
      void navigate('/dashboard');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Building2 size={24} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Set up your organisation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create your company profile to get started
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Organisation Name *</label>
              <Input
                placeholder="Acme Ltd."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Base Currency *</label>
              <Select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Country</label>
              <Input
                placeholder="Ghana"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Industry Chart of Accounts *</label>
              <Select value={template} onChange={(e) => setTemplate(e.target.value as CoaTemplate)}>
                <option value="retail">Retail / Trading (buys &amp; sells goods)</option>
                <option value="services">Services / Consulting</option>
                <option value="technology">Technology / SaaS</option>
                <option value="agriculture">Agriculture / Farming</option>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                A complete chart of accounts for this industry — including expenses, COGS, tax and payroll accounts — is created automatically. You can customise it afterward.
              </p>
            </div>

            {mutation.isError && (
              <p className="text-sm text-destructive">
                {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
                  ?.response?.data?.error?.message ?? 'Failed to create organisation'}
              </p>
            )}

            <Button
              className="w-full"
              disabled={!name || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Creating…' : 'Create Organisation'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
