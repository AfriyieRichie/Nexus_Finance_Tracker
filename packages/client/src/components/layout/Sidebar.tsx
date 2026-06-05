import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FileText, BarChart3, TrendingUp, Building2,
  ChevronDown, ChevronRight, LogOut, Settings, Scale, Banknote, Users, ShoppingCart,
  Package, Landmark, Archive, PiggyBank, Receipt, CheckCircle, Shield,
  Bell, UserCog, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { getUnreadCount } from '@/services/approvals.service';
import type { UserRole } from '@/services/users.types';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: UserRole[]; // undefined = all roles
}

interface NavGroup {
  heading: string;
  items: NavItem[];
  roles?: UserRole[];
}

const ADMIN_ROLES: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN'];
const FINANCE_AND_UP: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'];
const ACCOUNTING_ROLES: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'AUDITOR'];
const AP_ROLES: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'ACCOUNTS_PAYABLE_CLERK', 'AUDITOR'];
const AR_ROLES: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'ACCOUNTS_RECEIVABLE_CLERK', 'AUDITOR'];
const REPORT_ROLES: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'REPORT_VIEWER'];
const WORKFLOW_ROLES: UserRole[] = ['ORG_ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'ACCOUNTS_PAYABLE_CLERK', 'ACCOUNTS_RECEIVABLE_CLERK', 'AUDITOR', 'APPROVER'];

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={16} /> }],
  },
  {
    heading: 'Accounting',
    items: [
      { label: 'Chart of Accounts', to: '/accounts', icon: <BookOpen size={16} />, roles: ACCOUNTING_ROLES },
      { label: 'Journal Entries', to: '/journals', icon: <FileText size={16} />, roles: ACCOUNTING_ROLES },
      { label: 'Accounting Periods', to: '/periods', icon: <Settings size={16} />, roles: FINANCE_AND_UP },
    ],
  },
  {
    heading: 'Ledger',
    items: [
      { label: 'Trial Balance', to: '/ledger/trial-balance', icon: <Scale size={16} />, roles: ACCOUNTING_ROLES },
    ],
  },
  {
    heading: 'Sub-Ledgers',
    items: [
      { label: 'Accounts Receivable', to: '/ar', icon: <Users size={16} />, roles: AR_ROLES },
      { label: 'Accounts Payable', to: '/ap', icon: <ShoppingCart size={16} />, roles: AP_ROLES },
      { label: 'Fixed Assets', to: '/assets', icon: <Package size={16} />, roles: ACCOUNTING_ROLES },
      { label: 'Bank Reconciliation', to: '/bank', icon: <Landmark size={16} />, roles: ACCOUNTING_ROLES },
      { label: 'Inventory', to: '/inventory', icon: <Archive size={16} />, roles: ACCOUNTING_ROLES },
    ],
  },
  {
    heading: 'Planning',
    items: [
      { label: 'Budgets & Cost Centres', to: '/budgets', icon: <PiggyBank size={16} />, roles: FINANCE_AND_UP },
      { label: 'Tax & Currency', to: '/tax', icon: <Receipt size={16} />, roles: ACCOUNTING_ROLES },
    ],
  },
  {
    heading: 'Payroll',
    roles: FINANCE_AND_UP,
    items: [
      { label: 'Payroll Runs', to: '/payroll/runs', icon: <Banknote size={16} />, roles: FINANCE_AND_UP },
      { label: 'Employees', to: '/payroll/employees', icon: <Users size={16} />, roles: FINANCE_AND_UP },
      { label: 'Salary Components', to: '/payroll/components', icon: <Receipt size={16} />, roles: FINANCE_AND_UP },
      { label: 'Statutory Config', to: '/payroll/statutory', icon: <Settings size={16} />, roles: FINANCE_AND_UP },
    ],
  },
  {
    heading: 'Workflow',
    items: [
      { label: 'Approvals', to: '/approvals', icon: <CheckCircle size={16} />, roles: WORKFLOW_ROLES },
      { label: 'Audit Trail', to: '/audit', icon: <Shield size={16} />, roles: [...ACCOUNTING_ROLES, 'APPROVER'] as UserRole[] },
    ],
  },
  {
    heading: 'Reports',
    items: [
      { label: 'Balance Sheet', to: '/reports/balance-sheet', icon: <Building2 size={16} />, roles: REPORT_ROLES },
      { label: 'Income Statement', to: '/reports/income-statement', icon: <TrendingUp size={16} />, roles: REPORT_ROLES },
      { label: 'Cash Flow', to: '/reports/cash-flow', icon: <Banknote size={16} />, roles: REPORT_ROLES },
      { label: 'Changes in Equity', to: '/reports/changes-in-equity', icon: <TrendingUp size={16} />, roles: REPORT_ROLES },
    ],
  },
  {
    heading: 'Administration',
    roles: ADMIN_ROLES,
    items: [
      { label: 'User Management', to: '/admin/users', icon: <UserCog size={16} />, roles: ADMIN_ROLES },
    ],
  },
];

