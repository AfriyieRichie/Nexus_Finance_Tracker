import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import {
  LayoutDashboard, FileText, BookOpen, Scale,
  Users, ShoppingCart, Package, Archive,
  PiggyBank, TrendingUp,
  Landmark, Receipt, ArrowRight,
} from 'lucide-react';

// ─── Nexus "N" Logo (faithful SVG recreation) ────────────────────────────────

function NexusLogo({ size = 120 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Diamond with rounded tips: rotate a rounded-corner rect 45° */}
      <rect
        x="18" y="18"
        width="164" height="164"
        rx="26"
        transform="rotate(45 100 100)"
        fill="white"
      />

      {/* The N — clipped to the diamond boundary */}
      <defs>
        <clipPath id="n-clip">
          <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" />
        </clipPath>
      </defs>

      <g clipPath="url(#n-clip)">
        {/* Left vertical bar — rounded bottom */}
        <rect x="52" y="46" width="20" height="112" rx="10" fill="#0a0a0f" />
        {/* Right vertical bar — fully rendered, top clipped by diamond */}
        <rect x="128" y="46" width="20" height="112" rx="10" fill="#0a0a0f" />
        {/* Diagonal stroke — parallelogram from top-left to bottom-right */}
        <polygon points="52,46 72,46 148,158 128,158" fill="#0a0a0f" />
      </g>
    </svg>
  );
}

// ─── Module tile data ─────────────────────────────────────────────────────────

