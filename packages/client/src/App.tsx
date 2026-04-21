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
import { PeriodsPage } from './pages/periods/PeriodsPage';
import { ARPage } from './pages/ar/ARPage';
import { APPage } from './pages/ap/APPage';
import { AssetsPage } from './pages/assets/AssetsPage';

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
          <Route path="/ledger/trial-balance" element={<TrialBalancePage />} />
          <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="/reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="/reports/cash-flow" element={<CashFlowPage />} />
        </Route>

        {/* Default */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
