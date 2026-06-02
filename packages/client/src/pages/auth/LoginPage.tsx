import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

interface LoginResponse {
  data: {
    user: { id: string; email: string; firstName: string; lastName: string };
    tokens: { accessToken: string; refreshToken: string };
  };
}

// ─── Nexus diamond-N logo ──────────────────────────────────────────────────────
function NexusLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" fill="#1e3a5f" />
      <defs>
        <clipPath id="lp-clip">
          <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" />
        </clipPath>
      </defs>
      <g clipPath="url(#lp-clip)">
        <rect x="52" y="46" width="20" height="112" rx="10" fill="#ffffff" />
        <rect x="128" y="46" width="20" height="112" rx="10" fill="#ffffff" />
        <polygon points="52,46 72,46 148,158 128,158" fill="#ffffff" />
      </g>
    </svg>
  );
}

// ─── Fluid gradient art (SVG — blue → cream liquid drape) ──────────────────────
function FluidArt() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      viewBox="0 0 600 820"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="fa-base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="35%" stopColor="#2563eb" />
          <stop offset="62%" stopColor="#5f7fb8" />
          <stop offset="82%" stopColor="#cabf9f" />
          <stop offset="100%" stopColor="#f0e6cf" />
        </linearGradient>
        <linearGradient id="fa-cream" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5ecd6" />
          <stop offset="100%" stopColor="#d8c8a4" />
        </linearGradient>
        <radialGradient id="fa-blue" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4f8ef7" />
          <stop offset="100%" stopColor="#4f8ef7" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fa-fold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#12235f" />
          <stop offset="100%" stopColor="#12235f" stopOpacity="0" />
        </radialGradient>
        <filter id="fa-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="48" />
        </filter>
      </defs>

      {/* Base diagonal drape: blue (top-left) → cream (bottom-right) */}
      <rect x="0" y="0" width="600" height="820" fill="url(#fa-base)" />

      {/* Soft organic highlights, all blurred together for a liquid feel */}
      <g filter="url(#fa-blur)">
        {/* Bright blue highlight — upper left */}
        <ellipse cx="170" cy="160" rx="240" ry="220" fill="url(#fa-blue)" />
        {/* Bright blue highlight — right edge */}
        <ellipse cx="560" cy="300" rx="220" ry="260" fill="url(#fa-blue)" />
        {/* Dark fold/valley — diagonal through the middle (gives the 3D liquid drape) */}
        <ellipse cx="300" cy="430" rx="120" ry="300" fill="url(#fa-fold)" transform="rotate(28 300 430)" />
        {/* Cream pool — lower right */}
        <ellipse cx="470" cy="660" rx="280" ry="240" fill="url(#fa-cream)" opacity="0.9" />
        {/* Cream sweep — bottom */}
        <ellipse cx="240" cy="780" rx="300" ry="180" fill="url(#fa-cream)" opacity="0.75" />
      </g>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) =>
      api.post<LoginResponse>('/auth/login', data).then((r) => r.data),
    onSuccess: async (result) => {
      const { tokens } = result.data;
      setTokens(tokens.accessToken, tokens.refreshToken);
      const profile = await api.get('/auth/me').then((r) => r.data.data);
      setUser(profile);
      void navigate('/');
    },
  });

  const errorMessage =
    (loginMutation.error as { response?: { data?: { error?: { message?: string } } } })
      ?.response?.data?.error?.message ?? 'Invalid email or password.';

  return (
    <>
      <style>{`
        @keyframes f-drift {
          0%, 100% { transform: scale(1) translate(0, 0); }
          50%      { transform: scale(1.06) translate(-1.5%, 1.5%); }
        }
        @keyframes formIn {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes welcomeIn {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .lp-input {
          width: 100%;
          border-radius: 999px;
          border: 1.5px solid #e8ecf2;
          background: #f5f7fb;
          padding: 13px 18px 13px 46px;
          font-size: 14px;
          color: #1e293b;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .lp-input::placeholder { color: #9aa6b8; }
        .lp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37,99,235,0.1);
          background: #ffffff;
        }
        .lp-input.err { border-color: #dc2626; background: #fef2f2; }
        .lp-btn {
          width: 100%;
          padding: 14px;
          border-radius: 999px;
          background: #16243b;
          color: white;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          border: none;
          transition: background 0.18s, transform 0.1s, box-shadow 0.18s;
        }
        .lp-btn:hover:not(:disabled) {
          background: #0f1a2e;
          box-shadow: 0 10px 28px rgba(22,36,59,0.3);
          transform: translateY(-1px);
        }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-icon {
          position: absolute; left: 17px; top: 50%;
          transform: translateY(-50%);
          color: #9aa6b8; pointer-events: none;
        }
        .lp-eye {
          position: absolute; right: 16px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #9aa6b8; padding: 4px; display: flex;
        }
        .lp-eye:hover { color: #475569; }
        .lp-art {
          flex: 1;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 56px;
        }
        .lp-art-inner {
          position: absolute; inset: -4%;
          animation: f-drift 18s ease-in-out infinite;
        }
        @media (max-width: 900px) {
          .lp-art { display: none; }
          .lp-form-panel { flex: 1 1 100% !important; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#ffffff' }}>

        {/* ── LEFT: white form panel ── */}
        <div
          className="lp-form-panel"
          style={{
            flex: '0 0 40%',
            display: 'flex',
            flexDirection: 'column',
            padding: '40px 56px',
            position: 'relative',
          }}
        >
          {/* Wordmark top-left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NexusLogo size={34} />
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e3a5f', letterSpacing: '0.02em' }}>
                Nexus Finance
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Tracker
              </div>
            </div>
          </div>

          {/* Centered form block */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              maxWidth: 360,
              width: '100%',
              margin: '0 auto',
              animation: 'formIn 0.6s 0.1s ease-out both',
            }}
          >
            {/* Emblem */}
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 22, boxShadow: '0 8px 24px rgba(30,58,95,0.25)',
            }}>
              <NexusLogo size={34} />
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 30 }}>
              Sign in to your account to continue
            </p>

            <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} noValidate>
              {/* Email */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7, paddingLeft: 4 }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} className="lp-icon" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className={`lp-input${errors.email ? ' err' : ''}`}
                    {...register('email')}
                  />
                </div>
                {errors.email && <p style={{ marginTop: 5, fontSize: 12, color: '#dc2626', paddingLeft: 18 }}>{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7, paddingLeft: 4 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} className="lp-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`lp-input${errors.password ? ' err' : ''}`}
                    style={{ paddingRight: 46 }}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    className="lp-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p style={{ marginTop: 5, fontSize: 12, color: '#dc2626', paddingLeft: 18 }}>{errors.password.message}</p>}
              </div>

              {/* Remember / forgot row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, paddingLeft: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ width: 14, height: 14, accentColor: '#1e3a5f' }} />
                  Remember me
                </label>
                <span
                  style={{ fontSize: 13, color: '#94a3b8', cursor: 'default' }}
                  title="Contact your administrator to reset your password"
                >
                  Forgot password?
                </span>
              </div>

              {loginMutation.isError && (
                <div style={{
                  marginBottom: 18, borderRadius: 12,
                  background: '#fef2f2', border: '1px solid #fecaca',
                  padding: '11px 16px', fontSize: 13, color: '#dc2626',
                }}>
                  {errorMessage}
                </div>
              )}

              <button type="submit" disabled={loginMutation.isPending} className="lp-btn">
                {loginMutation.isPending ? 'Signing in…' : 'Login'}
              </button>
            </form>

            <p style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Create one
              </Link>
            </p>
          </div>

          {/* Decorative dots bottom-left */}
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e3a5f' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />
          </div>
        </div>

        {/* ── RIGHT: fluid gradient art panel ── */}
        <div className="lp-art">
          <div className="lp-art-inner">
            <FluidArt />
          </div>

          {/* Top-right register link */}
          <Link
            to="/register"
            style={{
              position: 'absolute', top: 40, right: 56, zIndex: 2,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 20px', borderRadius: 22,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.12)',
              color: 'white', fontSize: 13, fontWeight: 600,
              textDecoration: 'none', backdropFilter: 'blur(8px)',
            }}
          >
            Sign up
          </Link>

          {/* Welcome text */}
          <div style={{ position: 'relative', zIndex: 2, animation: 'welcomeIn 0.7s 0.3s ease-out both' }}>
            <h2 style={{
              fontSize: 'clamp(2.8rem, 5.5vw, 4.5rem)', fontWeight: 800,
              color: 'white', lineHeight: 1, marginBottom: 18,
              letterSpacing: '-0.02em',
              textShadow: '0 6px 40px rgba(15,23,42,0.35)',
            }}>
              Welcome.
            </h2>
            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,0.9)',
              maxWidth: 430, lineHeight: 1.65,
              textShadow: '0 2px 16px rgba(15,23,42,0.3)',
            }}>
              Enterprise-grade financial management — IAS/IFRS compliant
              accounting, real-time statements, and Ghana GRA payroll, all in one place.
            </p>
            <div style={{
              marginTop: 30, display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em',
              textShadow: '0 2px 12px rgba(15,23,42,0.3)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              NEXUS FINANCE TRACKER · v1.1
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
