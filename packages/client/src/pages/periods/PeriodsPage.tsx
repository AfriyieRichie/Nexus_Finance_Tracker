import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Lock, CheckCircle, Circle, Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listPeriods, createFiscalYear } from '@/services/periods.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  OPEN: 'success',
  CLOSED: 'warning',
  LOCKED: 'secondary',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN: <Circle size={12} className="text-green-500 fill-green-500" />,
  CLOSED: <CheckCircle size={12} className="text-amber-500" />,
  LOCKED: <Lock size={12} className="text-muted-foreground" />,
};

function CreateFiscalYearDialog({ organisationId }: { organisationId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);

  const mutation = useMutation({
    mutationFn: () =>
      createFiscalYear(organisationId, {
        fiscalYear: parseInt(fiscalYear),
        startDate,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['periods', organisationId] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus size={14} /> New Fiscal Year
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-sm"
        title="Create Fiscal Year"
        description="This will auto-generate 12 monthly accounting periods."
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Fiscal Year</label>
            <Input
              type="number"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              min={2000}
              max={2099}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Usually 1 Jan for calendar-year companies
            </p>
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message ?? 'Failed to create fiscal year'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PeriodsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  const { data: periods, isLoading } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  const grouped = (periods ?? []).reduce<Record<number, typeof periods>>((acc, p) => {
    if (!p) return acc;
    if (!acc[p.fiscalYear]) acc[p.fiscalYear] = [];
    acc[p.fiscalYear]!.push(p);
    return acc;
  }, {});

  const fiscalYears = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Settings size={18} /> Accounting Periods
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{periods?.length ?? 0} periods</p>
        </div>
        {activeOrganisationId && (
          <CreateFiscalYearDialog organisationId={activeOrganisationId} />
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !periods?.length ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No accounting periods yet.</p>
            <p className="text-xs text-muted-foreground">
              Click <strong>New Fiscal Year</strong> to create 12 monthly periods automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {fiscalYears.map((year) => (
            <Card key={year}>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Fiscal Year {year}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[year]?.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs text-muted-foreground font-mono">{p.periodNumber}</TableCell>
                        <TableCell className="font-medium text-sm">{p.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(p.startDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(p.endDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {STATUS_ICON[p.status]}
                            <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>{p.status}</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
