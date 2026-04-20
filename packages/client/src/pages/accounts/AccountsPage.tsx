import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, BookOpen } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listAccounts } from '@/services/accounts.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const CLASS_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ASSET: 'info',
  LIABILITY: 'destructive',
  EQUITY: 'warning',
  REVENUE: 'success',
  EXPENSE: 'secondary',
};

export function AccountsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', activeOrganisationId, classFilter],
    queryFn: () => listAccounts(activeOrganisationId!, { class: classFilter || undefined, pageSize: 200 }),
    enabled: !!activeOrganisationId,
  });

  const accounts = (data?.accounts ?? []).filter(
    (a) =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.toLowerCase().includes(search.toLowerCase()),
  );

  const classes = ['', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen size={18} /> Chart of Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total ?? 0} accounts
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* Filters */}
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
            <div className="flex gap-1.5 flex-wrap">
              {classes.map((cls) => (
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
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No accounts found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sub-class</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
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
                      <Badge variant={CLASS_VARIANT[account.class] ?? 'secondary'}>
                        {account.class}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {account.type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {account.subClass ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{account.level}</TableCell>
                    <TableCell>
                      {account.isLocked ? (
                        <Badge variant="destructive">Locked</Badge>
                      ) : account.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
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
  );
}
