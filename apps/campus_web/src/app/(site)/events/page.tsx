'use client';

import { useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { EventCard } from '@/components/cards';
import { Button, EmptyState, ErrorBox, ListSkeleton, PageHeader } from '@/components/ui';
import { listUpcomingEvents, type CampusEvent } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';

export default function EventsPage() {
  const first = useAsync(() => listUpcomingEvents(12), []);
  const [more, setMore] = useState<CampusEvent[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = cursor === undefined ? first.data?.cursor : cursor;

  async function loadMore() {
    setBusy(true); setErr(null);
    try {
      const p = await listUpcomingEvents(12, next);
      setMore((m) => [...m, ...p.items]);
      setCursor(p.cursor);
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }

  const all = [...(first.data?.items ?? []), ...more];
  return (
    <div>
      <PageHeader eyebrow="Events" title="Upcoming on campus" subtitle="Published by clubs and the college. Times are local campus time." />
      {first.loading ? <ListSkeleton count={4} rows={1} /> : first.error ? <ErrorBox message={first.error} onRetry={first.reload} /> :
        all.length === 0 ? <EmptyState title="No upcoming events" body="Check back soon, or browse the clubs." /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">{all.map((e) => <EventCard key={e.id} e={e} />)}</div>
            {err && <div className="mt-4"><ErrorBox message={err} /></div>}
            {next && <div className="mt-6 text-center"><Button variant="secondary" busy={busy} onClick={loadMore}>Load more</Button></div>}
          </>
        )}
    </div>
  );
}
