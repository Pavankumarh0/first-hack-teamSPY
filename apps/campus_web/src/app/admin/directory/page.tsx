'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { CampusMap } from '@/components/CampusMap';
import { Badge, Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, Notice, PageHeader, SampleBadge, Tabs } from '@/components/ui';
import { BUILDING_CATEGORY_LABELS, C, LOCATION_TYPE_LABELS, label } from '@/lib/constants';
import { adminListBuildings, adminListPlaces, deleteBuilding, deletePlace, saveBuilding, savePlace, slugify } from '@/lib/admin-data';
import { getCampusMap, type Building, type Place } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import type { CampusMap as MapData } from '@/lib/navigation';
import { useAsync } from '@/lib/useAsync';

export default function DirectoryAdmin() {
  const data = useAsync(() => Promise.all([adminListBuildings(), adminListPlaces(), getCampusMap()]), []);
  const [tab, setTab] = useState<'buildings' | 'places'>('buildings');
  const [q, setQ] = useState('');
  const [editB, setEditB] = useState<Building | 'new' | null>(null);
  const [editP, setEditP] = useState<Place | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildings, places, map] = data.data ?? [[], [], null];
  const sampleCount = buildings.filter((b) => b.isSample).length + places.filter((p) => p.isSample).length;
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const shownB = useMemo(() => buildings.filter((b) => !q || match(`${b.name} ${b.code}`)), [buildings, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownP = useMemo(() => places.filter((p) => !q || match(`${p.name} ${p.room ?? ''} ${p.buildingName ?? ''}`)), [places, q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function removeSamples() {
    if (!confirm(`Delete all ${sampleCount} sample buildings and rooms? Your own entries are kept. The sample map is replaced separately in Campus map.`)) return;
    setBusy(true); setError(null);
    try {
      for (const p of places.filter((x) => x.isSample)) await deletePlace(p.id);
      for (const b of buildings.filter((x) => x.isSample)) await deleteBuilding(b.id);
      data.reload();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Buildings and rooms" subtitle="The campus directory everyone searches: website, app and kiosk."
        actions={<Button onClick={() => (tab === 'buildings' ? setEditB('new') : setEditP('new'))}><Plus className="h-4 w-4" /> {tab === 'buildings' ? 'New building' : 'New room / facility'}</Button>} />
      {sampleCount > 0 && (
        <div className="mb-4"><Notice tone="amber">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{sampleCount} entries are <strong>sample data</strong> from the development seed. Replace them with your real campus before launch.</span>
            <Button size="sm" variant="secondary" busy={busy} onClick={removeSamples}>Remove sample entries</Button>
          </div>
        </Notice></div>
      )}
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'buildings', label: `Buildings (${buildings.length})` }, { value: 'places', label: `Rooms and facilities (${places.length})` }]} />
        <input className="input sm:ml-auto sm:w-64" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the directory" />
      </div>
      {data.loading ? <ListSkeleton count={4} rows={1} /> : data.error ? <ErrorBox message={data.error} onRetry={data.reload} /> : tab === 'buildings' ? (
        shownB.length === 0 ? <EmptyState title="No buildings" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Building</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Map</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shownB.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{b.name} <span className="font-mono text-xs text-slate-500">{b.code}</span></p><div className="mt-0.5 flex gap-1.5">{!b.published && <Badge>Hidden</Badge>}<SampleBadge show={b.isSample} /></div></td>
                    <td className="px-4 py-3 text-slate-700">{label(BUILDING_CATEGORY_LABELS, b.category)}</td>
                    <td className="px-4 py-3 text-slate-700">{b.openingHours ?? '-'}</td>
                    <td className="px-4 py-3">{b.entranceNodeId ? <Badge tone="green">On map</Badge> : <Badge tone="red">No entrance</Badge>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/qr?type=building&id=${b.id}`} className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="QR code"><QrCode className="h-4 w-4" /></Link>
                      <Button size="sm" variant="ghost" onClick={() => setEditB(b)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm(`Delete ${b.name}?`)) { await deleteBuilding(b.id); data.reload(); } }}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        shownP.length === 0 ? <EmptyState title="No rooms or facilities" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Place</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Building</th><th className="px-4 py-3">Map</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shownP.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{p.name}</p><p className="text-xs text-slate-500">{[p.floor != null ? `Floor ${p.floor}` : null, p.room].filter(Boolean).join(' · ')}</p><div className="mt-0.5 flex gap-1.5">{!p.published && <Badge>Hidden</Badge>}<SampleBadge show={p.isSample} /></div></td>
                    <td className="px-4 py-3 text-slate-700">{label(LOCATION_TYPE_LABELS, p.type)}</td>
                    <td className="px-4 py-3 text-slate-700">{p.buildingName ?? '-'}</td>
                    <td className="px-4 py-3">{p.navNodeId ? <Badge tone="green">On map</Badge> : <Badge tone="red">Not reachable</Badge>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/qr?type=location&id=${p.id}`} className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="QR code"><QrCode className="h-4 w-4" /></Link>
                      <Button size="sm" variant="ghost" onClick={() => setEditP(p)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm(`Delete ${p.name}?`)) { await deletePlace(p.id); data.reload(); } }}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <BuildingEditor value={editB} map={map} buildings={buildings} onClose={() => setEditB(null)} onSaved={() => { setEditB(null); data.reload(); }} />
      <PlaceEditor value={editP} map={map} buildings={buildings} onClose={() => setEditP(null)} onSaved={() => { setEditP(null); data.reload(); }} />
    </div>
  );
}

function NodeSelect({ id, map, value, onChange, buildingId }: { id: string; map: MapData | null; value: string; onChange: (v: string) => void; buildingId?: string }) {
  const nodes = [...(map?.nodes ?? [])].sort((a, b) => Number(b.buildingId === buildingId) - Number(a.buildingId === buildingId) || a.label.localeCompare(b.label));
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not on the map</option>
      {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}{n.buildingId === buildingId && buildingId ? ' (this building)' : ''}</option>)}
    </select>
  );
}

