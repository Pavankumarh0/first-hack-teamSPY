'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, Settings, Wrench, X } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from './AuthProvider';
import { cx } from './ui';

const NAV = [
  { href: '/directory', label: 'Directory' },
  { href: '/map', label: 'Campus map' },
  { href: '/events', label: 'Events' },
  { href: '/clubs', label: 'Clubs' },
  { href: '/notices', label: 'Notices' },
  { href: '/community', label: 'Community' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, profile, role, active, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);

  const canAdmin = active && (role === 'admin' || role === 'staff' || role === 'club_manager');

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Campus Mithra home"><Logo /></Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cx('rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith(n.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {status === 'signedIn' && profile ? (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} aria-expanded={menu}
                className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2 text-sm hover:bg-slate-50">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[10rem] truncate font-medium sm:block">{profile.username}</span>
                <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <MenuLink href="/account" icon={<Settings className="h-4 w-4" />}>My account</MenuLink>
                  <MenuLink href="/reports" icon={<Wrench className="h-4 w-4" />}>My reports</MenuLink>
                  <MenuLink href="/notifications" icon={<Bell className="h-4 w-4" />}>Notifications</MenuLink>
                  {canAdmin && <MenuLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</MenuLink>}
                  <button onClick={async () => { await signOut(); router.push('/'); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : status === 'loading' ? (
            <span className="skeleton h-8 w-24" />
          ) : status === 'signedOut' ? (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:block">Sign in</Link>
              <Link href="/register" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Join</Link>
            </>
          ) : null}
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">{n.label}</Link>
          ))}
          {status === 'signedOut' && <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign in</Link>}
        </nav>
      )}
    </header>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
      <span className="text-slate-500">{icon}</span>{children}
    </Link>
  );
}