const MODULES = [
  { to: '/dashboard',              icon: LayoutDashboard, label: 'Dashboard',           desc: 'KPIs & live overview' },
  { to: '/journals',               icon: FileText,        label: 'Journal Entries',     desc: 'GL postings & approvals' },
  { to: '/accounts',               icon: BookOpen,        label: 'Chart of Accounts',   desc: 'Account structure' },
  { to: '/ledger/trial-balance',   icon: Scale,           label: 'Trial Balance',       desc: 'Balance snapshot & drilldown' },
  { to: '/ar',                     icon: Users,           label: 'Receivables',         desc: 'Customer invoices & payments' },
  { to: '/ap',                     icon: ShoppingCart,    label: 'Payables',            desc: 'Supplier bills & payments' },
  { to: '/assets',                 icon: Package,         label: 'Fixed Assets',        desc: 'IAS 16/36 depreciation' },
  { to: '/inventory',              icon: Archive,         label: 'Inventory',           desc: 'IAS 2 stock management' },
  { to: '/bank',                   icon: Landmark,        label: 'Bank Reconciliation', desc: 'Statement matching' },
  { to: '/budgets',                icon: PiggyBank,       label: 'Budgets & Planning',  desc: 'Cost centres & variance' },
  { to: '/payroll',                icon: Receipt,         label: 'Payroll',             desc: 'Ghana GRA compliant' },
  { to: '/reports/balance-sheet',  icon: TrendingUp,      label: 'Financial Reports',   desc: 'IAS 1 statements' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const { user, activeOrganisationId } = useAuthStore((s) => ({
    user: s.user,
    activeOrganisationId: s.activeOrganisationId,
  }));

  const activeOrg = user?.organisations.find(
    (o) => o.organisationId === activeOrganisationId,
  );

  return (
    <>
      <style>{`
        @keyframes logoIn {
          from { opacity: 0; transform: scale(0.35) rotate(-12deg); filter: blur(8px); }
          to   { opacity: 1; transform: scale(1)    rotate(0deg);   filter: blur(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes gridPulse {
          0%, 100% { opacity: 0.04; }
          50%       { opacity: 0.07; }
        }
        .tile:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.18);
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
        }
        .tile { transition: background 0.2s, border-color 0.2s, transform 0.22s, box-shadow 0.22s; }
        .enter-btn:hover {
          background: rgba(255,255,255,0.95);
          color: #050508;
          box-shadow: 0 0 32px rgba(255,255,255,0.25);
        }
        .enter-btn { transition: background 0.2s, color 0.2s, box-shadow 0.2s; }
        .dot-grid {
          background-image: radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px);
          background-size: 28px 28px;
          animation: gridPulse 6s ease-in-out infinite;
        }
        .logo-glow {
          filter: drop-shadow(0 0 28px rgba(255,255,255,0.2)) drop-shadow(0 0 72px rgba(140,120,255,0.15));
        }
      `}</style>

      {/* Full-screen dark stage */}
      <div
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #050508 0%, #0c0c18 50%, #080810 100%)' }}
      >
        {/* Subtle dot-grid background */}
        <div className="absolute inset-0 dot-grid pointer-events-none" />

        {/* Faint radial glow behind logo */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '50%', left: '50%',
            transform: 'translate(-50%, -58%)',
            width: 640, height: 640,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(100,80,220,0.08) 0%, transparent 70%)',
          }}
        />

        {/* ── Main content ── */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-12 w-full max-w-5xl mx-auto">

          {/* Logo */}
          <div
            className="logo-glow"
            style={{ animation: 'logoIn 0.85s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
          >
            <NexusLogo size={108} />
          </div>

          {/* Brand name */}
          <div
            className="text-center"
            style={{ animation: 'fadeUp 0.65s 0.45s ease-out both' }}
          >
            <h1
              className="font-black tracking-[0.18em] uppercase"
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 2.6rem)',
                color: 'rgba(255,255,255,0.95)',
                letterSpacing: '0.22em',
              }}
            >
              NEXUS{' '}
              <span style={{ color: 'rgba(160,148,255,0.9)' }}>FINANCE</span>
              {' '}TRACKER
            </h1>
            <p
              className="mt-2 font-light tracking-[0.3em] uppercase text-xs"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Professional Accounting · Built for Africa
            </p>
          </div>

          {/* Welcome line */}
          {user && (
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm"
              style={{
                animation: 'fadeUp 0.6s 0.65s ease-out both',
                borderColor: 'rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: 'rgba(160,148,255,0.25)', color: 'rgba(200,190,255,0.9)' }}
              >
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
              <span>
                Welcome back,{' '}
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{user.firstName}</strong>
              </span>
              {activeOrg && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                  <span>{activeOrg.organisationName}</span>
                </>
              )}
            </div>
          )}

          {/* Module grid */}
          <div
            className="w-full grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              animation: 'fadeUp 0.5s 0.8s ease-out both',
            }}
          >
            {MODULES.map(({ to, icon: Icon, label, desc }, i) => (
              <Link
                key={to}
                to={to}
                className="tile rounded-xl p-4 flex flex-col gap-2.5 cursor-pointer no-underline"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  animation: `fadeUp 0.45s ${0.85 + i * 0.055}s ease-out both`,
                  textDecoration: 'none',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(160,148,255,0.12)' }}
                >
                  <Icon size={15} style={{ color: 'rgba(185,175,255,0.85)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>
                    {label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    {desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* Primary CTA */}
          <Link
            to="/dashboard"
            className="enter-btn flex items-center gap-2.5 px-7 py-3 rounded-full font-semibold text-sm mt-2"
            style={{
              animation: 'fadeUp 0.5s 1.55s ease-out both',
              background: 'rgba(255,255,255,0.88)',
              color: '#050508',
              textDecoration: 'none',
              letterSpacing: '0.02em',
            }}
          >
            Open Dashboard
            <ArrowRight size={15} />
          </Link>

          {/* Footer */}
          <p
            className="text-[10px] tracking-widest uppercase mt-2"
            style={{
              animation: 'fadeUp 0.4s 1.7s ease-out both',
              color: 'rgba(255,255,255,0.18)',
            }}
          >
            Nexus Finance Tracker · IAS / IFRS Compliant
          </p>
        </div>
      </div>
    </>
  );
}
