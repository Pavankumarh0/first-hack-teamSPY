'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import { PlaceCard } from '@/components/cards';
import { Badge, EmptyState, ErrorBox, ListSkeleton, PageHeader, SampleBadge, cx } from '@/components/ui';
import { BUILDING_CATEGORY_LABELS, LOCATION_TYPE_LABELS, label } from '@/lib/constants';
import { listBuildings, listPlaces } from '@/lib/data';
import { searchPlaces } from '@/lib/search';
import { useAsync } from '@/lib/useAsync';

export default function DirectoryPage() {
  return <Suspense fallback={<ListSkeleton />}><Directory /></Suspense>;
}

function Directory() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [type, setType] = useState<string>('all');
  const data = useAsync(() => Promise.all([listBuildings(), listPlaces()]), []);

  const results = useMemo(() => {
    if (!data.data) return [];
    const [, places] = data.data;
    const typed = type === 'all' ? places : places.filter((p) => p.type === type);
    return q.trim() ? searchPlaces(typed, q, 50) : typed;
  }, [data.data, q, type]);

  const types = useMemo(() => Array.from(new Set((data.data?.[1] ?? []).map((p) => p.type))).sort(), [data.data]);

  return (
    <div>
      <PageHeader eyebrow="Directory" title="Buildings, rooms and facilities"
        subtitle="Search by name, room number or what you need - then get walking directions." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="dir-q" className="sr-only">Search</label>
          <input id="dir-q" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: library, B-104, exam section, gym..." autoFocus={!!params.get('q')} />
        </div>
        <label htmlFor="dir-type" className="sr-only">Type</label>
        <select id="dir-type" className="input sm:w-48" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => <option key={t} value={t}>{label(LOCATION_TYPE_LABELS, t)}</option>)}
        </select>
      </div>

      {data.loading ? <ListSkeleton count={4} rows={1} /> : data.error ? <ErrorBox message={data.error} onRetry={data.reload} /> : (
        <div className="grid gap-8 lg:grid-cols-3">
          <section className="min-w-0 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">{results.length} place{results.length === 1 ? '' : 's'}</h2>
            {results.length === 0 ? (
              <EmptyState title="Nothing matches" body={q ? `No room or facility matches "${q}". Try a shorter word, or the building name.` : 'The directory is empty.'} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">{results.map((p) => <PlaceCard key={p.id} p={p} />)}</div>
            )}
          </section>
          <section className="min-w-0">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500"><Building2 className="h-4 w-4" /> Buildings</h2>
            <ul className="card divide-y divide-slate-100">
              {data.data![0].map((b) => (
                <li key={b.id}>
                  <Link href={`/campus/building/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{b.name}</span>
                      <span className="text-xs text-slate-500">{label(BUILDING_CATEGORY_LABELS, b.category)}{b.openingHours ? ` · ${b.openingHours}` : ''}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <SampleBadge show={b.isSample} />
                      <Badge className={cx('font-mono')}>{b.code}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
