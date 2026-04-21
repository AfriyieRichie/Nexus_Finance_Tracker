import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { SetupOrgPage } from './pages/onboarding/SetupOrgPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AccountsPage } from './pages/accounts/AccountsPage';
import { JournalsPage } from './pages/journals/JournalsPage';
import { JournalCreatePage } from './pages/journals/JournalCreatePage';
import { TrialBalancePage } from './pages/ledger/TrialBalancePage';
import { BalanceSheetPage } from './pages/reports/BalanceSheetPage';
import { IncomeStatementPage } from './pages/reports/IncomeStatementPage';
import { CashFlowPage } from './pages/reports/CashFlowPage';
import { ChangesInEquityPage } from './pages/reports/ChangesInEquityPage';
import { PeriodsPage } from './pages/periods/PeriodsPage';
import { ARPage } from './pages/ar/ARPage';
import { APPage } from './pages/ap/APPage';
import { AssetsPage } from './pages/assets/AssetsPage';
import { BankPage } from './pages/bank/BankPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { BudgetsPage } from './pages/budgets/BudgetsPage';
import { TaxPage } from './pages/tax/TaxPage';
import { PayrollPage } from './pages/payroll/PayrollPage';
import { ApprovalsPage } from './pages/approvals/ApprovalsPage';
import { AuditPage } from './pages/audit/AuditPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Redirect to org setup if user has no organisation
function OrgGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user && user.organisations.length === 0) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Onboarding — authenticated but no org yet */}
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <SetupOrgPage />
            </ProtectedRoute>
          }
        />

        {/* Protected app shell */}
        <Route
          element={
            <ProtectedRoute>
              <OrgGuard>
                <AppShell />
              </OrgGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/journals" element={<JournalsPage />} />
          <Route path="/journals/new" element={<JournalCreatePage />} />
          <Route path="/periods" element={<PeriodsPage />} />
          <Route path="/ar" element={<ARPage />} />
          <Route path="/ap" element={<APPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/bank" element={<BankPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/tax" element={<TaxPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/ledger/trial-balance" element={<TrialBalancePage />} />
          <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="/reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="/reports/cash-flow" element={<CashFlowPage />} />
          <Route path="/reports/changes-in-equity" element={<ChangesInEquityPage />} />
        </Route>

        {/* Default */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
