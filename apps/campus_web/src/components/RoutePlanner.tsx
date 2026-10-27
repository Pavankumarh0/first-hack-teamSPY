'use client';

import { useMemo, useState } from 'react';
import { Accessibility, ArrowDownUp, Clock, Copy, Footprints, Share2 } from 'lucide-react';
import { CampusMap, MapLegend, type MapMarker } from './CampusMap';
import { QrCode } from './QrCode';
import { Badge, Button, EmptyState, ErrorBox, Notice, SampleBadge, Skeleton } from './ui';
import { getCampusMap, listBuildings, listPlaces, type Building, type Place } from '@/lib/data';
import { findRoute, nodeForPlace } from '@/lib/navigation';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';
import { useAsync } from '@/lib/useAsync';

export interface PlaceOption {
  id: string;
  kind: 'location' | 'building';
  name: string;
  group: string;
  nodeId: string;
  buildingId?: string | null;
}

export function placeOptions(buildings: Building[], places: Place[]): PlaceOption[] {
  const out: PlaceOption[] = [];
  for (const b of buildings) {
    const nodeId = nodeForPlace(b);
    if (nodeId) out.push({ id: b.id, kind: 'building', name: b.name, group: 'Buildings', nodeId, buildingId: b.id });
  }
  for (const p of places) {
    const nodeId = nodeForPlace(p);
    if (nodeId) out.push({ id: p.id, kind: 'location', name: p.room ? `${p.name} (${p.room})` : p.name, group: p.buildingName ?? 'Other places', nodeId, buildingId: p.buildingId });
  }
  return out;
}

export function useCampus() {
  return useAsync(async () => {
    const [map, buildings, places] = await Promise.all([getCampusMap(), listBuildings(), listPlaces()]);
    return { map, buildings, places, options: placeOptions(buildings, places) };
  }, []);
}

function PlaceSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: PlaceOption[] }) {
  const groups = useMemo(() => {
    const g = new Map<string, PlaceOption[]>();
    for (const o of options) g.set(o.group, [...(g.get(o.group) ?? []), o]);
    return [...g.entries()].sort(([a], [b]) => (a === 'Buildings' ? -1 : b === 'Buildings' ? 1 : a.localeCompare(b)));
  }, [options]);
  return (
    <div className="flex-1">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a place...</option>
        {groups.map(([group, opts]) => (
          <optgroup key={group} label={group}>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Pick a start and destination, see the route on the map, take it along by QR. */
export function RoutePlanner({ initialFrom = '', initialTo = '' }: { initialFrom?: string; initialTo?: string }) {
  const campus = useCampus();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [stepFree, setStepFree] = useState(false);
  const [copied, setCopied] = useState(false);

  const options = campus.data?.options ?? [];
  const fromOpt = options.find((o) => o.id === from);
  const toOpt = options.find((o) => o.id === to);
  const map = campus.data?.map;
  const route = useMemo(() => (map && fromOpt && toOpt ? findRoute(map, fromOpt.nodeId, toOpt.nodeId, { accessibleOnly: stepFree }) : null),
    [map, fromOpt, toOpt, stepFree]);

  if (campus.loading) return <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" /></div>;
  if (campus.error) return <ErrorBox message={campus.error} onRetry={campus.reload} />;
  if (!map) return <EmptyState title="The campus map is not set up yet" body="An administrator draws it in Dashboard > Campus map." />;

  const unknown = (initialTo && !toOpt) || (initialFrom && !fromOpt);
  const markers: MapMarker[] = [];
  if (fromOpt) markers.push({ nodeId: fromOpt.nodeId, label: fromOpt.name, tone: 'start' });
  if (toOpt) markers.push({ nodeId: toOpt.nodeId, label: toOpt.name, tone: 'end' });
  const shareUrl = toOpt ? campusUrl(publicEnv.siteUrl, { type: 'route', from: fromOpt?.id, to: toOpt.id }) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="min-w-0 space-y-3 lg:col-span-3">
        <div className="card overflow-hidden p-2">
          <CampusMap map={map} buildings={campus.data!.buildings} route={route} markers={markers}
            highlightBuildingIds={[toOpt?.buildingId].filter(Boolean) as string[]}
            onBuildingClick={(id) => setTo(id)} title={map.name ?? 'Campus map'} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MapLegend />
          <SampleBadge show={map.isSample} />
        </div>
        <p className="text-xs text-slate-500">Tip: tap a building on the map to make it your destination.</p>
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        {unknown && <Notice tone="amber">That link points to a place that is not on the campus map any more. Choose a destination below.</Notice>}
        <div className="card space-y-3 p-4">
          <PlaceSelect id="route-from" label="From" value={from} onChange={setFrom} options={options} />
          <div className="flex justify-center">
            <button onClick={() => { setFrom(to); setTo(from); }} className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Swap start and destination">
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>
          <PlaceSelect id="route-to" label="To" value={to} onChange={setTo} options={options} />
          <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
            <input type="checkbox" checked={stepFree} onChange={(e) => setStepFree(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            <Accessibility className="h-4 w-4 text-slate-500" aria-hidden /> Step-free route only
          </label>
        </div>

        {fromOpt && toOpt && !route && (
          <ErrorBox message={stepFree ? 'No step-free route is mapped between these places. Ask at the help desk, or untick "Step-free".' : 'These places are not connected on the campus map yet.'} />
        )}

        {route && (
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-lg font-bold text-slate-900"><Clock className="h-5 w-5 text-brand-600" />{route.minutes} min</span>
              <span className="flex items-center gap-1.5 text-sm text-slate-600"><Footprints className="h-4 w-4" />{route.distanceM} m walk</span>
              {route.accessible ? <Badge tone="green">Step-free</Badge> : <Badge tone="amber">Includes steps</Badge>}
            </div>
            <ol className="mt-4 space-y-3">
              {route.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                  <span className="pt-0.5 text-slate-700">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {shareUrl && (
          <div className="card flex flex-col items-center gap-3 p-4 text-center">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Share2 className="h-4 w-4" /> Take these directions with you</h3>
            <QrCode value={shareUrl} size={160} />
            <Button variant="secondary" size="sm" onClick={async () => { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              <Copy className="h-4 w-4" /> {copied ? 'Link copied' : 'Copy link'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
