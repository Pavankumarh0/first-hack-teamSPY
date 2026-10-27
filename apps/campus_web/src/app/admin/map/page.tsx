'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, MousePointer2, Move, Plus, Save, Trash2, Unlink } from 'lucide-react';
import { CampusMap } from '@/components/CampusMap';
import { Badge, Button, ErrorBox, Field, Modal, Notice, PageHeader, Spinner, cx } from '@/components/ui';
import { adminListBuildings, saveCampusMap, slugify } from '@/lib/admin-data';
import { getCampusMap } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { findRoute, type CampusMap as MapData, type MapEdge, type MapNode } from '@/lib/navigation';
import { useAsync } from '@/lib/useAsync';

type Mode = 'select' | 'add' | 'connect' | 'move';
const BLANK: MapData = { name: 'Campus', width: 1000, height: 700, metersPerUnit: 0.5, backgroundUrl: null, nodes: [], edges: [], isSample: false };

/** Problems that would break directions. */
function checkMap(m: MapData) {
  const ids = new Set(m.nodes.map((n) => n.id));
  const broken = m.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  const unreachable = m.nodes.length ? m.nodes.filter((n) => !findRoute(m, m.nodes[0].id, n.id)) : [];
  return { broken, unreachable };
}

export default function MapEditor() {
  const loaded = useAsync(() => Promise.all([getCampusMap(), adminListBuildings()]), []);
  const [map, setMap] = useState<MapData | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [sel, setSel] = useState<string | null>(null);
  const [testTo, setTestTo] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);

  useEffect(() => { if (loaded.data && !map) setMap(loaded.data[0] ?? BLANK); }, [loaded.data, map]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const buildings = loaded.data?.[1] ?? [];
  const check = useMemo(() => (map ? checkMap(map) : { broken: [], unreachable: [] }), [map]);
  const route = useMemo(() => (map && sel && testTo ? findRoute(map, sel, testTo) : null), [map, sel, testTo]);

  if (loaded.loading || !map) return loaded.error ? <ErrorBox message={loaded.error} onRetry={loaded.reload} /> : <Spinner />;
  const node = map.nodes.find((n) => n.id === sel) ?? null;
  const edgesOf = (id: string) => map.edges.filter((e) => e.from === id || e.to === id);

  function update(next: MapData) { setMap(next); setDirty(true); setMsg(null); }
  function patchNode(id: string, change: Partial<MapNode>) { update({ ...map!, nodes: map!.nodes.map((n) => (n.id === id ? { ...n, ...change } : n)) }); }
  function patchEdge(id: string, change: Partial<MapEdge>) { update({ ...map!, edges: map!.edges.map((e) => (e.id === id ? { ...e, ...change } : e)) }); }

  function canvasClick(x: number, y: number) {
    if (mode === 'add') {
      let id = `n-${Date.now().toString(36)}`;
      while (map!.nodes.some((n) => n.id === id)) id += 'x';
      update({ ...map!, nodes: [...map!.nodes, { id, x, y, label: 'New point', landmark: null, buildingId: null }] });
      setSel(id);
    } else if (mode === 'move' && sel) {
      patchNode(sel, { x, y });
    }
  }
  function nodeClick(id: string) {
    if (mode === 'connect' && sel && sel !== id) {
      const exists = map!.edges.some((e) => (e.from === sel && e.to === id) || (e.from === id && e.to === sel));
      if (!exists) update({ ...map!, edges: [...map!.edges, { id: `e-${sel}-${id}`.slice(0, 60), from: sel, to: id, accessible: true, note: null }] });
      setSel(id);
      return;
    }
    setSel(id);
  }
  function removeNode(id: string) {
    update({ ...map!, nodes: map!.nodes.filter((n) => n.id !== id), edges: map!.edges.filter((e) => e.from !== id && e.to !== id) });
    setSel(null);
  }
  async function save() {
    setBusy(true); setError(null);
    try { await saveCampusMap(map!); setDirty(false); setMsg('Map saved. Directions everywhere use it immediately.'); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const tools: { m: Mode; icon: React.ReactNode; label: string; help: string }[] = [
    { m: 'select', icon: <MousePointer2 className="h-4 w-4" />, label: 'Select', help: 'Click a point to edit it.' },
    { m: 'add', icon: <Plus className="h-4 w-4" />, label: 'Add point', help: 'Click the map to add a junction or entrance.' },
    { m: 'connect', icon: <Link2 className="h-4 w-4" />, label: 'Connect', help: 'Click a point, then another, to add a walkway between them.' },
    { m: 'move', icon: <Move className="h-4 w-4" />, label: 'Move', help: 'Select a point, then click where it should go.' },
  ];

  return (
    <div>
      <PageHeader title="Campus map" subtitle="Walkway points and connections. Directions on the website, app and kiosk follow these paths only."
        actions={<>
          <Button variant="secondary" onClick={() => setJson(JSON.stringify({ ...map, updatedAt: undefined }, null, 2))}>Import / export</Button>
          <Button onClick={save} busy={busy} disabled={!dirty}><Save className="h-4 w-4" /> {dirty ? 'Save map' : 'Saved'}</Button>
        </>} />
      {map.isSample && <div className="mb-4"><Notice tone="amber">This is the <strong>sample map</strong>. Untick "Sample map" below once you have drawn your real campus, or import your own data.</Notice></div>}
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {msg && <div className="mb-4"><Notice tone="green">{msg}</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Map tools">
            {tools.map((t) => (
              <button key={t.m} onClick={() => setMode(t.m)} aria-pressed={mode === t.m}
                className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset',
                  mode === t.m ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{tools.find((t) => t.m === mode)!.help}</p>
          <div className="card p-1">
            <CampusMap map={map} buildings={buildings} showNodes selectedNodeIds={sel ? [sel] : []} route={route}
              onCanvasClick={canvasClick} onNodeClick={nodeClick} title="Map editor" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge>{map.nodes.length} points</Badge><Badge>{map.edges.length} walkways</Badge>
            {check.unreachable.length > 0 ? <Badge tone="red">{check.unreachable.length} point(s) not connected to the rest</Badge> : <Badge tone="green">All points connected</Badge>}
            {check.broken.length > 0 && <Badge tone="red">{check.broken.length} broken walkway(s)</Badge>}
          </div>
        </div>

        <div className="space-y-4">
          {node ? (
            <div className="card space-y-3 p-4">
              <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Point</h2><span className="font-mono text-xs text-slate-500">{node.id}</span></div>
              <Field label="Label" htmlFor="n-label" hint="Used in directions: “walk to …”"><input id="n-label" className="input" value={node.label} onChange={(e) => patchNode(node.id, { label: e.target.value })} /></Field>
              <Field label="Landmark" htmlFor="n-mark" hint="Something visible here: fountain, clock tower..."><input id="n-mark" className="input" value={node.landmark ?? ''} onChange={(e) => patchNode(node.id, { landmark: e.target.value || null })} /></Field>
              <Field label="Entrance of" htmlFor="n-bld">
                <select id="n-bld" className="input" value={node.buildingId ?? ''} onChange={(e) => patchNode(node.id, { buildingId: e.target.value || null })}>
                  <option value="">Not an entrance</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-800">Walkways from here</p>
                {edgesOf(node.id).length === 0 ? <p className="text-sm text-slate-500">None. Use Connect.</p> : (
                  <ul className="space-y-2">
                    {edgesOf(node.id).map((e) => {
                      const other = map.nodes.find((n) => n.id === (e.from === node.id ? e.to : e.from));
                      return (
                        <li key={e.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">to {other?.label ?? '?'}</span>
                            <button onClick={() => update({ ...map, edges: map.edges.filter((x) => x.id !== e.id) })} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Remove walkway"><Unlink className="h-4 w-4" /></button>
                          </div>
                          <label className="mt-1 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={e.accessible !== false} onChange={(ev) => patchEdge(e.id, { accessible: ev.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" /> Step-free</label>
                          <input className="input mt-1 text-xs" placeholder="Note: covered walkway, stairway..." value={e.note ?? ''} onChange={(ev) => patchEdge(e.id, { note: ev.target.value || null })} aria-label="Walkway note" />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Field label="Test a route from here to" htmlFor="n-test">
                <select id="n-test" className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)}>
                  <option value="">-</option>{map.nodes.filter((n) => n.id !== node.id).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </Field>
              {testTo && (route ? <p className="text-sm text-slate-700">{route.distanceM} m, about {route.minutes} min, {route.steps.length - 2} leg(s).</p> : <p className="text-sm text-red-700">No connection.</p>)}
              <Button variant="danger" size="sm" onClick={() => removeNode(node.id)}><Trash2 className="h-4 w-4" /> Delete point</Button>
            </div>
          ) : <Notice>Select a point on the map to edit it.</Notice>}

          <div className="card space-y-3 p-4">
            <h2 className="font-semibold text-slate-900">Map settings</h2>
            <Field label="Name" htmlFor="m-name"><input id="m-name" className="input" value={map.name ?? ''} onChange={(e) => update({ ...map, name: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Width" htmlFor="m-w"><input id="m-w" type="number" className="input" value={map.width} onChange={(e) => update({ ...map, width: Number(e.target.value) || 1000 })} /></Field>
              <Field label="Height" htmlFor="m-h"><input id="m-h" type="number" className="input" value={map.height} onChange={(e) => update({ ...map, height: Number(e.target.value) || 700 })} /></Field>
              <Field label="m / unit" htmlFor="m-scale"><input id="m-scale" type="number" step="0.01" className="input" value={map.metersPerUnit} onChange={(e) => update({ ...map, metersPerUnit: Number(e.target.value) || 1 })} /></Field>
            </div>
            <Field label="Background image URL" htmlFor="m-bg" hint="Optional: a campus plan image (upload it to Storage public/ first)."><input id="m-bg" className="input" value={map.backgroundUrl ?? ''} onChange={(e) => update({ ...map, backgroundUrl: e.target.value || null })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={!!map.isSample} onChange={(e) => update({ ...map, isSample: e.target.checked })} /> Sample map (shows a “Sample data” label)</label>
            <Button variant="secondary" size="sm" onClick={() => { if (confirm('Start an empty map? Save to keep it.')) { update({ ...BLANK, name: map.name }); setSel(null); } }}>Start a blank map</Button>
          </div>
        </div>
      </div>

      <Modal open={json !== null} onClose={() => setJson(null)} title="Import or export the map" wide>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Copy this JSON to keep a backup, or paste your own campus (same shape: nodes with id, x, y, label; edges with id, from, to, accessible) and apply it.</p>
          <textarea className="input font-mono text-xs" rows={16} value={json ?? ''} onChange={(e) => setJson(e.target.value)} aria-label="Map JSON" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setJson(null)}>Close</Button>
            <Button onClick={() => {
              try {
                const parsed = JSON.parse(json ?? '');
                if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) throw new Error('The JSON needs "nodes" and "edges" arrays.');
                const clean: MapData = {
                  name: String(parsed.name ?? 'Campus'), width: Number(parsed.width) || 1000, height: Number(parsed.height) || 700,
                  metersPerUnit: Number(parsed.metersPerUnit) || 1, backgroundUrl: parsed.backgroundUrl ?? null, isSample: !!parsed.isSample,
                  nodes: parsed.nodes.map((n: MapNode) => ({ id: slugify(String(n.id)), x: Number(n.x), y: Number(n.y), label: String(n.label ?? n.id), landmark: n.landmark ?? null, buildingId: n.buildingId ?? null })),
                  edges: parsed.edges.map((e: MapEdge) => ({ id: slugify(String(e.id)), from: slugify(String(e.from)), to: slugify(String(e.to)), accessible: e.accessible !== false, note: e.note ?? null })),
                };
                update(clean); setJson(null); setSel(null);
              } catch (e) { setError(e instanceof Error ? e.message : 'Invalid JSON.'); setJson(null); }
            }}>Apply (then Save)</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
