'use client';

import { useMemo, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { KeyRound, UserPlus } from 'lucide-react';
import { apiFetch, useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, Notice, PageHeader } from '@/components/ui';
import { C, ROLE_LABELS, type Role } from '@/lib/constants';
import { listUsers } from '@/lib/admin-data';
import type { UserProfile } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { normalizeUsername, passwordProblem, usernameProblem } from '@/lib/username';
import { useAsync } from '@/lib/useAsync';

export default function UsersAdmin() {
  const { idToken, profile } = useAuth();
  const [role, setRole] = useState<string>('all');
  const [q, setQ] = useState('');
  const first = useAsync(() => listUsers(role, 50), [role]);
  const [more, setMore] = useState<{ items: UserProfile[]; cursor: QueryDocumentSnapshot | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const users = useMemo(() => [...(first.data?.items ?? []), ...(more?.items ?? [])]
    .filter((u) => !q || `${u.username} ${u.displayName}`.toLowerCase().includes(q.toLowerCase())), [first.data, more, q]);
  const cursor = more ? more.cursor : first.data?.cursor;

  async function change(u: UserProfile, body: { role?: Role; status?: 'active' | 'suspended' }) {
    setError(null); setMsg(null);
    try {
      await apiFetch(idToken, `/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMsg(`Updated @${u.username}. ${body.status === 'suspended' ? 'They are signed out everywhere.' : 'The change applies at their next sign-in or within an hour.'}`);
      setMore(null); first.reload();
    } catch (e) { setError(friendlyError(e)); }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Accounts, roles and access. Role and status changes are made by the server, which updates the sign-in permissions too."
        actions={<Button onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> Create account</Button>} />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {msg && <div className="mb-4"><Notice tone="green">{msg}</Notice></div>}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <select className="input sm:w-48" value={role} onChange={(e) => { setRole(e.target.value); setMore(null); }} aria-label="Role">
          <option value="all">All roles</option>{C.roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as Role]}</option>)}
        </select>
        <input className="input sm:w-72" placeholder="Filter loaded accounts by name..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
      </div>
      {first.loading ? <ListSkeleton count={4} rows={1} /> : first.error ? <ErrorBox message={first.error} onRetry={first.reload} /> :
        users.length === 0 ? <EmptyState title="No accounts" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Joined</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const self = u.id === profile?.id;
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3"><p className="font-medium text-slate-900">{u.displayName}</p><p className="text-xs text-slate-500">@{u.username}{u.department ? ` · ${u.department}` : ''}{u.year ? ` · year ${u.year}` : ''}</p></td>
                      <td className="px-4 py-3">
                        <select className="input py-1" value={u.role} disabled={self} aria-label={`Role of ${u.username}`} onChange={(e) => change(u, { role: e.target.value as Role })}>
                          {C.roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as Role]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">{u.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setResetFor(u)}><KeyRound className="h-4 w-4" /> Password</Button>
                        {!self && (u.status === 'active'
                          ? <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Suspend @${u.username}? They will be signed out and cannot sign in.`)) change(u, { status: 'suspended' }); }}>Suspend</Button>
                          : <Button size="sm" variant="ghost" onClick={() => change(u, { status: 'active' })}>Reactivate</Button>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cursor && <div className="border-t border-slate-100 p-3 text-center"><Button size="sm" variant="secondary" onClick={async () => {
              const p = await listUsers(role, 50, cursor);
              setMore({ items: [...(more?.items ?? []), ...p.items], cursor: p.cursor });
            }}>Load more</Button></div>}
          </div>
        )}
      <CreateAccount open={creating} onClose={() => setCreating(false)} onCreated={(name) => { setCreating(false); setMsg(`Created @${name}. Give them the password in person; they can change it under My account.`); first.reload(); }} />
      <ResetPassword user={resetFor} onClose={() => setResetFor(null)} onDone={(name) => { setResetFor(null); setMsg(`Password for @${name} was reset and their sessions ended.`); }} />
    </div>
  );
}

function CreateAccount({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (username: string) => void }) {
  const { idToken } = useAuth();
  const [f, setF] = useState({ username: '', displayName: '', role: 'student', password: '', department: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const username = normalizeUsername(f.username);
    const problem = usernameProblem(username) ?? passwordProblem(f.password) ?? (f.displayName.trim().length < 2 ? 'Enter a name.' : null);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      await apiFetch(idToken, '/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password: f.password, displayName: f.displayName.trim(), role: f.role, department: f.department.trim() || undefined }) });
      setF({ username: '', displayName: '', role: 'student', password: '', department: '' });
      onCreated(username);
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Create an account">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <Field label="Username" htmlFor="u-name" required><input id="u-name" className="input" autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="Name" htmlFor="u-display" required><input id="u-display" className="input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" htmlFor="u-role"><select id="u-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{C.roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as Role]}</option>)}</select></Field>
          <Field label="Department" htmlFor="u-dept"><input id="u-dept" className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
        </div>
        <Field label="First password" htmlFor="u-pass" required hint="8+ characters with letters and a digit. Share it in person."><input id="u-pass" type="text" autoComplete="off" className="input font-mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Create</Button></div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: UserProfile | null; onClose: () => void; onDone: (username: string) => void }) {
  const { idToken } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={!!user} onClose={onClose} title={`Reset password for @${user?.username ?? ''}`}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const problem = passwordProblem(password);
        if (problem) { setError(problem); return; }
        setBusy(true); setError(null);
        try { await apiFetch(idToken, `/api/admin/users/${user!.id}/password`, { method: 'POST', body: JSON.stringify({ password }) }); setPassword(''); onDone(user!.username); }
        catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
      }}>
        <Notice>There is no email recovery. Confirm who you are talking to, set a temporary password and give it to them in person.</Notice>
        {error && <ErrorBox message={error} />}
        <Field label="Temporary password" htmlFor="rp-pass"><input id="rp-pass" type="text" autoComplete="off" className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Set password</Button></div>
      </form>
    </Modal>
  );
}
