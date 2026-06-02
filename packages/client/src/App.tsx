import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('App error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: 'red' }}>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {(this.state.error as Error).message}
            {'\n\n'}
            {(this.state.error as Error).stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px' }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { SetupOrgPage } from './pages/onboarding/SetupOrgPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AccountsPage } from './pages/accounts/AccountsPage';
import { JournalsPage } from './pages/journals/JournalsPage';
import { JournalCreatePage } from './pages/journals/JournalCreatePage';
import { JournalDetailPage } from './pages/journals/JournalDetailPage';
import { TrialBalancePage } from './pages/ledger/TrialBalancePage';
import { AccountLedgerPage } from './pages/ledger/AccountLedgerPage';
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
import { UserManagementPage } from './pages/admin/UserManagementPage';
import { ForcePasswordChangePage } from './pages/auth/ForcePasswordChangePage';
import { LandingPage } from './pages/landing/LandingPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Force password change before accessing any other page
function MustChangePasswordGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
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
    <ErrorBoundary>
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

        {/* Force password change — must complete before accessing app */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ForcePasswordChangePage />
            </ProtectedRoute>
          }
        />

        {/* Protected app shell */}
        <Route
          element={
            <ProtectedRoute>
              <MustChangePasswordGuard>
                <OrgGuard>
                  <AppShell />
                </OrgGuard>
              </MustChangePasswordGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/journals" element={<JournalsPage />} />
          <Route path="/journals/new" element={<JournalCreatePage />} />
          <Route path="/journals/:id" element={<JournalDetailPage />} />
          <Route path="/journals/:id/edit" element={<JournalCreatePage />} />
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
          <Route path="/ledger/accounts/:accountId" element={<AccountLedgerPage />} />
          <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="/reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="/reports/cash-flow" element={<CashFlowPage />} />
          <Route path="/reports/changes-in-equity" element={<ChangesInEquityPage />} />
          <Route path="/admin/users" element={<UserManagementPage />} />
        </Route>

        {/* Landing page — standalone (no AppShell sidebar) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MustChangePasswordGuard>
                <OrgGuard>
                  <LandingPage />
                </OrgGuard>
              </MustChangePasswordGuard>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
