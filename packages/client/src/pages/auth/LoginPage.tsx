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

// ── Palette (matches the brand backdrop) ──────────────────────────────────────
const TEAL = '#123f51';
const TEAL_DEEP = '#0e3243';
const GOLD = '#d3aa49';

// ── Small wordmark logo (top-left of the form) ────────────────────────────────
function NexusMark() {
  return (
    <svg width={34} height={34} viewBox="0 0 200 200" fill="none">
      <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" fill="#1e3a5f" />
      <defs>
        <clipPath id="mark-clip"><rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" /></clipPath>
      </defs>
      <g clipPath="url(#mark-clip)">
        <rect x="52" y="46" width="20" height="112" rx="10" fill="#ffffff" />
        <rect x="128" y="46" width="20" height="112" rx="10" fill="#ffffff" />
        <polygon points="52,46 72,46 148,158 128,158" fill="#ffffff" />
      </g>
    </svg>
  );
}

// ── Gold Nexus logo (diamond with cut-out N) for the brand backdrop ───────────
function GoldNexusLogo({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <defs>
        <clipPath id="gold-clip"><rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" /></clipPath>
      </defs>
      {/* gold diamond */}
      <rect x="18" y="18" width="164" height="164" rx="26" transform="rotate(45 100 100)" fill={GOLD} />
      {/* N cut out (teal showing through) */}
      <g clipPath="url(#gold-clip)">
        <rect x="52" y="46" width="20" height="112" rx="10" fill={TEAL} />
        <rect x="128" y="46" width="20" height="112" rx="10" fill={TEAL} />
        <polygon points="52,46 72,46 148,158 128,158" fill={TEAL} />
      </g>
    </svg>
  );
}

