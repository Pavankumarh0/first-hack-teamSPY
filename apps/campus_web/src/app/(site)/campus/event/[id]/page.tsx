'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CalendarDays, MapPin, Navigation, Users } from 'lucide-react';
import { DestinationFrame, DestinationLoading, UnknownDestination } from '@/components/Destination';
import { Badge, Notice, SampleBadge } from '@/components/ui';
import { getEvent } from '@/lib/data';
import { isValidId } from '@/lib/deeplinks';
import { formatRange } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const valid = isValidId(id);
  const data = useAsync(() => (valid ? getEvent(id) : Promise.resolve(null)), [id]);

  if (!valid) return <UnknownDestination what="event" />;
  if (data.loading) return <DestinationLoading />;
  if (!data.error && !data.data) return <UnknownDestination what="event" />;
  const e = data.data;
  const past = e ? e.endAt < new Date() : false;
  return (
    <DestinationFrame link={{ type: 'event', id }} error={data.error} onRetry={data.reload}>
      {e && (
        <div className="card p-6">
          {e.status === 'cancelled' && <div className="mb-4"><Notice tone="amber"><strong>This event has been cancelled.</strong></Notice></div>}
          {past && e.status !== 'cancelled' && <div className="mb-4"><Notice tone="blue">This event has already taken place.</Notice></div>}
          <div className="flex flex-wrap gap-2">
            <Badge tone="saffron">Event</Badge>
            {e.status === 'draft' && <Badge tone="slate">Draft (visible to organisers only)</Badge>}
            <SampleBadge show={e.isSample} />
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{e.title}</h1>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-500" />{formatRange(e.startAt, e.endAt)}</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-500" />{e.venueName}</p>
            <p className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-500" />
              <Link href={`/campus/club/${e.clubId}`} className="text-brand-700 hover:underline">{e.clubName}</Link>
            </p>
          </div>
          {e.description && <p className="prose-text mt-5">{e.description}</p>}
          {e.venueLocationId && (
            <Link href={`/map?to=${e.venueLocationId}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <Navigation className="h-4 w-4" /> Directions to the venue
            </Link>
          )}
        </div>
      )}
    </DestinationFrame>
  );
}
