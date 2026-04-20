import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  BarChart3,
  TrendingUp,
  Building2,
  ChevronDown,
  LogOut,
  Settings,
  Scale,
  Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useState } from 'react';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={16} /> }],
  },
  {
    heading: 'Accounting',
    items: [
      { label: 'Chart of Accounts', to: '/accounts', icon: <BookOpen size={16} /> },
      { label: 'Journal Entries', to: '/journals', icon: <FileText size={16} /> },
      { label: 'Accounting Periods', to: '/periods', icon: <Settings size={16} /> },
    ],
  },
  {
    heading: 'Ledger',
    items: [
      { label: 'Trial Balance', to: '/ledger/trial-balance', icon: <Scale size={16} /> },
    ],
  },
  {
    heading: 'Reports',
    items: [
      { label: 'Balance Sheet', to: '/reports/balance-sheet', icon: <Building2 size={16} /> },
      { label: 'Income Statement', to: '/reports/income-statement', icon: <TrendingUp size={16} /> },
      { label: 'Cash Flow', to: '/reports/cash-flow', icon: <Banknote size={16} /> },
    ],
  },
];

export function Sidebar() {
  const { user, activeOrganisationId, setActiveOrganisation, logout } = useAuthStore();
  const navigate = useNavigate();
  const [orgOpen, setOrgOpen] = useState(false);

  const activeOrg = user?.organisations.find((o) => o.organisationId === activeOrganisationId);

  function handleLogout() {
    logout();
    void navigate('/login');
  }

  return (
    <aside className="flex flex-col w-60 shrink-0 border-r bg-card h-screen sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2.5 h-14 px-4 border-b">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <BarChart3 size={14} className="text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm tracking-tight">Nexus Accounting</span>
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
                  onClick={() => {
                    setActiveOrganisation(org.organisationId);
                    setOrgOpen(false);
                  }}
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
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
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
          </div>
        ))}
      </nav>

      {/* User menu */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {user?.firstName[0]}{user?.lastName[0]}
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
