'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, LayoutDashboard, LogOut, Settings, Wrench, X } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from './AuthProvider';
import { cx } from './ui';

const NAV = [
  { href: '/directory', label: 'Directory', color: 'bg-sun' },
  { href: '/map', label: 'Campus map', color: 'bg-mint' },
  { href: '/events', label: 'Events', color: 'bg-periwinkle' },
  { href: '/clubs', label: 'Clubs', color: 'bg-bubblegum' },
  { href: '/notices', label: 'Notices', color: 'bg-tangerine' },
  { href: '/community', label: 'Community', color: 'bg-sun' },
];

/** The burger: three thick bars, crossed when open. */
function Burger({ open }: { open: boolean }) {
  return (
    <span className="relative block h-4 w-6" aria-hidden>
      <span className={cx('absolute left-0 h-[3px] w-6 rounded-full bg-ink transition-transform', open ? 'top-1.5 rotate-45' : 'top-0')} />
      <span className={cx('absolute left-0 top-1.5 h-[3px] w-6 rounded-full bg-ink transition-opacity', open && 'opacity-0')} />
      <span className={cx('absolute left-0 h-[3px] w-6 rounded-full bg-ink transition-transform', open ? 'top-1.5 -rotate-45' : 'top-3')} />
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, profile, role, active, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const canAdmin = active && (role === 'admin' || role === 'staff' || role === 'club_manager');
  const signedIn = status === 'signedIn' && profile;

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5">
        <div className="flex h-16 min-w-0 flex-1 items-center rounded-full border-2 border-ink bg-cream/95 pl-2 pr-2 backdrop-blur sm:h-[4.5rem]">
          <Link href="/" aria-label="Campus Mithra home" className="flex shrink-0 items-center pr-3 sm:pr-4"><Logo /></Link>
          <span className="h-full w-0.5 shrink-0 bg-ink" aria-hidden />
          <nav className="hidden flex-1 items-center gap-1 px-3 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={cx('rounded-full px-3 py-1.5 text-[13px] font-extrabold uppercase tracking-[0.05em] transition-colors',
                  pathname.startsWith(n.href) ? 'bg-ink text-paper' : 'hover:bg-ink/5')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center pl-2">
            {signedIn ? (
              <button onClick={() => setOpen(true)}
                className="flex min-w-0 items-center gap-2 rounded-full border-2 border-ink py-1 pl-1 pr-3 text-[13px] font-extrabold hover:bg-ink/5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-sun text-xs font-extrabold">
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{profile.username}</span>
              </button>
            ) : status === 'loading' ? (
              <span className="skeleton h-10 w-32 rounded-full" />
            ) : status === 'signedOut' ? (
              <Link href="/register"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-ink px-4 py-2 text-[12px] font-extrabold uppercase tracking-[0.06em] hover:bg-ink/5 sm:px-5 sm:text-[13px]">
                Join<span className="hidden min-[400px]:inline"> campus</span> <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
          className="relative z-50 grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-ink bg-tangerine transition-transform hover:rotate-6 sm:h-[4.5rem] sm:w-[4.5rem]">
          <Burger open={open} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-cream px-4 pb-10 pt-24 sm:pt-28" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mx-auto max-w-6xl">
            <nav aria-label="Main" className="grid gap-3 sm:grid-cols-2">
              {NAV.map((n, i) => (
                <Link key={n.href} href={n.href}
                  className={cx('flex items-center justify-between rounded-[var(--radius-blob)] border-2 border-ink px-5 py-4 transition-transform hover:-translate-y-0.5', n.color)}>
                  <span className="display text-4xl sm:text-5xl">{n.label}.</span>
                  <span className="font-[family-name:var(--font-display)] text-lg font-extrabold">0{i + 1}</span>
                </Link>
              ))}
            </nav>
            <div className="mt-6 rounded-[var(--radius-blob)] border-2 border-ink bg-white p-5">
              {signedIn ? (
                <>
                  <p className="label-caps text-slate-600">Signed in as</p>
                  <p className="display mt-1 text-3xl">@{profile.username}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <MenuLink href="/account" icon={<Settings className="h-4 w-4" />}>My account</MenuLink>
                    <MenuLink href="/reports" icon={<Wrench className="h-4 w-4" />}>My reports</MenuLink>
                    <MenuLink href="/notifications" icon={<Bell className="h-4 w-4" />}>Notifications</MenuLink>
                    {canAdmin && <MenuLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</MenuLink>}
                    <button onClick={async () => { setOpen(false); await signOut(); router.push('/'); }}
                      className="flex items-center gap-2 rounded-full border-2 border-ink px-4 py-3 text-left text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-ink/5">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="mr-auto text-base font-semibold">Students sign in with a username - no email needed.</p>
                  <Link href="/login" className="rounded-full border-2 border-ink px-5 py-3 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-ink/5">Sign in</Link>
                  <Link href="/register" className="rounded-full border-2 border-ink bg-sun px-5 py-3 text-xs font-extrabold uppercase tracking-[0.06em]">Create account</Link>
                </div>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="mx-auto mt-6 flex items-center gap-2 rounded-full border-2 border-ink px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em]">
              <X className="h-4 w-4" /> Close
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-full border-2 border-ink px-4 py-3 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-ink/5">
      {icon}{children}
    </Link>
  );
}
