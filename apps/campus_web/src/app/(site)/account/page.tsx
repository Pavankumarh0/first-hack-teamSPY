'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { RequireMember } from '@/components/RequireMember';
import { Badge, Button, ErrorBox, Field, Notice, PageHeader } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/constants';
import { updateProfile, type UserProfile } from '@/lib/data';
import { friendlyError } from '@/lib/errors';

export default function AccountPage() {
  return (
    <RequireMember why="Your account details are private to you.">
      {(profile) => (
        <div className="mx-auto max-w-2xl">
          <PageHeader eyebrow="Account" title={profile.displayName} subtitle={<>Signed in as <strong>@{profile.username}</strong> <Badge tone="brand">{ROLE_LABELS[profile.role]}</Badge></>} />
          <div className="space-y-6">
            <ProfileForm profile={profile} />
            <PasswordForm />
          </div>
        </div>
      )}
    </RequireMember>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const [f, setF] = useState({ displayName: profile.displayName, department: profile.department ?? '', year: profile.year ? String(profile.year) : '', bio: profile.bio ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);
    if (f.displayName.trim().length < 2) { setError('Your name needs at least 2 characters.'); return; }
    setBusy(true);
    try {
      await updateProfile(profile.id, { displayName: f.displayName, department: f.department, bio: f.bio, year: f.year ? Number(f.year) : null });
      setMsg('Saved.');
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
      {error && <ErrorBox message={error} />}
      {msg && <Notice tone="green">{msg}</Notice>}
      <Field label="Username" hint="Usernames cannot be changed."><input className="input" value={profile.username} disabled /></Field>
      <Field label="Your name" htmlFor="p-name"><input id="p-name" className="input" value={f.displayName} maxLength={40} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department" htmlFor="p-dept"><input id="p-dept" className="input" value={f.department} maxLength={60} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
        <Field label="Year" htmlFor="p-year">
          <select id="p-year" className="input" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>
            <option value="">-</option>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
      </div>
      <Field label="About you" htmlFor="p-bio" hint="Up to 280 characters."><textarea id="p-bio" className="input" rows={3} maxLength={280} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
      <Button type="submit" busy={busy}>Save profile</Button>
    </form>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);
    if (f.next !== f.confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await changePassword(f.current, f.next);
      setF({ current: '', next: '', confirm: '' });
      setMsg('Password changed.');
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
      {error && <ErrorBox message={error} />}
      {msg && <Notice tone="green">{msg}</Notice>}
      <Field label="Current password" htmlFor="pw-cur"><input id="pw-cur" type="password" className="input" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 8 characters, with letters and a digit."><input id="pw-new" type="password" className="input" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="Repeat new password" htmlFor="pw-rep"><input id="pw-rep" type="password" className="input" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      <Button type="submit" busy={busy}>Change password</Button>
    </form>
  );
}
