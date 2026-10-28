'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3, Building2, CalendarDays, Fingerprint, Home, LogOut, Map, Megaphone, Menu, MonitorSmartphone, QrCode,
  ShieldAlert, Users, UsersRound, Wrench, X,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { LogoMark } from './Logo';
import { Badge, Notice, Spinner, cx } from './ui';
import { ROLE_LABELS, type Role } from '@/lib/constants';

export const ADMIN_NAV: { href: string; label: string; icon: React.ReactNode; roles: Role[] }[] = [
  { href: '/admin', label: 'Overview', icon: <BarChart3 className="h-4 w-4" />, roles: ['admin', 'staff', 'club_manager'] },
  { href: '/admin/reports', label: 'Maintenance reports', icon: <Wrench className="h-4 w-4" />, roles: ['admin', 'staff'] },
  { href: '/admin/announcements', label: 'Announcements', icon: <Megaphone className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/events', label: 'Events', icon: <CalendarDays className="h-4 w-4" />, roles: ['admin', 'club_manager'] },
  { href: '/admin/clubs', label: 'Clubs', icon: <UsersRound className="h-4 w-4" />, roles: ['admin', 'club_manager'] },
  { href: '/admin/directory', label: 'Buildings & rooms', icon: <Building2 className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/map', label: 'Campus map', icon: <Map className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/qr', label: 'QR codes', icon: <QrCode className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/moderation', label: 'Moderation', icon: <ShieldAlert className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/users', label: 'Users', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/kiosk', label: 'Kiosk', icon: <MonitorSmartphone className="h-4 w-4" />, roles: ['admin'] },
  { href: '/admin/attendance', label: 'RFID attendance', icon: <Fingerprint className="h-4 w-4" />, roles: ['admin'] },
];

/**
 * Dashboard frame. Hiding pages here is convenience only: every write is
 * checked again by the Firestore rules and the API routes.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { status, role, active, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (status === 'signedOut') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status === 'unconfigured') return <div className="p-8"><Notice tone="amber">The dashboard needs Firebase to be configured.</Notice></div>;
  if (status !== 'signedIn' || (active && !profile)) return <Spinner label="Checking your access" />;
  const allowed = active && role && role !== 'student';
  if (!allowed)
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="display text-4xl">No dashboard access</h1>
        <p className="mt-2 text-sm text-slate-600">The dashboard is for campus staff, club managers and administrators.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Back to the campus site</Link>
      </div>
    );

  const nav = ADMIN_NAV.filter((n) => n.roles.includes(role));
  const current = [...nav].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const permitted = current ? current.roles.includes(role) : true;
  const sidebar = (
    <nav className="space-y-1" aria-label="Dashboard">
      {nav.map((n) => (
        <Link key={n.href} href={n.href}
          className={cx('flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors',
            current?.href === n.href ? 'border-2 border-paper bg-sun text-ink' : 'border-2 border-transparent text-paper/80 hover:bg-paper/10 hover:text-paper')}>
          {n.icon}{n.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className={cx('fixed inset-y-0 left-0 z-40 w-72 transform overflow-y-auto border-r-2 border-ink bg-ink p-4 text-paper transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <LogoMark className="h-11 w-11" />
            <span><span className="display block text-2xl">Mithra</span><span className="block label-caps text-sun">Dashboard</span></span>
          </Link>
          <button className="grid h-9 w-9 place-items-center rounded-full border-2 border-paper lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
        </div>
        {sidebar}
        <div className="mt-8 border-t-2 border-paper/15 pt-4 text-[13px] font-bold">
          <Link href="/" className="flex items-center gap-2.5 rounded-full px-3.5 py-2 text-paper/80 hover:bg-paper/10 hover:text-paper"><Home className="h-4 w-4" />Campus site</Link>
          <button onClick={async () => { await signOut(); router.push('/'); }} className="flex w-full items-center gap-2.5 rounded-full px-3.5 py-2 text-paper/80 hover:bg-paper/10 hover:text-paper"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b-2 border-ink bg-cream/95 px-4 backdrop-blur">
          <button className="grid h-11 w-11 place-items-center rounded-full border-2 border-ink bg-tangerine lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="font-extrabold">@{profile?.username}</span>
            <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-8">
          {permitted ? children : <Notice tone="amber">Your role ({ROLE_LABELS[role]}) does not include this section.</Notice>}
        </main>
      </div>
    </div>
  );
}
