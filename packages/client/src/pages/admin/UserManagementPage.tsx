import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Shield, KeyRound, UserX, UserCheck, Lock, Pencil } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import * as usersSvc from '@/services/users.service';
import { ROLE_LABELS, ASSIGNABLE_ROLES } from '@/services/users.types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserRole } from '@/services/users.types';

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'An error occurred';
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────
function AddUserDialog({ organisationId, onSuccess }: { organisationId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', jobTitle: '',
    role: 'ACCOUNTANT' as UserRole, temporaryPassword: '', confirmPassword: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => usersSvc.createOrgUser(organisationId, {
      email: form.email, firstName: form.firstName, lastName: form.lastName,
      jobTitle: form.jobTitle || undefined, role: form.role,
      temporaryPassword: form.temporaryPassword,
    }),
    onSuccess: () => { setOpen(false); setForm({ email: '', firstName: '', lastName: '', jobTitle: '', role: 'ACCOUNTANT', temporaryPassword: '', confirmPassword: '' }); onSuccess(); },
  });

  const passwordMatch = form.temporaryPassword === form.confirmPassword;
  const canSave = form.email && form.firstName && form.lastName && form.temporaryPassword.length >= 8 && passwordMatch;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus size={14} /> Add User</Button>
      </DialogTrigger>
      <DialogContent title="Add New User" description="Create a user account. The user must change their password on first login.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">First Name *</label>
              <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Eric" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Last Name *</label>
              <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Boateng" className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Email Address *</label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="eric@company.com" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Job Title</label>
            <Input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Finance Officer" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Role *</label>
            <Select value={form.role} onChange={(e) => set('role', e.target.value as UserRole)} className="h-8 text-xs">
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Set a temporary password — the user will be required to change it on first login.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Temporary Password *</label>
                <Input type="password" value={form.temporaryPassword} onChange={(e) => set('temporaryPassword', e.target.value)} placeholder="Min. 8 characters" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Confirm Password *</label>
                <Input type="password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Repeat password" className="h-8 text-xs" />
              </div>
            </div>
            {form.confirmPassword && !passwordMatch && <p className="text-xs text-destructive mt-1">Passwords do not match</p>}
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Creating…' : 'Create User'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Password Dialog ────────────────────────────────────────────────────
function ResetPasswordDialog({ organisationId, userId, userName, onSuccess }: {
  organisationId: string; userId: string; userName: string; onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: () => usersSvc.adminResetPassword(organisationId, userId, newPassword),
    onSuccess: () => { setOpen(false); setNewPassword(''); setConfirm(''); onSuccess(); },
  });

  const match = newPassword === confirm;
  const canSave = newPassword.length >= 8 && match;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1 text-muted-foreground hover:text-foreground" title="Reset password"><KeyRound size={13} /></button>
      </DialogTrigger>
      <DialogContent title={`Reset Password — ${userName}`} description="Set a new temporary password. The user must change it on next login.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">New Temporary Password *</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Confirm Password *</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" className="h-8 text-xs" />
          </div>
          {confirm && !match && <p className="text-xs text-destructive">Passwords do not match</p>}
          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Resetting…' : 'Reset Password'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Change Role Dialog ───────────────────────────────────────────────────────
function ChangeRoleDialog({ organisationId, userId, userName, currentRole, onSuccess }: {
  organisationId: string; userId: string; userName: string; currentRole: UserRole; onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRole>(currentRole);

  const mutation = useMutation({
    mutationFn: () => usersSvc.updateUserRole(organisationId, userId, role),
    onSuccess: () => { setOpen(false); onSuccess(); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1 text-muted-foreground hover:text-foreground" title="Change role"><Pencil size={13} /></button>
      </DialogTrigger>
      <DialogContent title={`Change Role — ${userName}`} description="Update the user's access role.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Role</label>
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="h-8 text-xs">
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          {mutation.isError && <p className="text-xs text-destructive">{errMsg(mutation.error)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" disabled={role === currentRole || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Saving…' : 'Save Role'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function UserManagementPage() {
  const organisationId = useAuthStore((s) => s.activeOrganisationId) ?? '';
  const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['org-users', organisationId] });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['org-users', organisationId],
    queryFn: () => usersSvc.listOrgUsers(organisationId),
    enabled: !!organisationId,
  });

  const statusMut = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      usersSvc.setUserStatus(organisationId, userId, isActive),
    onSuccess: invalidate,
  });

  const unlockMut = useMutation({
    mutationFn: (userId: string) => usersSvc.unlockUser(organisationId, userId),
    onSuccess: invalidate,
  });

  const isLocked = (u: usersSvc.OrgUser) => {
    if (!u.lockedAt) return false;
    return new Date(u.lockedAt).getTime() + 30 * 60 * 1000 > Date.now();
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">User Management</h1>
            <p className="text-xs text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''} in this organisation</p>
          </div>
        </div>
        <AddUserDialog organisationId={organisationId} onSuccess={invalidate} />
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: users.length, icon: <Users size={14} /> },
              { label: 'Active', value: users.filter((u) => u.orgIsActive).length, icon: <UserCheck size={14} /> },
              { label: 'Must Change Password', value: users.filter((u) => u.mustChangePassword).length, icon: <KeyRound size={14} /> },
              { label: 'Locked', value: users.filter(isLocked).length, icon: <Lock size={14} /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                <div className="text-muted-foreground">{icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const locked = isLocked(u);
                  const isSelf = u.id === currentUserId;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                            {u.firstName?.[0]}{u.lastName?.[0]}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{u.firstName} {u.lastName}</p>
                            {isSelf && <p className="text-[10px] text-muted-foreground">You</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.jobTitle || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          <Shield size={9} className="mr-1" />
                          {ROLE_LABELS[u.role as UserRole] ?? u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.orgIsActive ? 'success' : 'secondary'} className="text-[10px]">
                          {u.orgIsActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmt(u.lastLoginAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {u.mustChangePassword && (
                            <Badge variant="warning" className="text-[10px]">
                              <KeyRound size={9} className="mr-1" /> Temp pwd
                            </Badge>
                          )}
                          {locked && (
                            <Badge variant="destructive" className="text-[10px]">
                              <Lock size={9} className="mr-1" /> Locked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {!isSelf && (
                          <div className="flex items-center gap-1">
                            <ChangeRoleDialog
                              organisationId={organisationId}
                              userId={u.id}
                              userName={`${u.firstName} ${u.lastName}`}
                              currentRole={u.role as UserRole}
                              onSuccess={invalidate}
                            />
                            <ResetPasswordDialog
                              organisationId={organisationId}
                              userId={u.id}
                              userName={`${u.firstName} ${u.lastName}`}
                              onSuccess={invalidate}
                            />
                            {locked && (
                              <button
                                onClick={() => unlockMut.mutate(u.id)}
                                className="p-1 text-muted-foreground hover:text-foreground"
                                title="Unlock account"
                              >
                                <Lock size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => statusMut.mutate({ userId: u.id, isActive: !u.orgIsActive })}
                              className={`p-1 ${u.orgIsActive ? 'text-muted-foreground hover:text-destructive' : 'text-muted-foreground hover:text-success'}`}
                              title={u.orgIsActive ? 'Deactivate user' : 'Reactivate user'}
                            >
                              {u.orgIsActive ? <UserX size={13} /> : <UserCheck size={13} />}
                            </button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No users yet. Add your first team member.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
