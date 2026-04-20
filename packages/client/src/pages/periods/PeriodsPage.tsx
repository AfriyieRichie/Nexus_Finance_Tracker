import { useQuery } from '@tanstack/react-query';
import { Settings, Lock, CheckCircle, Circle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { listPeriods } from '@/services/periods.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  OPEN: 'success',
  CLOSED: 'warning',
  LOCKED: 'secondary',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN: <Circle size={12} className="text-green-500" />,
  CLOSED: <CheckCircle size={12} className="text-amber-500" />,
  LOCKED: <Lock size={12} className="text-muted-foreground" />,
};

export function PeriodsPage() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  const { data: periods, isLoading } = useQuery({
    queryKey: ['periods', activeOrganisationId],
    queryFn: () => listPeriods(activeOrganisationId!),
    enabled: !!activeOrganisationId,
  });

  // Group by fiscal year
  const grouped = (periods ?? []).reduce<Record<number, typeof periods>>((acc, p) => {
    if (!p) return acc;
    const yr = p.fiscalYear;
    if (!acc[yr]) acc[yr] = [];
    acc[yr]!.push(p);
    return acc;
  }, {});

  const fiscalYears = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Settings size={18} /> Accounting Periods
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{periods?.length ?? 0} periods</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !periods?.length ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No accounting periods found. Create a fiscal year to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {fiscalYears.map((year) => (
            <Card key={year}>
              <CardHeader>
                <CardTitle>Fiscal Year {year}</CardTitle>
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
