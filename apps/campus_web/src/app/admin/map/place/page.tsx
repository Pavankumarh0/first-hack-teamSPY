'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdvancedMarker, useMapsLibrary } from '@vis.gl/react-google-maps';
import { ArrowLeft, Building2, Link2, MapPin, Move, Plus, Save, Search, Trash2 } from 'lucide-react';
import { GoogleCampusMap, MapsProvider } from '@/components/GoogleCampusMap';
import { Badge, Button, ErrorBox, Field, Notice, PageHeader, Spinner, Tabs, cx } from '@/components/ui';
import { adminListBuildings, saveBuilding, saveCampusMap, slugify } from '@/lib/admin-data';
import { BUILDING_CATEGORY_LABELS } from '@/lib/constants';
import { getCampusMap, type Building } from '@/lib/data';
import { publicEnv } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import type { GeoRef, PlanPoint } from '@/lib/geo';
import type { CampusMap as MapData, MapNode } from '@/lib/navigation';
import { useAsync } from '@/lib/useAsync';

// Places the campus plan on Google's satellite map: find the campus, align
// the plan, then drag buildings and path points to where they really are, or
// add new ones by clicking. Names and details come from the administrator,
// who knows the campus - nothing is copied out of Google's imagery.

type Mode = 'move' | 'building' | 'point' | 'connect';
const BLANK: MapData = { name: 'Campus', width: 1000, height: 1000, metersPerUnit: 0.5, backgroundUrl: null, nodes: [], edges: [], isSample: false };
const newId = (prefix: string, taken: Set<string>) => {
  let id = `${prefix}-${Date.now().toString(36)}`;
  while (taken.has(id)) id += 'x';
  return id;
};

export default function PlaceOnSatellite() {
  if (!publicEnv.googleMapsKey) {
    return (
      <div>
        <PageHeader eyebrow="Campus map" title="Place on satellite" />
        <Notice tone="amber">
          Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in <code>apps/campus_web/.env.local</code> (see docs/CAMPUS_MAP_SETUP.md) and restart the site.
          Until then the campus uses the drawn plan only.
        </Notice>
      </div>
    );
  }
  return <MapsProvider><Placement /></MapsProvider>;
}

