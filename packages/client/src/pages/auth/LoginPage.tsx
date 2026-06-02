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
        @keyframes blobFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(60px, -40px) scale(1.15); }
          66%      { transform: translate(-30px, 50px) scale(0.92); }
        }
        @keyframes blobFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40%      { transform: translate(-70px, 40px) scale(1.2); }
          75%      { transform: translate(40px, -30px) scale(0.9); }
        }
        @keyframes blobFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(50px, 60px) scale(1.1); }
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
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          background: #f8fafc;
          padding: 12px 14px 12px 42px;
          font-size: 14px;
          color: #1e293b;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .lp-input::placeholder { color: #94a3b8; }
        .lp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
          background: #ffffff;
        }
        .lp-input.err { border-color: #dc2626; background: #fef2f2; }
        .lp-btn {
          width: 100%;
          padding: 13px;
          border-radius: 10px;
          background: #1e3a5f;
          color: white;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          border: none;
          transition: background 0.18s, transform 0.1s, box-shadow 0.18s;
        }
        .lp-btn:hover:not(:disabled) {
          background: #16304f;
          box-shadow: 0 8px 24px rgba(30,58,95,0.28);
          transform: translateY(-1px);
        }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-icon {
          position: absolute; left: 14px; top: 50%;
          transform: translateY(-50%);
          color: #94a3b8; pointer-events: none;
        }
        .lp-eye {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94a3b8; padding: 4px; display: flex;
        }
        .lp-eye:hover { color: #475569; }
        /* Right gradient art panel */
        .lp-art {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: #1e3a8a;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 56px;
        }
        .lp-blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.9; }
        /* Responsive: hide art panel on narrow screens */
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
            flex: '0 0 42%',
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
              width: 64, height: 64, borderRadius: 18,
              background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24, boxShadow: '0 8px 24px rgba(30,58,95,0.25)',
            }}>
              <NexusLogo size={36} />
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 30 }}>
              Sign in to your account to continue
            </p>

            <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} noValidate>
              {/* Email */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
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
                {errors.email && <p style={{ marginTop: 5, fontSize: 12, color: '#dc2626' }}>{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} className="lp-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`lp-input${errors.password ? ' err' : ''}`}
                    style={{ paddingRight: 42 }}
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
                {errors.password && <p style={{ marginTop: 5, fontSize: 12, color: '#dc2626' }}>{errors.password.message}</p>}
              </div>

              {/* Remember / forgot row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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
                  marginBottom: 18, borderRadius: 10,
                  background: '#fef2f2', border: '1px solid #fecaca',
                  padding: '11px 14px', fontSize: 13, color: '#dc2626',
                }}>
                  {errorMessage}
                </div>
              )}

              <button type="submit" disabled={loginMutation.isPending} className="lp-btn">
                {loginMutation.isPending ? 'Signing in…' : 'Login'}
              </button>
            </form>

            <p style={{ marginTop: 26, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
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

        {/* ── RIGHT: animated gradient art panel ── */}
        <div className="lp-art">
          {/* Flowing blobs */}
          <div className="lp-blob" style={{ width: 460, height: 460, top: '-12%', left: '6%', background: '#2563eb', animation: 'blobFloat1 16s ease-in-out infinite' }} />
          <div className="lp-blob" style={{ width: 420, height: 420, top: '24%', right: '-8%', background: '#60a5fa', animation: 'blobFloat2 19s ease-in-out infinite' }} />
          <div className="lp-blob" style={{ width: 480, height: 480, bottom: '-18%', left: '28%', background: '#ead9b8', opacity: 0.75, animation: 'blobFloat3 21s ease-in-out infinite' }} />
          <div className="lp-blob" style={{ width: 360, height: 360, top: '40%', left: '34%', background: '#1e3a8a', animation: 'blobFloat1 23s ease-in-out infinite reverse' }} />
          <div className="lp-blob" style={{ width: 300, height: 300, bottom: '6%', right: '14%', background: '#f0e6d2', opacity: 0.6, animation: 'blobFloat2 17s ease-in-out infinite' }} />

          {/* Top-right register link */}
          <Link
            to="/register"
            style={{
              position: 'absolute', top: 40, right: 56, zIndex: 2,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 18px', borderRadius: 22,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white', fontSize: 13, fontWeight: 600,
              textDecoration: 'none', backdropFilter: 'blur(8px)',
            }}
          >
            Sign up
          </Link>

          {/* Welcome text */}
          <div style={{ position: 'relative', zIndex: 2, animation: 'welcomeIn 0.7s 0.3s ease-out both' }}>
            <h2 style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 800,
              color: 'white', lineHeight: 1.05, marginBottom: 16,
              letterSpacing: '-0.02em',
              textShadow: '0 4px 30px rgba(0,0,0,0.2)',
            }}>
              Welcome.
            </h2>
            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,0.85)',
              maxWidth: 420, lineHeight: 1.6,
              textShadow: '0 2px 12px rgba(0,0,0,0.2)',
            }}>
              Enterprise-grade financial management — IAS/IFRS compliant accounting,
              real-time statements, and Ghana GRA payroll, all in one place.
            </p>
            <div style={{
              marginTop: 28, display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em',
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
