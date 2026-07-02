import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import {
  LayoutDashboard, FileText, BookOpen, Scale,
  Users, ShoppingCart, Package, Archive,
  PiggyBank, TrendingUp,
  Landmark, Receipt, ArrowRight,
} from 'lucide-react';

// ── Palette (matches the Nexus BI brand backdrop) ─────────────────────────────
const TEAL = '#123f51';
const TEAL_DEEP = '#0e3243';
const GOLD = '#d3aa49';

// ── Faint scattered "memphis" doodle pattern that fills the whole page ────────
function DoodleBackdrop() {
  const stroke = 'rgba(255,255,255,0.05)';
  const dot = 'rgba(255,255,255,0.05)';
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
      <defs>
        <pattern id="land-doodles" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(2)">
          <g fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="26" cy="28" r="11" />
            <path d="M62 18 L78 34 M78 18 L62 34" />
            <path d="M118 16 V40 M106 28 H130" />
            <path d="M34 78 L52 78 L43 60 Z" />
            <path d="M84 70 q8 -12 16 0 q8 12 16 0" />
            <path d="M150 64 l12 12 l-12 12 l-12 -12 Z" />
            <path d="M16 120 q10 -10 20 0 q10 10 20 0" />
            <path d="M150 116 l12 12 l-12 12" />
            <circle cx="78" cy="132" r="13" />
            <path d="M120 150 q-12 0 -12 14 q0 14 12 14" />
            <path d="M40 158 L58 176" />
          </g>
          <g fill={dot}>
            <circle cx="150" cy="34" r="2.6" />
            <circle cx="160" cy="40" r="2.6" />
            <circle cx="170" cy="34" r="2.6" />
            <circle cx="73" cy="129" r="2.2" />
            <circle cx="83" cy="129" r="2.2" />
            <circle cx="180" cy="150" r="2.6" />
            <circle cx="20" cy="186" r="2.6" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#land-doodles)" />
    </svg>
  );
}

// ── Module tile data ──────────────────────────────────────────────────────────
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

// ── Page ──────────────────────────────────────────────────────────────────────
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
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ripplePulse { 0%,100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.04); opacity: 0.75; } }
        .tile:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(211,170,73,0.35);
          transform: translateY(-4px);
          box-shadow: 0 14px 44px rgba(0,0,0,0.35);
        }
        .tile { transition: background 0.2s, border-color 0.2s, transform 0.22s, box-shadow 0.22s; }
        .enter-btn:hover {
          background: #e0b95c;
          box-shadow: 0 0 32px rgba(211,170,73,0.4);
        }
        .enter-btn { transition: background 0.2s, box-shadow 0.2s; }
      `}</style>

      {/* Full teal doodle backdrop */}
      <div
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
        style={{ background: `radial-gradient(120% 120% at 50% 25%, ${TEAL} 0%, ${TEAL_DEEP} 100%)` }}
      >
        <DoodleBackdrop />

        {/* ── Main content ── */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-12 w-full max-w-5xl mx-auto">

          {/* Logo with concentric ripple rings */}
          <div
            className="relative flex items-center justify-center"
            style={{ width: 220, height: 220, animation: 'logoIn 0.85s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
          >
            {[220, 178, 138].map((s, i) => (
              <div key={s} style={{
                position: 'absolute', width: s, height: s, borderRadius: s * 0.28,
                border: '1.5px solid rgba(255,255,255,0.09)',
                animation: `ripplePulse ${7 + i}s ease-in-out infinite`,
              }} />
            ))}
            <img src="/nexus-logo.png" alt="Nexus" style={{ width: 112, height: 112, objectFit: 'contain' }} />
          </div>

          {/* Brand name */}
          <div className="text-center" style={{ animation: 'fadeUp 0.65s 0.45s ease-out both' }}>
            <h1
              className="font-black tracking-[0.18em] uppercase"
              style={{ fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', color: 'rgba(255,255,255,0.96)', letterSpacing: '0.22em' }}
            >
              NEXUS{' '}
              <span style={{ color: GOLD }}>FINANCE</span>
              {' '}TRACKER
            </h1>
            <p className="mt-2 font-light tracking-[0.3em] uppercase text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Business Intelligence for Business Improvement
            </p>
          </div>

          {/* Welcome line */}
          {user && (
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm"
              style={{
                animation: 'fadeUp 0.6s 0.65s ease-out both',
                borderColor: 'rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: 'rgba(211,170,73,0.28)', color: GOLD }}
              >
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
              <span>
                Welcome back,{' '}
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{user.firstName}</strong>
              </span>
              {activeOrg && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
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
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  animation: `fadeUp 0.45s ${0.85 + i * 0.055}s ease-out both`,
                  textDecoration: 'none',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(211,170,73,0.16)' }}
                >
                  <Icon size={15} style={{ color: GOLD }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
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
              background: GOLD,
              color: TEAL_DEEP,
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
            style={{ animation: 'fadeUp 0.4s 1.7s ease-out both', color: 'rgba(255,255,255,0.22)' }}
          >
            Nexus Finance Tracker · IAS / IFRS Compliant
          </p>
        </div>
      </div>
    </>
  );
}

// redeploy trigger 1780427650
