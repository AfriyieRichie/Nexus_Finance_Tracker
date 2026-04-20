import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: ({ confirmPassword: _, ...data }: RegisterForm) =>
      api.post('/auth/register', data).then((r) => r.data),
    onSuccess: async (result) => {
      const { tokens } = result.data as { tokens: { accessToken: string; refreshToken: string } };
      setTokens(tokens.accessToken, tokens.refreshToken);
      const profile = await api.get('/auth/me').then((r) => r.data.data);
      setUser(profile);
      void navigate('/dashboard');
    },
  });

  const fields = [
    { id: 'firstName', label: 'First name', type: 'text', autoComplete: 'given-name' },
    { id: 'lastName', label: 'Last name', type: 'text', autoComplete: 'family-name' },
    { id: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
    { id: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
    { id: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
  ] as const;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Nexus Accounting</p>
        </div>

        <form
          className="space-y-5"
          onSubmit={handleSubmit((d) => registerMutation.mutate(d))}
          noValidate
        >
          {fields.map(({ id, label, type, autoComplete }) => (
            <div key={id}>
              <label htmlFor={id} className="block text-sm font-medium mb-1.5">
                {label}
              </label>
              <input
                id={id}
                type={type}
                autoComplete={autoComplete}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register(id)}
              />
              {errors[id] && (
                <p className="mt-1 text-xs text-destructive">{errors[id]?.message}</p>
              )}
            </div>
          ))}

          {registerMutation.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3">
              <p className="text-sm text-destructive">
                {(registerMutation.error as { response?: { data?: { error?: { message?: string } } } })
                  ?.response?.data?.error?.message ?? 'Registration failed. Please try again.'}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {registerMutation.isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
