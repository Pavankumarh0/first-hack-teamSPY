'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { RequireMember } from '@/components/RequireMember';
import { EmptyState, ErrorBox, ListSkeleton, PageHeader, cx } from '@/components/ui';
import { listNotifications, markBroadcastsSeen, markNotificationRead, type UserProfile } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

export default function NotificationsPage() {
  return <RequireMember why="Notifications are about your reports and campus events.">{(p) => <Notifications profile={p} />}</RequireMember>;
}

function Notifications({ profile }: { profile: UserProfile }) {
  const items = useAsync(() => listNotifications(profile.id), [profile.id]);
  const seenAt = profile.notificationsSeenAt?.getTime() ?? 0;
  useEffect(() => {
    if (items.data) markBroadcastsSeen(profile.id).catch(() => {});
  }, [items.data, profile.id]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Inbox" title="Notifications" />
      {items.loading ? <ListSkeleton count={3} rows={1} /> : items.error ? <ErrorBox message={items.error} onRetry={items.reload} /> :
        items.data!.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="Nothing yet" body="Report updates and new events will show up here." /> : (
          <ul className="card divide-y divide-slate-100">
            {items.data!.map((n) => {
              const unread = n.audience === 'user' ? !n.read : (n.createdAt?.getTime() ?? 0) > seenAt;
              const body = (
                <div className="flex gap-3 px-5 py-4">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-saffron-500' : 'bg-transparent')} aria-hidden />
                  <div className="min-w-0">
                    <p className={cx('text-sm', unread ? 'font-semibold text-slate-900' : 'text-slate-800')}>{n.title}</p>
                    {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-slate-500">{timeAgo(n.createdAt)}{n.audience === 'all' ? ' · campus-wide' : ''}</p>
                  </div>
                </div>
              );
              const onClick = () => { if (n.audience === 'user' && !n.read) markNotificationRead(n.id).catch(() => {}); };
              return <li key={n.id}>{n.link ? <Link href={n.link} onClick={onClick} className="block hover:bg-slate-50">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
    </div>
  );
}