function BuildingEditor({ value, map, buildings, onClose, onSaved }: { value: Building | 'new' | null; map: MapData | null; buildings: Building[]; onClose: () => void; onSaved: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const blank = { id: '', name: '', code: '', category: 'academic', description: '', floors: '1', openingHours: '', x: '100', y: '100', w: '100', h: '70', entranceNodeId: '', accessible: true, published: true };
  const [f, setF] = useState(blank);
  const [key, setKey] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (value !== key) {
    setKey(value); setError(null);
    setF(existing ? { id: existing.id, name: existing.name, code: existing.code, category: existing.category, description: existing.description ?? '', floors: String(existing.floors ?? 1), openingHours: existing.openingHours ?? '',
      x: String(existing.x), y: String(existing.y), w: String(existing.w), h: String(existing.h), entranceNodeId: existing.entranceNodeId ?? '', accessible: existing.accessible ?? true, published: existing.published } : blank);
  }
  const preview: Building = { id: f.id || 'preview', name: f.name || 'New building', code: f.code || '?', category: f.category, x: +f.x || 0, y: +f.y || 0, w: +f.w || 10, h: +f.h || 10, published: true };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.code.trim()) return setError('Name and code are required.');
    setBusy(true); setError(null);
    try {
      await saveBuilding(existing?.id ?? (f.id || slugify(f.name)), {
        name: f.name.trim(), code: f.code.trim().toUpperCase(), category: f.category, description: f.description.trim() || null,
        floors: Number(f.floors) || 1, openingHours: f.openingHours.trim() || null, x: +f.x, y: +f.y, w: +f.w, h: +f.h,
        entranceNodeId: f.entranceNodeId || null, accessible: f.accessible, published: f.published, isSample: existing?.isSample ?? false,
      });
      onSaved();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  const num = (k: 'x' | 'y' | 'w' | 'h') => <input aria-label={k} type="number" className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <Modal open={!!value} onClose={onClose} title={existing ? `Edit ${existing.name}` : 'New building'} wide>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><Field label="Name" htmlFor="b-name" required><input id="b-name" className="input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
          <Field label="Code" htmlFor="b-code" required><input id="b-code" className="input" maxLength={12} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        </div>
        {!existing && <Field label="Page id" htmlFor="b-id" hint={`/campus/building/${f.id || slugify(f.name || 'name')}`}><input id="b-id" className="input" value={f.id} onChange={(e) => setF({ ...f, id: slugify(e.target.value) })} /></Field>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type" htmlFor="b-cat"><select id="b-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{C.buildingCategories.map((c) => <option key={c} value={c}>{BUILDING_CATEGORY_LABELS[c]}</option>)}</select></Field>
          <Field label="Floors" htmlFor="b-floors"><input id="b-floors" type="number" min={1} className="input" value={f.floors} onChange={(e) => setF({ ...f, floors: e.target.value })} /></Field>
          <Field label="Opening hours" htmlFor="b-hours"><input id="b-hours" className="input" value={f.openingHours} onChange={(e) => setF({ ...f, openingHours: e.target.value })} placeholder="Mon-Sat 9:00-17:00" /></Field>
        </div>
        <Field label="Description" htmlFor="b-desc"><textarea id="b-desc" className="input" rows={3} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-800">Outline on the map (map units)</p>
            <div className="grid grid-cols-4 gap-2 text-xs text-slate-500"><span>x</span><span>y</span><span>width</span><span>height</span>{num('x')}{num('y')}{num('w')}{num('h')}</div>
            <Field label="Entrance on the walkway network" htmlFor="b-entrance" hint="Directions to this building end here. Add the point in Campus map first.">
              <NodeSelect id="b-entrance" map={map} value={f.entranceNodeId} onChange={(v) => setF({ ...f, entranceNodeId: v })} buildingId={existing?.id} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.accessible} onChange={(e) => setF({ ...f, accessible: e.target.checked })} /> Step-free entrance</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Listed publicly</label>
          </div>
          {map && (
            <div className="card p-1">
              <CampusMap map={map} buildings={[...buildings.filter((b) => b.id !== existing?.id), preview]} highlightBuildingIds={[preview.id]} showNodes selectedNodeIds={[f.entranceNodeId]}
                onCanvasClick={(x, y) => setF({ ...f, x: String(Math.round(x - (+f.w || 0) / 2)), y: String(Math.round(y - (+f.h || 0) / 2)) })}
                onNodeClick={(id) => setF({ ...f, entranceNodeId: id })} />
              <p className="px-2 pb-1 text-xs text-slate-500">Click the map to move the building; click a dot to make it the entrance.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save building</Button></div>
      </form>
    </Modal>
  );
}

function PlaceEditor({ value, map, buildings, onClose, onSaved }: { value: Place | 'new' | null; map: MapData | null; buildings: Building[]; onClose: () => void; onSaved: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const blank = { id: '', name: '', type: 'classroom', buildingId: '', floor: '0', room: '', description: '', navNodeId: '', keywords: '', openingHours: '', published: true };
  const [f, setF] = useState(blank);
  const [key, setKey] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (value !== key) {
    setKey(value); setError(null);
    setF(existing ? { id: existing.id, name: existing.name, type: existing.type, buildingId: existing.buildingId ?? '', floor: String(existing.floor ?? ''), room: existing.room ?? '', description: existing.description ?? '',
      navNodeId: existing.navNodeId ?? '', keywords: (existing.keywords ?? []).join(', '), openingHours: existing.openingHours ?? '', published: existing.published } : blank);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError('The place needs a name.');
    const building = buildings.find((b) => b.id === f.buildingId);
    setBusy(true); setError(null);
    try {
      await savePlace(existing?.id ?? (f.id || slugify(f.name)), {
        name: f.name.trim(), type: f.type, buildingId: building?.id ?? null, buildingName: building?.name ?? null,
        floor: f.floor === '' ? null : Number(f.floor), room: f.room.trim() || null, description: f.description.trim() || null,
        navNodeId: f.navNodeId || building?.entranceNodeId || null,
        keywords: f.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20),
        openingHours: f.openingHours.trim() || null, published: f.published, isSample: existing?.isSample ?? false,
      });
      onSaved();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!value} onClose={onClose} title={existing ? `Edit ${existing.name}` : 'New room or facility'} wide>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><Field label="Name" htmlFor="p-name" required><input id="p-name" className="input" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
          <Field label="Type" htmlFor="p-type"><select id="p-type" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{C.locationTypes.map((t) => <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>)}</select></Field>
        </div>
        {!existing && <Field label="Page id" htmlFor="p-id" hint={`/campus/location/${f.id || slugify(f.name || 'name')}`}><input id="p-id" className="input" value={f.id} onChange={(e) => setF({ ...f, id: slugify(e.target.value) })} /></Field>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Building" htmlFor="p-bld"><select id="p-bld" className="input" value={f.buildingId} onChange={(e) => setF({ ...f, buildingId: e.target.value })}><option value="">None</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Floor" htmlFor="p-floor" hint="0 = ground floor"><input id="p-floor" type="number" className="input" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} /></Field>
          <Field label="Room number" htmlFor="p-room"><input id="p-room" className="input" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
        </div>
        <Field label="Walk to (map point)" htmlFor="p-node" hint="Leave empty to use the building entrance.">
          <NodeSelect id="p-node" map={map} value={f.navNodeId} onChange={(v) => setF({ ...f, navNodeId: v })} buildingId={f.buildingId} />
        </Field>
        <Field label="Search keywords" htmlFor="p-kw" hint="Comma separated: what people type to find it."><input id="p-kw" className="input" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="bus pass, transport" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opening hours" htmlFor="p-hours"><input id="p-hours" className="input" value={f.openingHours} onChange={(e) => setF({ ...f, openingHours: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Listed publicly</label>
        </div>
        <Field label="Description" htmlFor="p-desc"><textarea id="p-desc" className="input" rows={3} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
