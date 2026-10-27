'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Accessibility, Clock, Layers, Navigation } from 'lucide-react';
import { PlaceCard } from '@/components/cards';
import { CampusMap } from '@/components/CampusMap';
import { DestinationFrame, DestinationLoading, UnknownDestination } from '@/components/Destination';
import { Badge, EmptyState, SampleBadge } from '@/components/ui';
import { BUILDING_CATEGORY_LABELS, label } from '@/lib/constants';
import { getBuilding, getCampusMap, listBuildings, listPlacesInBuilding } from '@/lib/data';
import { isValidId } from '@/lib/deeplinks';
import { useAsync } from '@/lib/useAsync';

export default function BuildingPage() {
  const { id } = useParams<{ id: string }>();
  const valid = isValidId(id);
  const data = useAsync(async () => {
    if (!valid) return null;
    const building = await getBuilding(id);
    if (!building) return null;
    const [places, map, buildings] = await Promise.all([listPlacesInBuilding(id), getCampusMap(), listBuildings()]);
    return { building, places, map, buildings };
  }, [id]);

  if (!valid) return <UnknownDestination what="building" />;
  if (data.loading) return <DestinationLoading />;
  if (!data.error && !data.data) return <UnknownDestination what="building" />;
  const d = data.data;
  return (
    <DestinationFrame link={{ type: 'building', id }} error={data.error} onRetry={data.reload}>
      {d && (
        <>
          <div className="card p-6">
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{label(BUILDING_CATEGORY_LABELS, d.building.category)}</Badge>
              <Badge className="font-mono">{d.building.code}</Badge>
              <SampleBadge show={d.building.isSample} />
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{d.building.name}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
              {d.building.openingHours && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-500" />{d.building.openingHours}</span>}
              {d.building.floors && <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-slate-500" />{d.building.floors} floor{d.building.floors > 1 ? 's' : ''}</span>}
              {d.building.accessible && <span className="flex items-center gap-1.5"><Accessibility className="h-4 w-4 text-slate-500" />Step-free entrance</span>}
            </div>
            {d.building.description && <p className="prose-text mt-4">{d.building.description}</p>}
            <Link href={`/map?to=${d.building.id}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <Navigation className="h-4 w-4" /> Get directions
            </Link>
          </div>
          {d.map && (
            <div className="card p-2">
              <CampusMap map={d.map} buildings={d.buildings} highlightBuildingIds={[d.building.id]}
                markers={d.building.entranceNodeId ? [{ nodeId: d.building.entranceNodeId, label: 'Entrance', tone: 'end' }] : []} />
            </div>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Inside this building</h2>
            {d.places.length === 0 ? <EmptyState title="No rooms listed yet" /> :
              <div className="grid gap-3 sm:grid-cols-2">{d.places.map((p) => <PlaceCard key={p.id} p={p} />)}</div>}
          </section>
        </>
      )}
    </DestinationFrame>
  );
}
