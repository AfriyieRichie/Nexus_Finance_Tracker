import { Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { getOverduePeriods } from '@/services/periods.service';

function OverduePeriodsBanner({ organisationId }: { organisationId: string }) {
  const { data: overdue } = useQuery({
    queryKey: ['overdue-periods', organisationId],
    queryFn: () => getOverduePeriods(organisationId),
    staleTime: 5 * 60 * 1000, // re-check every 5 min
  });

  if (!overdue || overdue.length === 0) return null;

  const names = overdue.map((p) => p.name).join(', ');

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center gap-3 text-sm font-medium shadow-sm">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">
        <strong>{overdue.length} accounting period{overdue.length > 1 ? 's are' : ' is'} overdue for closure:</strong>{' '}
        {names}.{' '}
        Please close {overdue.length > 1 ? 'these periods' : 'this period'} to maintain accurate financial records.
      </span>
      <Link
        to="/periods"
        className="shrink-0 underline underline-offset-2 hover:text-amber-100 font-semibold whitespace-nowrap"
      >
        Go to Periods →
      </Link>
    </div>
  );
}

export function AppShell() {
  const activeOrganisationId = useAuthStore((s) => s.activeOrganisationId);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {activeOrganisationId && (
          <OverduePeriodsBanner organisationId={activeOrganisationId} />
        )}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
