import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
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

// ─── Wordmark logo (top-left of form) ──────────────────────────────────────────
function NexusMark() {
  return (
    <svg width={34} height={34} viewBox="0 0 200 200" fill="none">
      <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" fill="#1e3a5f" />
      <defs>
        <clipPath id="lp-mark-clip">
          <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" />
        </clipPath>
      </defs>
      <g clipPath="url(#lp-mark-clip)">
        <rect x="52" y="46" width="20" height="112" rx="10" fill="#ffffff" />
        <rect x="128" y="46" width="20" height="112" rx="10" fill="#ffffff" />
        <polygon points="52,46 72,46 148,158 128,158" fill="#ffffff" />
      </g>
    </svg>
  );
}

// ─── Fluid wave art (blue field + cream diagonal wave ribbon) ──────────────────
function FluidWave() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      viewBox="0 0 700 560"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="w-blue2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c4f9e" />
          <stop offset="45%" stopColor="#2f5cb4" />
          <stop offset="100%" stopColor="#1b3566" />
        </linearGradient>
        <linearGradient id="w-cream" x1="0.1" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#f6eed9" />
          <stop offset="48%" stopColor="#ecdfc1" />
          <stop offset="100%" stopColor="#d9c8a2" />
        </linearGradient>
        <radialGradient id="w-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5a86db" />
          <stop offset="100%" stopColor="#5a86db" stopOpacity="0" />
        </radialGradient>
        <filter id="w-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="w-softer" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="42" />
        </filter>
      </defs>

      {/* Blue base */}
      <rect x="0" y="0" width="700" height="560" fill="url(#w-blue2)" />

      {/* Bright blue glow — top right */}
      <ellipse cx="600" cy="70" rx="280" ry="240" fill="url(#w-glow)" filter="url(#w-softer)" />
      {/* Brighter wash — far right edge */}
      <ellipse cx="720" cy="320" rx="200" ry="320" fill="url(#w-glow)" filter="url(#w-softer)" opacity="0.7" />

      {/* Cream diagonal wave ribbon (soft-blurred) */}
      <g filter="url(#w-soft)">
        <path
          fill="url(#w-cream)"
          d="M 560 -60
             C 360 40, 470 210, 360 300
             C 285 360, 250 330, 210 400
             C 175 460, 250 520, 150 640
             L -80 640
             C -80 420, -80 120, -80 -60 Z"
        />
        {/* Cream bright crest highlight */}
        <path
          fill="#f8f1e0"
          opacity="0.55"
          d="M 470 -40
             C 330 70, 410 210, 320 290
             C 270 335, 250 320, 235 360
             C 250 330, 285 360, 360 300
             C 470 210, 360 40, 470 -40 Z"
        />
      </g>

      {/* Blue fold shadow along the wave's right edge (depth) */}
      <g filter="url(#w-soft)">
        <path
          fill="#16306a"
          opacity="0.45"
          d="M 380 280
             C 300 350, 270 330, 232 392
             C 270 345, 300 360, 372 300
             C 430 250, 410 200, 430 250
             C 415 240, 420 250, 380 280 Z"
        />
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
        @keyframes lp-wave {
          0%, 100% { transform: scale(1) translate(0,0); }
          50%      { transform: scale(1.05) translate(-1.2%, 1%); }
        }
        @keyframes lp-card {
          from { opacity: 0; transform: translateY(24px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lp-welcome {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .lp-input {
          width: 100%;
          border-radius: 999px;
          border: 1.5px solid #d6dde8;
          background: #ffffff;
          padding: 13px 18px 13px 58px;
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.08em;
          color: #1e293b;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lp-input::placeholder { color: #9aa6b8; letter-spacing: 0.1em; font-weight: 600; }
        .lp-input:focus {
          border-color: #1e3a5f;
          box-shadow: 0 0 0 4px rgba(30,58,95,0.08);
        }
        .lp-input.err { border-color: #dc2626; }
        .lp-divider {
          position: absolute; left: 46px; top: 50%;
          transform: translateY(-50%);
          width: 1.5px; height: 20px;
          background: #dbe1ea; pointer-events: none;
        }
        .lp-btn {
          width: 100%;
          padding: 13px;
          border-radius: 999px;
          background: #1a2b47;
          color: white;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          border: none;
          transition: background 0.18s, transform 0.1s, box-shadow 0.18s;
        }
        .lp-btn:hover:not(:disabled) {
          background: #11203a;
          box-shadow: 0 10px 26px rgba(17,32,58,0.3);
          transform: translateY(-1px);
        }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: #475569; pointer-events: none; }
        .lp-eye { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #9aa6b8; padding: 4px; display: flex; }
        .lp-eye:hover { color: #475569; }
        .lp-art { flex: 1; position: relative; overflow: hidden; }
        .lp-art-inner { position: absolute; inset: -4%; animation: lp-wave 20s ease-in-out infinite; }
        @media (max-width: 880px) {
          .lp-art { display: none; }
          .lp-form { flex: 1 1 100% !important; }
          .lp-card { height: auto !important; min-height: 0 !important; }
        }
      `}</style>

      {/* ── Dark navy page background ── */}
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #22386b 0%, #1c2f5c 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>

        {/* ── Centered card ── */}
        <div
          className="lp-card"
          style={{
            display: 'flex',
            width: '100%',
            maxWidth: 1060,
            height: 'min(86vh, 640px)',
            background: '#ffffff',
            borderRadius: 22,
            overflow: 'hidden',
            boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
            animation: 'lp-card 0.6s ease-out both',
          }}
        >

          {/* ── LEFT: minimal white form ── */}
          <div
            className="lp-form"
            style={{
              flex: '0 0 40%',
              display: 'flex',
              flexDirection: 'column',
              padding: '32px 44px',
              position: 'relative',
            }}
          >
            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <NexusMark />
              <div style={{ lineHeight: 1.05 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e3a5f' }}>Nexus Finance</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Tracker</div>
              </div>
            </div>

            {/* Centered form */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              width: '100%',
              maxWidth: 300,
              margin: '0 auto',
            }}>
              {/* Circular avatar emblem */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #2c4a8c 0%, #2f5cb4 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 30px',
                boxShadow: '0 8px 22px rgba(44,74,140,0.32)',
              }}>
                <User size={34} color="#ffffff" strokeWidth={2.2} />
              </div>

              <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} noValidate>
                {/* Email */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ position: 'relative' }}>
                    <User size={16} className="lp-icon" />
                    <span className="lp-divider" />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="EMAIL ADDRESS"
                      className={`lp-input${errors.email ? ' err' : ''}`}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p style={{ marginTop: 5, fontSize: 11.5, color: '#dc2626', paddingLeft: 18 }}>{errors.email.message}</p>}
                </div>

                {/* Password */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} className="lp-icon" />
                    <span className="lp-divider" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="PASSWORD"
                      className={`lp-input${errors.password ? ' err' : ''}`}
                      style={{ paddingRight: 44 }}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      className="lp-eye"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.password && <p style={{ marginTop: 5, fontSize: 11.5, color: '#dc2626', paddingLeft: 18 }}>{errors.password.message}</p>}
                </div>

                {loginMutation.isError && (
                  <div style={{
                    marginBottom: 14, borderRadius: 12,
                    background: '#fef2f2', border: '1px solid #fecaca',
                    padding: '10px 14px', fontSize: 12.5, color: '#dc2626',
                  }}>
                    {errorMessage}
                  </div>
                )}

                <button type="submit" disabled={loginMutation.isPending} className="lp-btn">
                  {loginMutation.isPending ? 'Signing in…' : 'Login'}
                </button>

                {/* Remember / forgot */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked style={{ width: 13, height: 13, accentColor: '#1e3a5f' }} />
                    Remember me
                  </label>
                  <span
                    style={{ fontSize: 12, color: '#94a3b8', cursor: 'default' }}
                    title="Contact your administrator to reset your password"
                  >
                    Forgot your password?
                  </span>
                </div>
              </form>
            </div>

            {/* Dots */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e3a5f' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />
            </div>
          </div>

          {/* ── RIGHT: fluid wave art ── */}
          <div className="lp-art">
            <div className="lp-art-inner">
              <FluidWave />
            </div>

            {/* Top-right sign-up pill */}
            <Link
              to="/register"
              style={{
                position: 'absolute', top: 28, right: 40, zIndex: 2,
                padding: '7px 20px', borderRadius: 22,
                background: '#16243b', color: 'white',
                fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em',
                textDecoration: 'none',
              }}
            >
              Sign up
            </Link>

            {/* Welcome block — lower right */}
            <div style={{
              position: 'absolute', right: 48, bottom: 64, zIndex: 2,
              textAlign: 'right', maxWidth: 360,
              animation: 'lp-welcome 0.7s 0.3s ease-out both',
            }}>
              <h2 style={{
                fontSize: 'clamp(2.6rem, 4.5vw, 3.6rem)', fontWeight: 800,
                color: 'white', lineHeight: 1, marginBottom: 12,
                letterSpacing: '-0.02em',
                textShadow: '0 6px 36px rgba(15,23,42,0.4)',
              }}>
                Welcome.
              </h2>
              <p style={{
                fontSize: 13.5, color: 'rgba(255,255,255,0.88)',
                lineHeight: 1.6,
                textShadow: '0 2px 14px rgba(15,23,42,0.35)',
              }}>
                Enterprise-grade financial management — IAS/IFRS compliant
                accounting, real-time statements, and Ghana GRA payroll.
              </p>
            </div>

            {/* Bottom-right sign-up prompt */}
            <div style={{
              position: 'absolute', right: 48, bottom: 28, zIndex: 2,
              fontSize: 12.5, color: 'rgba(255,255,255,0.7)',
            }}>
              Not a member?{' '}
              <Link to="/register" style={{ color: 'white', fontWeight: 700, textDecoration: 'none' }}>
                Sign up now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
