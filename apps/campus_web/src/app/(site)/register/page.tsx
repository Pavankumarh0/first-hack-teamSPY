'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { LogoMark } from '@/components/Logo';
import { Button, ErrorBox, Field, Notice } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { normalizeUsername, passwordProblem, usernameProblem } from '@/lib/username';
import { useAsync } from '@/lib/useAsync';

export default function RegisterPage() {
  const router = useRouter();
  const { signIn, status } = useAuth();
  const mode = useAsync(() => fetch('/api/auth/register').then((r) => r.json()).then((b) => b.mode as string).catch(() => 'invite'), []);
  const [f, setF] = useState({ username: '', displayName: '', password: '', confirm: '', department: '', year: '', inviteCode: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status === 'signedIn' && !busy) router.replace('/'); }, [status, busy, router]);

  const username = normalizeUsername(f.username);
  const errors = {
    username: usernameProblem(username),
    displayName: f.displayName.trim().length < 2 ? 'Enter your name (2-40 characters).' : null,
    password: passwordProblem(f.password),
    confirm: f.confirm !== f.password ? 'The passwords do not match.' : null,
    inviteCode: mode.data === 'invite' && !f.inviteCode.trim() ? 'Enter the campus registration code.' : null,
  };
  const valid = Object.values(errors).every((e) => !e);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username, password: f.password, displayName: f.displayName.trim(),
          department: f.department.trim() || undefined, year: f.year ? Number(f.year) : null,
          inviteCode: f.inviteCode.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Registration failed.');
      await signIn(username, f.password);
      router.replace('/');
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  if (mode.data === 'closed')
    return (
      <div className="mx-auto max-w-md py-12">
        <Notice tone="blue"><strong>Accounts are created by the college office.</strong> Ask them for your username and a first password, then <Link className="underline" href="/login">sign in</Link>.</Notice>
      </div>
    );

  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);
  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Create your student account</h1>
        <p className="mt-1 text-sm text-slate-600">Just a username and a password - no email or phone number needed.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Username" htmlFor="r-username" required error={show('username')}
          hint={username ? `You will sign in as "${username}". 3-24 characters: letters, digits, dots, underscores.` : '3-24 characters: letters, digits, dots, underscores.'}>
          <input id="r-username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={f.username} onChange={set('username')} placeholder="asha.k" />
        </Field>
        <Field label="Your name" htmlFor="r-name" required error={show('displayName')} hint="Shown next to your posts, with your username.">
          <input id="r-name" className="input" autoComplete="name" value={f.displayName} onChange={set('displayName')} maxLength={40} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department" htmlFor="r-dept">
            <input id="r-dept" className="input" value={f.department} onChange={set('department')} placeholder="CSE" maxLength={60} />
          </Field>
          <Field label="Year" htmlFor="r-year">
            <select id="r-year" className="input" value={f.year} onChange={set('year')}>
              <option value="">-</option>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Password" htmlFor="r-pass" required error={show('password')} hint="At least 8 characters, with letters and a digit.">
          <input id="r-pass" type="password" className="input" autoComplete="new-password" value={f.password} onChange={set('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="r-confirm" required error={show('confirm')}>
          <input id="r-confirm" type="password" className="input" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} />
        </Field>
        {mode.data === 'invite' && (
          <Field label="Campus registration code" htmlFor="r-code" required error={show('inviteCode')} hint="Given out by the college to students on campus.">
            <input id="r-code" className="input" value={f.inviteCode} onChange={set('inviteCode')} autoComplete="off" />
          </Field>
        )}
        <Button type="submit" className="w-full" busy={busy}>Create account</Button>
        <p className="text-xs text-slate-500">
          Without an email there is no automatic password reset: if you forget your password, the college office resets it.
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">Already registered? <Link href="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link></p>
    </div>
  );
}
