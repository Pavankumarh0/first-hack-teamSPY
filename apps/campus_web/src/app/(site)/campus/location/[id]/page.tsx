'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Clock, Navigation } from 'lucide-react';
import { CampusMap } from '@/components/CampusMap';
import { DestinationFrame, DestinationLoading, UnknownDestination } from '@/components/Destination';
import { Badge, SampleBadge } from '@/components/ui';
import { LOCATION_TYPE_LABELS, label } from '@/lib/constants';
import { getBuilding, getCampusMap, getPlace } from '@/lib/data';
import { isValidId } from '@/lib/deeplinks';
import { useAsync } from '@/lib/useAsync';

export default function LocationPage() {
  const { id } = useParams<{ id: string }>();
  const valid = isValidId(id);
  const data = useAsync(async () => {
    if (!valid) return null;
    const place = await getPlace(id);
    if (!place) return null;
    const [building, map] = await Promise.all([place.buildingId ? getBuilding(place.buildingId) : null, getCampusMap()]);
    return { place, building, map };
  }, [id]);

  if (!valid) return <UnknownDestination />;
  if (data.loading) return <DestinationLoading />;
  if (!data.error && !data.data) return <UnknownDestination />;
  const { place, building, map } = data.data ?? {};
  return (
    <DestinationFrame link={{ type: 'location', id }} error={data.error} onRetry={data.reload}>
      {place && (
        <>
          <div className="card p-6">
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{label(LOCATION_TYPE_LABELS, place.type)}</Badge>
              <SampleBadge show={place.isSample} />
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{place.name}</h1>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              {building && <Info label="Building"><Link className="text-brand-700 hover:underline" href={`/campus/building/${building.id}`}>{building.name}</Link></Info>}
              {place.floor != null && <Info label="Floor">{place.floor === 0 ? 'Ground floor' : `Floor ${place.floor}`}</Info>}
              {place.room && <Info label="Room">{place.room}</Info>}
            </dl>
            {place.openingHours && <p className="mt-4 flex items-center gap-2 text-sm text-slate-700"><Clock className="h-4 w-4 text-slate-500" />{place.openingHours}</p>}
            {place.description && <p className="prose-text mt-4">{place.description}</p>}
            <Link href={`/map?to=${place.id}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <Navigation className="h-4 w-4" /> Get directions
            </Link>
          </div>
          {map && building && (
            <div className="card p-2">
              <CampusMap map={map} buildings={[building]} highlightBuildingIds={[building.id]}
                markers={place.navNodeId ? [{ nodeId: place.navNodeId, label: place.name, tone: 'end' }] : []} title={`${place.name} on the campus map`} />
            </div>
          )}
        </>
      )}
    </DestinationFrame>
  );
}

function Info({ label: l, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</dt><dd className="mt-0.5 text-slate-900">{children}</dd></div>;
}
