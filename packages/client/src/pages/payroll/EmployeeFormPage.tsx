import { useNavigate, useParams, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as payrollSvc from '@/services/payroll.service';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeDialog } from './PayrollPage';

export function EmployeeFormPage() {
  const navigate = useNavigate();
  const { empId } = useParams<{ empId: string }>();
  const orgId = useAuthStore((s) => s.activeOrganisationId) ?? '';

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['payroll-employees', orgId],
    queryFn: () => payrollSvc.listEmployees(orgId),
    enabled: !!orgId,
  });

  const emp = empId ? employees.find((e) => e.id === empId) ?? null : null;
  const isEdit = !!empId;
  const back = () => navigate('/payroll/employees');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <NavLink to="/payroll/runs" className="hover:text-foreground">Payroll</NavLink>
        <ChevronRight size={14} />
        <NavLink to="/payroll/employees" className="hover:text-foreground">Employees</NavLink>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">{isEdit ? (emp ? `${emp.firstName} ${emp.lastName}` : 'Edit') : 'New Employee'}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Employee' : 'New Employee'}</h1>
        <p className="text-sm text-muted-foreground mt-1">Complete each step, then save. You can move between steps with the tabs or the Next / Back buttons.</p>
      </div>

      <Card><CardContent className="p-5">
        {isEdit && isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : isEdit && !emp ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Employee not found.</p>
        ) : (
          <EmployeeDialog organisationId={orgId} emp={emp} employees={employees} onClose={back} fullPage />
        )}
      </CardContent></Card>
    </div>
  );
}
