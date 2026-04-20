import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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

export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) =>
      api.post<LoginResponse>('/auth/login', data).then((r) => r.data),
    onSuccess: async (result) => {
      const { tokens } = result.data;
      setTokens(tokens.accessToken, tokens.refreshToken);
      // Fetch full profile
      const profile = await api.get('/auth/me').then((r) => r.data.data);
      setUser(profile);
      void navigate('/dashboard');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Nexus Accounting</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <form
          className="space-y-6"
          onSubmit={handleSubmit((d) => loginMutation.mutate(d))}
          noValidate
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
          </div>

          {loginMutation.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
              <p className="text-sm text-destructive">
                {(loginMutation.error as { response?: { data?: { error?: { message?: string } } } })
                  ?.response?.data?.error?.message ?? 'Login failed. Please try again.'}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
