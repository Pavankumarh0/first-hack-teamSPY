'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { BrokenSession } from '@/components/BrokenSession';
import { LogoMark } from '@/components/Logo';
import { Button, ErrorBox, Field, Spinner } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { normalizeUsername } from '@/lib/username';

export default function LoginPage() {
  return <Suspense fallback={<Spinner />}><Login /></Suspense>;
}

function safeNext(next: string | null): string {
  // Only same-site paths: never redirect to another origin after sign-in.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const { signIn, status, profileStatus } = useAuth();
  const broken = status === 'signedIn' && (profileStatus === 'missing' || profileStatus === 'error');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leave only for a complete account; a sign-in without a profile stays here with a way out.
  useEffect(() => { if (status === 'signedIn' && profileStatus === 'ready') router.replace(next); }, [status, profileStatus, next, router]);
  useEffect(() => { if (broken) setBusy(false); }, [broken]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalizeUsername(username) || !password) { setError('Enter your username and password.'); return; }
    setBusy(true);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="mb-6 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 display text-6xl">Sign in.</h1>
        <p className="mt-1 text-sm text-slate-600">Use the username and password you registered with.</p>
      </div>
      {broken && <div className="mb-4"><BrokenSession /></div>}
      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Username" htmlFor="username">
          <input id="username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. asha.k" />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <input id="password" type={show ? 'text' : 'password'} className="input pr-10" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-700"
              aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" className="w-full" busy={busy}>Sign in</Button>
        <p className="text-center text-xs text-slate-500">
          Forgot your password? The college office can reset it for you - there is no email recovery.
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">New here? <Link href="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link></p>
    </div>
  );
}
