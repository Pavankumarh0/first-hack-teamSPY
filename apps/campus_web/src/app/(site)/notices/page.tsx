'use client';

import { useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { NoticeCard } from '@/components/cards';
import { Button, EmptyState, ErrorBox, ListSkeleton, PageHeader } from '@/components/ui';
import { listAnnouncements, type Announcement } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';

export default function NoticesPage() {
  const first = useAsync(() => listAnnouncements(10), []);
  const [more, setMore] = useState<Announcement[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = cursor === undefined ? first.data?.cursor : cursor;

  async function loadMore() {
    setBusy(true); setErr(null);
    try {
      const p = await listAnnouncements(10, next);
      setMore((m) => [...m, ...p.items]);
      setCursor(p.cursor);
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  const all = [...(first.data?.items ?? []), ...more];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Official" title="Notices and announcements" subtitle="Published by the college administration." />
      {first.loading ? <ListSkeleton count={4} /> : first.error ? <ErrorBox message={first.error} onRetry={first.reload} /> :
        all.length === 0 ? <EmptyState title="No notices" /> : (
          <>
            <div className="space-y-3">{all.map((a) => <NoticeCard key={a.id} a={a} />)}</div>
            {err && <div className="mt-4"><ErrorBox message={err} /></div>}
            {next && <div className="mt-6 text-center"><Button variant="secondary" busy={busy} onClick={loadMore}>Load more</Button></div>}
          </>
        )}
    </div>
  );
}
