import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { BarChart3 } from 'lucide-react';

export function ForcePasswordChangePage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
    },
    onSuccess: async () => {
      // Refresh user profile so mustChangePassword becomes false
      const res = await api.get('/auth/me');
      setUser(res.data.data);
      void navigate('/dashboard', { replace: true });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to change password. Please try again.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    mutation.mutate();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <BarChart3 size={18} className="text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold">Set your password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your account requires a password change before you can continue.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          {user && (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.firstName} {user.lastName}</span>
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Temporary password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Enter current password"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">New password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="At least 8 characters"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Repeat new password"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
