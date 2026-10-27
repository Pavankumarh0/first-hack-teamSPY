'use client';

import { ClubCard } from '@/components/cards';
import { EmptyState, ErrorBox, ListSkeleton, PageHeader } from '@/components/ui';
import { listClubs } from '@/lib/data';
import { useAsync } from '@/lib/useAsync';

export default function ClubsPage() {
  const clubs = useAsync(() => listClubs(), []);
  return (
    <div>
      <PageHeader eyebrow="Clubs" title="Student clubs and committees" subtitle="Find a club, see where it meets and what it has coming up." />
      {clubs.loading ? <ListSkeleton count={3} /> : clubs.error ? <ErrorBox message={clubs.error} onRetry={clubs.reload} /> :
        clubs.data!.length === 0 ? <EmptyState title="No clubs listed yet" /> :
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{clubs.data!.map((c) => <ClubCard key={c.id} c={c} />)}</div>}
    </div>
  );
}
