'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Notice, Spinner } from './ui';
import type { UserProfile } from '@/lib/data';

/** Renders children only for a signed-in, active account with a profile. */
export function RequireMember({ children, why }: { children: (profile: UserProfile) => React.ReactNode; why: string }) {
  const { status, active, profile } = useAuth();
  const path = usePathname();
  if (status === 'unconfigured') return <Notice tone="amber">Sign-in is unavailable until Firebase is configured.</Notice>;
  if (status === 'loading' || (status === 'signedIn' && active && !profile)) return <Spinner />;
  if (status === 'signedOut')
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700"><Lock className="h-6 w-6" /></div>
        <h1 className="display text-[2.6rem] sm:text-6xl">Sign in to continue</h1>
        <p className="mt-2 text-sm text-slate-600">{why}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href={`/login?next=${encodeURIComponent(path)}`} className="rounded-full border-2 border-ink bg-sun px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink transition-shadow hover:shadow-[0_3px_0_0_var(--color-ink)]">Sign in</Link>
          <Link href="/register" className="rounded-full border-2 border-ink px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink hover:bg-ink/5">Create an account</Link>
        </div>
      </div>
    );
  if (!active || !profile)
    return (
      <Notice tone="amber">
        This account is not active. It may be suspended, or it was not created through Campus Mithra registration.
        Contact the college office.
      </Notice>
    );
  return <>{children(profile)}</>;
}