// ── Faint scattered "memphis" doodle pattern that fills the whole page ────────
function DoodleBackdrop() {
  const stroke = 'rgba(255,255,255,0.05)';
  const dot = 'rgba(255,255,255,0.05)';
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
      <defs>
        <pattern id="doodles" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(2)">
          <g fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {/* circle */}
            <circle cx="26" cy="28" r="11" />
            {/* X */}
            <path d="M62 18 L78 34 M78 18 L62 34" />
            {/* plus */}
            <path d="M118 16 V40 M106 28 H130" />
            {/* triangle */}
            <path d="M34 78 L52 78 L43 60 Z" />
            {/* squiggle */}
            <path d="M84 70 q8 -12 16 0 q8 12 16 0" />
            {/* small diamond */}
            <path d="M150 64 l12 12 l-12 12 l-12 -12 Z" />
            {/* wavy line */}
            <path d="M16 120 q10 -10 20 0 q10 10 20 0" />
            {/* chevron */}
            <path d="M150 116 l12 12 l-12 12" />
            {/* smiley-ish circle */}
            <circle cx="78" cy="132" r="13" />
            {/* bracket */}
            <path d="M120 150 q-12 0 -12 14 q0 14 12 14" />
            {/* short diagonal */}
            <path d="M40 158 L58 176" />
          </g>
          <g fill={dot}>
            {/* dot clusters & eyes */}
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
      <rect width="100%" height="100%" fill="url(#doodles)" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) => api.post<LoginResponse>('/auth/login', data).then((r) => r.data),
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
        @keyframes lp-card { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lp-logo { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
        @keyframes lp-ripple { 0%,100% { transform: scale(1); opacity: 0.55; } 50% { transform: scale(1.04); opacity: 0.8; } }
        .lp-input {
          width: 100%; border-radius: 999px; border: 1.5px solid #d6dde8; background: #fff;
          padding: 13px 18px 13px 46px; font-size: 12.5px; font-weight: 500; letter-spacing: 0.08em;
          color: #1e293b; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lp-input::placeholder { color: #9aa6b8; letter-spacing: 0.1em; font-weight: 600; }
        .lp-input:focus { border-color: #123f51; box-shadow: 0 0 0 4px rgba(18,63,81,0.1); }
        .lp-input.err { border-color: #dc2626; }
        .lp-divider { position: absolute; left: 46px; top: 50%; transform: translateY(-50%); width: 1.5px; height: 20px; background: #dbe1ea; pointer-events: none; }
        .lp-btn {
          width: 100%; padding: 13px; border-radius: 999px; background: #123f51; color: #fff;
          font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
          cursor: pointer; border: none; transition: background 0.18s, transform 0.1s, box-shadow 0.18s;
        }
        .lp-btn:hover:not(:disabled) { background: #0e3243; box-shadow: 0 10px 26px rgba(18,63,81,0.3); transform: translateY(-1px); }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: #475569; pointer-events: none; }
        .lp-eye { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #9aa6b8; padding: 4px; display: flex; }
        .lp-eye:hover { color: #475569; }
        @media (max-width: 900px) { .lp-brand { display: none !important; } }
      `}</style>

      {/* Full teal doodle backdrop */}
      <div style={{
        position: 'relative', minHeight: '100vh', overflow: 'hidden',
        background: `radial-gradient(120% 120% at 70% 30%, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <DoodleBackdrop />

        {/* Content row */}
        <div style={{
          position: 'relative', zIndex: 2, width: '100%', maxWidth: 1080,
          display: 'flex', alignItems: 'center', gap: 48,
        }}>

          {/* ── Form card (kept as-is) ── */}
          <div style={{
            flex: '0 0 400px', maxWidth: 400, width: '100%',
            background: '#fff', borderRadius: 22, padding: '36px 40px',
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
            animation: 'lp-card 0.6s ease-out both',
          }}>
            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <NexusMark />
              <div style={{ lineHeight: 1.05 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e3a5f' }}>Nexus Finance</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Tracker</div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 18, marginBottom: 22 }}>
              {/* Circular avatar emblem */}
              <div style={{
                width: 70, height: 70, borderRadius: '50%',
                background: `linear-gradient(135deg, ${TEAL} 0%, #1c5a72 100%)`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 22px rgba(18,63,81,0.3)',
              }}>
                <User size={34} color="#fff" strokeWidth={2.2} />
              </div>
            </div>

            <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} noValidate>
              <div style={{ marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <User size={16} className="lp-icon" />
                  <span className="lp-divider" />
                  <input type="email" autoComplete="email" placeholder="EMAIL ADDRESS"
                    className={`lp-input${errors.email ? ' err' : ''}`} {...register('email')} />
                </div>
                {errors.email && <p style={{ marginTop: 5, fontSize: 11.5, color: '#dc2626', paddingLeft: 18 }}>{errors.email.message}</p>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} className="lp-icon" />
                  <span className="lp-divider" />
                  <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="PASSWORD"
                    className={`lp-input${errors.password ? ' err' : ''}`} style={{ paddingRight: 44 }} {...register('password')} />
                  <button type="button" className="lp-eye" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p style={{ marginTop: 5, fontSize: 11.5, color: '#dc2626', paddingLeft: 18 }}>{errors.password.message}</p>}
              </div>

              {loginMutation.isError && (
                <div style={{ marginBottom: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', fontSize: 12.5, color: '#dc2626' }}>
                  {errorMessage}
                </div>
              )}

              <button type="submit" disabled={loginMutation.isPending} className="lp-btn">
                {loginMutation.isPending ? 'Signing in…' : 'Login'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ width: 13, height: 13, accentColor: TEAL }} />
                  Remember me
                </label>
                <span style={{ fontSize: 12, color: '#94a3b8', cursor: 'default' }} title="Contact your administrator to reset your password">
                  Forgot your password?
                </span>
              </div>
            </form>

            <p style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color: TEAL, fontWeight: 600, textDecoration: 'none' }}>Create one</Link>
            </p>
          </div>

          {/* ── Brand backdrop element (gold logo + ripples + tagline) ── */}
          <div className="lp-brand" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* Concentric rounded-square ripples */}
            <div style={{ position: 'relative', width: 460, height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {[460, 380, 300, 230].map((s, i) => (
                <div key={s} style={{
                  position: 'absolute', width: s, height: s, borderRadius: s * 0.28,
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  animation: `lp-ripple ${7 + i}s ease-in-out infinite`,
                }} />
              ))}
              <div style={{ animation: 'lp-logo 0.8s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                <GoldNexusLogo size={150} />
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>
                Nexus Finance Tracker
              </h1>
              <p style={{ color: GOLD, fontSize: 14, fontWeight: 500, letterSpacing: '0.04em' }}>
                Business Intelligence for Business Improvement
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
