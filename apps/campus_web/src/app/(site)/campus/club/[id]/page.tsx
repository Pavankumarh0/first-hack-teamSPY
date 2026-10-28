'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Mail, MapPin } from 'lucide-react';
import { EventCard } from '@/components/cards';
import { DestinationFrame, DestinationLoading, UnknownDestination } from '@/components/Destination';
import { Badge, EmptyState, SampleBadge } from '@/components/ui';
import { getClub, listClubEvents } from '@/lib/data';
import { isValidId } from '@/lib/deeplinks';
import { useAsync } from '@/lib/useAsync';

export default function ClubPage() {
  const { id } = useParams<{ id: string }>();
  const valid = isValidId(id);
  const data = useAsync(async () => {
    if (!valid) return null;
    const club = await getClub(id);
    if (!club) return null;
    return { club, events: await listClubEvents(id) };
  }, [id]);

  if (!valid) return <UnknownDestination what="club" />;
  if (data.loading) return <DestinationLoading />;
  if (!data.error && !data.data) return <UnknownDestination what="club" />;
  const d = data.data;
  const now = new Date();
  const upcoming = d?.events.filter((e) => e.endAt >= now) ?? [];
  return (
    <DestinationFrame link={{ type: 'club', id }} error={data.error} onRetry={data.reload}>
      {d && (
        <>
          <div className="card p-6">
            <div className="flex flex-wrap gap-2">
              <Badge tone="violet">Club</Badge>
              {d.club.category && <Badge>{d.club.category}</Badge>}
              <SampleBadge show={d.club.isSample} />
            </div>
            <h1 className="mt-2 display text-[2.6rem] sm:text-6xl">{d.club.name}</h1>
            {d.club.description && <p className="prose-text mt-3">{d.club.description}</p>}
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {d.club.contact && <span className="flex items-center gap-1.5 text-slate-700"><Mail className="h-4 w-4 text-slate-500" />{d.club.contact}</span>}
              {d.club.homeLocationId && <Link href={`/campus/location/${d.club.homeLocationId}`} className="flex items-center gap-1.5 text-brand-700 hover:underline"><MapPin className="h-4 w-4" />Where we meet</Link>}
            </div>
          </div>
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Upcoming events</h2>
            {upcoming.length === 0 ? <EmptyState title="Nothing scheduled" body="This club has no upcoming events." /> :
              <div className="grid gap-3 sm:grid-cols-2">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>}
          </section>
        </>
      )}
    </DestinationFrame>
  );
}
