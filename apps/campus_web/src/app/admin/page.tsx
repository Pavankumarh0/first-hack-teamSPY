'use client';

import Link from 'next/link';
import { Timestamp, where } from 'firebase/firestore';
import { AlertCircle, CalendarDays, CheckCircle2, Flag, Megaphone, MessageSquare, Users, Wrench } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ReportStatusBadge } from '@/components/ReportStatus';
import { ErrorBox, PageHeader, Skeleton } from '@/components/ui';
import { countWhere, listManagedClubs, listReports } from '@/lib/admin-data';
import { timeAgo } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

const OPEN = ['submitted', 'acknowledged', 'assigned', 'in_progress'];

export default function Overview() {
  const { role, profile } = useAuth();
  const uid = profile!.id;
  const stats = useAsync(async () => {
    const tiles: { label: string; value: number; icon: React.ReactNode; href: string; tone: string }[] = [];
    if (role === 'admin' || role === 'staff') {
      tiles.push({ label: 'Open reports', value: await countWhere('reports', [where('status', 'in', OPEN)]), icon: <AlertCircle />, href: '/admin/reports', tone: 'text-saffron-600 bg-saffron-50' });
      tiles.push({ label: 'Assigned to me', value: await countWhere('reports', [where('assigneeId', '==', uid)]), icon: <Wrench />, href: '/admin/reports?mine=1', tone: 'text-violet-600 bg-violet-50' });
      tiles.push({ label: 'Resolved', value: await countWhere('reports', [where('status', '==', 'resolved')]), icon: <CheckCircle2 />, href: '/admin/reports?status=resolved', tone: 'text-emerald-600 bg-emerald-50' });
    }
    if (role === 'admin') {
      const [events, notices, posts, flags, users] = await Promise.all([
        countWhere('events', [where('status', '==', 'published'), where('startAt', '>=', Timestamp.now())]),
        countWhere('announcements', [where('status', '==', 'published')]),
        countWhere('posts', [where('status', '==', 'visible')]),
        countWhere('flags', [where('status', '==', 'open')]),
        countWhere('users', []),
      ]);
      tiles.push(
        { label: 'Upcoming events', value: events, icon: <CalendarDays />, href: '/admin/events', tone: 'text-brand-600 bg-brand-50' },
        { label: 'Published notices', value: notices, icon: <Megaphone />, href: '/admin/announcements', tone: 'text-sky-600 bg-sky-50' },
        { label: 'Community posts', value: posts, icon: <MessageSquare />, href: '/admin/moderation', tone: 'text-violet-600 bg-violet-50' },
        { label: 'Flags to review', value: flags, icon: <Flag />, href: '/admin/moderation', tone: 'text-red-600 bg-red-50' },
        { label: 'Accounts', value: users, icon: <Users />, href: '/admin/users', tone: 'text-slate-600 bg-slate-100' },
      );
    }
    if (role === 'club_manager') {
      const clubs = await listManagedClubs(uid, false);
      tiles.push({ label: 'Clubs you manage', value: clubs.length, icon: <Users />, href: '/admin/clubs', tone: 'text-brand-600 bg-brand-50' });
    }
    return tiles;
  }, [role, uid]);
  const recent = useAsync(() => (role === 'admin' || role === 'staff' ? listReports({ status: 'open' }, 6).then((p) => p.items) : Promise.resolve([])), [role]);

  return (
    <div>
      <PageHeader title={`Hello, ${profile?.displayName ?? ''}`} subtitle="What needs attention on campus today." />
      {stats.error ? <ErrorBox message={stats.error} onRetry={stats.reload} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.loading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />) : stats.data!.map((t) => (
            <Link key={t.label} href={t.href} className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-md">
              <span className={`grid h-11 w-11 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5 ${t.tone}`}>{t.icon}</span>
              <span>
                <span className="block text-2xl font-bold text-slate-900">{t.value}</span>
                <span className="text-sm text-slate-600">{t.label}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {(role === 'admin' || role === 'staff') && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Latest open reports</h2>
            <Link href="/admin/reports" className="text-sm font-medium text-brand-700 hover:underline">All reports</Link>
          </div>
          {recent.loading ? <Skeleton className="h-40" /> : recent.error ? <ErrorBox message={recent.error} /> : recent.data!.length === 0 ? (
            <p className="card p-6 text-sm text-slate-600">No open reports right now.</p>
          ) : (
            <ul className="card divide-y divide-slate-100">
              {recent.data!.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/reports?open=${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
                      <span className="text-xs text-slate-500">@{r.reporterUsername} · {r.buildingName ?? 'No building'} · {timeAgo(r.createdAt)}</span>
                    </span>
                    <ReportStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