function canSee(itemRoles: UserRole[] | undefined, userRole: UserRole | undefined, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!userRole) return false;
  if (!itemRoles) return true;
  return itemRoles.includes(userRole);
}

export function Sidebar() {
  const { user, activeOrganisationId, setActiveOrganisation, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [orgOpen, setOrgOpen] = useState(false);

  // Collapsible groups — start with the active group open, all others closed
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const group of NAV_GROUPS) {
      // Overview is always open (it's just Dashboard — one item)
      if (group.heading === 'Overview') { open.add(group.heading); continue; }
      if (group.items.some((item) => location.pathname.startsWith(item.to))) {
        open.add(group.heading);
      }
    }
    return open;
  });

  // When the route changes, auto-expand the group that contains the new active item
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if (group.items.some((item) => location.pathname.startsWith(item.to))) {
        setExpandedGroups((prev) => {
          if (prev.has(group.heading)) return prev;
          return new Set([...prev, group.heading]);
        });
      }
    }
  }, [location.pathname]);

  function toggleGroup(heading: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) { next.delete(heading); } else { next.add(heading); }
      return next;
    });
  }

  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);
  const userRole = activeOrg?.role as UserRole | undefined;
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const qc = useQueryClient();
  const isFetching = useIsFetching();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread', activeOrganisationId],
    queryFn: () => getUnreadCount(activeOrganisationId ?? ''),
    enabled: !!activeOrganisationId,
    refetchInterval: 30_000,
  });

  function handleLogout() {
    logout();
    void navigate('/login');
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item.roles, userRole, isSuperAdmin)),
  })).filter((group) => {
    if (!canSee(group.roles, userRole, isSuperAdmin)) return false;
    return group.items.length > 0;
  });

  return (
    <aside className="flex flex-col w-60 shrink-0 border-r bg-card h-screen sticky top-0 overflow-y-auto">
      {/* Logo — click to return to landing page */}
      <div className="flex items-center gap-2.5 h-14 px-4 border-b">
        <NavLink to="/" className="flex items-center gap-2.5 flex-1 min-w-0 group" title="Home">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0 group-hover:opacity-80 transition-opacity">
            <BarChart3 size={14} className="text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm tracking-tight truncate group-hover:text-primary transition-colors">Nexus Accounting</span>
        </NavLink>
        <button
          onClick={() => void qc.invalidateQueries()}
          title="Refresh data"
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
        </button>
        <NavLink to="/approvals" className="relative p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </NavLink>
      </div>

      {/* Org switcher */}
      {user && user.organisations.length > 0 && (
        <div className="px-3 py-3 border-b">
          <button
            onClick={() => setOrgOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-left text-sm"
          >
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 size={12} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-xs">{activeOrg?.organisationName ?? 'Select organisation'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{activeOrg?.baseCurrency}</p>
            </div>
            <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', orgOpen && 'rotate-180')} />
          </button>

          {orgOpen && user.organisations.length > 1 && (
            <div className="mt-1 border rounded-md overflow-hidden bg-background shadow-sm">
              {user.organisations.map((org) => (
                <button
                  key={org.organisationId}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left',
                    org.organisationId === activeOrganisationId && 'bg-accent font-medium',
                  )}
                  onClick={() => { setActiveOrganisation(org.organisationId); setOrgOpen(false); }}
                >
                  {org.organisationName}
                  <span className="ml-auto text-muted-foreground">{org.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleGroups.map((group) => {
          const isOpen = expandedGroups.has(group.heading);
          const isSingleAlwaysOpen = group.heading === 'Overview';
          return (
            <div key={group.heading}>
              {/* Group header — clickable toggle (except Overview which is always open) */}
              {isSingleAlwaysOpen ? (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )
                      }
                    >
                      {item.icon}
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => toggleGroup(group.heading)}
                    className="w-full flex items-center justify-between px-2 py-1.5 mt-1 rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  >
                    {group.heading}
                    <ChevronRight
                      size={11}
                      className={cn('transition-transform duration-150 shrink-0', isOpen && 'rotate-90')}
                    />
                  </button>
                  {isOpen && (
                    <ul className="space-y-0.5 mt-0.5">
                      {group.items.map((item) => (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                                isActive
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                              )
                            }
                          >
                            {item.icon}
                            {item.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{activeOrg?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