function Placement() {
  const loaded = useAsync(() => Promise.all([getCampusMap(), adminListBuildings()]), []);
  const [map, setMap] = useState<MapData | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('move');
  const [sel, setSel] = useState<{ kind: 'building' | 'node'; id: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded.data && !map) {
      setMap(loaded.data[0] ?? BLANK);
      setBuildings(loaded.data[1]);
    }
  }, [loaded.data, map]);

  if (loaded.loading || !map) return loaded.error ? <ErrorBox message={loaded.error} onRetry={loaded.reload} /> : <Spinner />;
  const geo = map.geo ?? null;
  const touch = (next: MapData) => { setMap(next); setMsg(null); };
  const touchBuilding = (id: string, change: Partial<Building>) => {
    setBuildings((bs) => bs.map((b) => (b.id === id ? { ...b, ...change } : b)));
    setChanged((c) => new Set(c).add(id));
    setMsg(null);
  };
  const setGeo = (g: GeoRef) => touch({ ...map, geo: g });
  const nodeIds = new Set(map.nodes.map((n) => n.id));

  function addNode(p: PlanPoint, label = 'Path point'): string {
    const id = newId('n', nodeIds);
    const node: MapNode = { id, x: Math.round(p.x), y: Math.round(p.y), label, landmark: null, buildingId: null };
    const edges = sel?.kind === 'node' && mode === 'point'
      ? [...map!.edges, { id: `e-${sel.id}-${id}`, from: sel.id, to: id, accessible: true, note: null }]
      : map!.edges;
    touch({ ...map!, nodes: [...map!.nodes, node], edges });
    return id;
  }

  function mapClick(p: PlanPoint) {
    if (mode === 'point') {
      const id = addNode(p);
      setSel({ kind: 'node', id });
    } else if (mode === 'building') {
      const w = Math.round(30 / map!.metersPerUnit), h = Math.round(20 / map!.metersPerUnit);   // 30 m x 20 m to start
      const id = newId('building', new Set(buildings.map((b) => b.id)));
      const entrance = newId('n', nodeIds);
      const b: Building = {
        id, name: 'New building', code: 'NEW', category: 'academic', description: null,
        x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h, floors: null, openingHours: null,
        entranceNodeId: entrance, accessible: true, published: false, isSample: false,
      };
      setBuildings((bs) => [...bs, b]);
      setChanged((c) => new Set(c).add(id));
      touch({ ...map!, nodes: [...map!.nodes, { id: entrance, x: Math.round(p.x), y: Math.round(p.y + h / 2), label: 'New building entrance', landmark: null, buildingId: id }] });
      setSel({ kind: 'building', id });
      setMode('move');
    }
  }

  function nodeClick(id: string) {
    if (mode === 'connect') {
      if (!connectFrom) { setConnectFrom(id); return; }
      if (connectFrom !== id && !map!.edges.some((e) => (e.from === connectFrom && e.to === id) || (e.from === id && e.to === connectFrom))) {
        touch({ ...map!, edges: [...map!.edges, { id: `e-${connectFrom}-${id}`, from: connectFrom, to: id, accessible: true, note: null }] });
      }
      setConnectFrom(id);   // keep chaining along a path
      return;
    }
    setSel({ kind: 'node', id });
  }

  async function save() {
    if (!map!.geo) { setError('Find the campus first.'); return; }
    setBusy(true); setError(null); setMsg(null);
    try {
      for (const id of changed) {
        const b = buildings.find((x) => x.id === id);
        if (!b) continue;
        const { id: _id, ...rest } = b;
        void _id;
        await saveBuilding(id, { ...rest, isSample: rest.isSample ?? false, published: rest.published ?? false });
      }
      await saveCampusMap(map!);
      setChanged(new Set());
      setMsg('Saved. Directions, the kiosk and the app use the new placement now.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const building = sel?.kind === 'building' ? buildings.find((b) => b.id === sel.id) ?? null : null;
  const node = sel?.kind === 'node' ? map.nodes.find((n) => n.id === sel.id) ?? null : null;

  return (
    <div>
      <PageHeader eyebrow="Campus map" title="Place on satellite"
        subtitle="Pin the campus to the real world, then put each building and path where it really is. Students then get live directions from where they stand."
        actions={<><Link href="/admin/map" className="inline-flex items-center gap-2 rounded-full border-2 border-ink px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em]"><ArrowLeft className="h-4 w-4" /> Plan editor</Link>
          <Button onClick={save} busy={busy} disabled={!geo}><Save className="h-4 w-4" /> Save</Button></>} />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {msg && <div className="mb-4"><Notice tone="green">{msg}</Notice></div>}

      <FindCampus geo={geo} onFound={(g) => setGeo({ ...g, rotationDeg: geo?.rotationDeg ?? 0 })} />

      {geo && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-3">
            <Tabs<Mode> value={mode} onChange={(m) => { setMode(m); setConnectFrom(null); }} tabs={[
              { value: 'move', label: <span className="inline-flex items-center gap-1.5"><Move className="h-3.5 w-3.5" /> Move</span> },
              { value: 'building', label: <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Add building</span> },
              { value: 'point', label: <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add path</span> },
              { value: 'connect', label: <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Connect</span> },
            ]} />
            <p className="text-sm text-slate-600">
              {mode === 'move' && 'Drag building labels and path points onto the satellite image. Drag the yellow anchor to move everything together.'}
              {mode === 'building' && 'Click where a building stands. Then give it its name and size on the right.'}
              {mode === 'point' && 'Click along a walkway. Each new point joins the selected one, so you can trace a path in a row of clicks.'}
              {mode === 'connect' && (connectFrom ? 'Now click the next point to join them (keeps going from there).' : 'Click a point, then another, to join them with a walkway.')}
            </p>
            <div className="card overflow-hidden p-2">
              <GoogleCampusMap map={{ ...map, geo }} buildings={buildings} editable={mode === 'move'} showNodes
                selectedId={sel?.id ?? connectFrom} onMapClick={mode === 'building' || mode === 'point' ? mapClick : undefined}
                onBuildingClick={(id) => setSel({ kind: 'building', id })} onNodeClick={nodeClick}
                onBuildingMove={(id, c) => { const b = buildings.find((x) => x.id === id)!; touchBuilding(id, { x: Math.round(c.x - b.w / 2), y: Math.round(c.y - b.h / 2) }); }}
                onNodeMove={(id, p) => touch({ ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n)) })}
                className="h-[560px] w-full overflow-hidden rounded-[calc(var(--radius-blob)-6px)]">
                <AdvancedMarker position={{ lat: geo.lat, lng: geo.lng }} draggable={mode === 'move'} title="Campus anchor - drag to move the whole campus"
                  onDragEnd={(e) => { const ll = e.latLng?.toJSON(); if (ll) setGeo({ ...geo, ...ll }); }} zIndex={30}>
                  <span className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-ink bg-sun"><MapPin className="h-4 w-4" /></span>
                </AdvancedMarker>
              </GoogleCampusMap>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Rotation: ${Math.round(geo.rotationDeg)}°`} htmlFor="rot" hint="Turn the plan to match the satellite image.">
                <input id="rot" type="range" min={-180} max={180} step={1} value={geo.rotationDeg} className="w-full accent-ink"
                  onChange={(e) => setGeo({ ...geo, rotationDeg: Number(e.target.value) })} />
              </Field>
              <Field label="Metres per plan unit" htmlFor="mpu" hint="Scale: set so a known distance on the plan matches the image.">
                <input id="mpu" type="number" min={0.05} max={10} step={0.05} className="input w-32" value={map.metersPerUnit}
                  onChange={(e) => { const v = Number(e.target.value); if (v > 0) touch({ ...map, metersPerUnit: v }); }} />
              </Field>
            </div>
          </div>

          <aside className="space-y-4">
            {building ? (
              <BuildingPanel b={building} mpu={map.metersPerUnit} onChange={(c) => touchBuilding(building.id, c)} />
            ) : node ? (
              <section className="card space-y-3 p-5">
                <h2 className="display text-2xl">Path point</h2>
                <Field label="Label (used in directions)" htmlFor="n-label">
                  <input id="n-label" className="input" value={node.label} onChange={(e) => touch({ ...map, nodes: map.nodes.map((n) => (n.id === node.id ? { ...n, label: e.target.value } : n)) })} />
                </Field>
                <Field label="Landmark (optional)" htmlFor="n-mark" hint='Spoken in directions: "to the fountain (big banyan tree)".'>
                  <input id="n-mark" className="input" value={node.landmark ?? ''} onChange={(e) => touch({ ...map, nodes: map.nodes.map((n) => (n.id === node.id ? { ...n, landmark: e.target.value || null } : n)) })} />
                </Field>
                <p className="text-xs text-slate-600">Joined to {map.edges.filter((e) => e.from === node.id || e.to === node.id).length} walkway(s).</p>
                <Button variant="danger" size="sm" onClick={() => { touch({ ...map, nodes: map.nodes.filter((n) => n.id !== node.id), edges: map.edges.filter((e) => e.from !== node.id && e.to !== node.id) }); setSel(null); }}>
                  <Trash2 className="h-4 w-4" /> Delete point
                </Button>
              </section>
            ) : (
              <Notice tone="blue">Click a building or a path point to edit it. Names, codes and hours come from you - check them on site.</Notice>
            )}
            <section className="card p-5 text-sm">
              <h2 className="label-caps">This campus</h2>
              <p className="mt-2">{buildings.length} buildings · {map.nodes.length} path points · {map.edges.length} walkways</p>
              {changed.size > 0 && <p className="mt-1"><Badge tone="amber">{changed.size} unsaved building change(s)</Badge></p>}
              {map.isSample && <p className="mt-2 text-xs text-slate-600">This is the sample campus. On your real project the map starts empty.</p>}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Finds the campus with Google's geocoder (your key), e.g. "The Oxford College of Engineering, Bengaluru". */
function FindCampus({ geo, onFound }: { geo: GeoRef | null; onFound: (g: { lat: number; lng: number }) => void }) {
  const geocoding = useMapsLibrary('geocoding');
  const [q, setQ] = useState(publicEnv.collegeName);
  const [results, setResults] = useState<google.maps.GeocoderResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const geocoder = useMemo(() => (geocoding ? new geocoding.Geocoder() : null), [geocoding]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!geocoder) return;
    setError(null);
    try {
      const r = await geocoder.geocode({ address: q });
      setResults(r.results.slice(0, 5));
      if (!r.results.length) setError('Nothing found. Try the full name and city.');
    } catch {
      setError('Google could not search. Check that the Geocoding API is enabled for your key.');
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="display text-3xl">1. Find the campus</h2>
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="campus-q" className="sr-only">Campus name and city</label>
        <input id="campus-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="The Oxford College of Engineering, Bengaluru" />
        <Button type="submit" disabled={!geocoder}><Search className="h-4 w-4" /> Search</Button>
      </form>
      {error && <p className="text-sm font-semibold text-tomato">{error}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-ink/10 rounded-2xl border-2 border-ink">
          {results.map((r) => (
            <li key={r.place_id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="min-w-0">{r.formatted_address}</span>
              <Button size="sm" variant="secondary" onClick={() => { onFound(r.geometry.location.toJSON()); setResults(null); }}>Use this</Button>
            </li>
          ))}
        </ul>
      )}
      {geo && <p className="text-xs text-slate-600">Anchored at {geo.lat.toFixed(6)}, {geo.lng.toFixed(6)}. Drag the yellow anchor to fine-tune.</p>}
    </section>
  );
}

function BuildingPanel({ b, mpu, onChange }: { b: Building; mpu: number; onChange: (c: Partial<Building>) => void }) {
  return (
    <section className="card space-y-3 p-5">
      <h2 className="display text-2xl">Building</h2>
      <Field label="Name" htmlFor="b-name"><input id="b-name" className="input" value={b.name} onChange={(e) => onChange({ name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" htmlFor="b-code" hint="Shown on the map.">
          <input id="b-code" className="input" maxLength={12} value={b.code} onChange={(e) => onChange({ code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Floors" htmlFor="b-floors">
          <input id="b-floors" type="number" min={1} max={40} className="input" value={b.floors ?? ''} onChange={(e) => onChange({ floors: e.target.value ? Number(e.target.value) : null })} />
        </Field>
      </div>
      <Field label="Type" htmlFor="b-cat">
        <select id="b-cat" className="input" value={b.category} onChange={(e) => onChange({ category: e.target.value })}>
          {Object.entries(BUILDING_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Width (m)" htmlFor="b-w"><input id="b-w" type="number" min={2} className="input" value={Math.round(b.w * mpu)} onChange={(e) => onChange({ w: Math.max(1, Math.round(Number(e.target.value) / mpu)) })} /></Field>
        <Field label="Depth (m)" htmlFor="b-h"><input id="b-h" type="number" min={2} className="input" value={Math.round(b.h * mpu)} onChange={(e) => onChange({ h: Math.max(1, Math.round(Number(e.target.value) / mpu)) })} /></Field>
      </div>
      <Field label="Opening hours" htmlFor="b-hours"><input id="b-hours" className="input" value={b.openingHours ?? ''} placeholder="Mon-Sat 9:00-17:00" onChange={(e) => onChange({ openingHours: e.target.value || null })} /></Field>
      <label className={cx('flex items-center gap-2 text-sm font-semibold')}>
        <input type="checkbox" className="h-4 w-4" checked={b.published} onChange={(e) => onChange({ published: e.target.checked })} /> Published (visible to students)
      </label>
      <p className="text-xs text-slate-600">Id: <code>{b.id}</code>{b.name !== 'New building' && b.id.startsWith('building-') && <> · suggested: <code>{slugify(b.name)}</code></>}. Rooms are added in Dashboard &gt; Buildings &amp; rooms.</p>
    </section>
  );
}

