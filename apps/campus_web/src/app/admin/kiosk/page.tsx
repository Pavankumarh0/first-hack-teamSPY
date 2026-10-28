'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Save } from 'lucide-react';
import { apiFetch, useAuth } from '@/components/AuthProvider';
import { Badge, Button, ErrorBox, Field, Modal, Notice, PageHeader, Spinner } from '@/components/ui';
import { C } from '@/lib/constants';
import { listKioskConfigs, saveKioskConfig, type KioskConfig } from '@/lib/admin-data';
import { listPlaces } from '@/lib/data';
import { publicEnv } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

interface Device { id: string; name: string; kioskConfigId: string; capabilities: string[]; active: boolean; keyPrefix: string; createdAt: string | null; lastSeenAt: string | null }

const ACTION_LABELS: Record<string, string> = {
  directions: 'Walking directions', announcements: 'Notices', events: 'Upcoming events', qr: 'QR codes for phones', search: 'Place search',
};

export default function KioskAdmin() {
  const { idToken } = useAuth();
  const configs = useAsync(() => listKioskConfigs(), []);
  const places = useAsync(() => listPlaces(), []);
  const devices = useAsync(() => apiFetch<{ devices: Device[] }>(idToken, '/api/admin/kiosk-devices').then((r) => r.devices), []);
  const [c, setC] = useState<KioskConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (configs.data && !c) setC(configs.data[0] ?? { id: 'default', name: 'Campus kiosk', locationId: null, navNodeId: null, welcomeText: '', enabledActions: [...C.kioskActions], announcementsLimit: 3, featuredLocationIds: [] });
  }, [configs.data, c]);

  async function save() {
    if (!c) return;
    setBusy(true); setError(null); setMsg(null);
    const loc = places.data?.find((p) => p.id === c.locationId);
    try { await saveKioskConfig({ ...c, navNodeId: loc?.navNodeId ?? c.navNodeId }); setMsg('Kiosk settings saved. The kiosk picks them up on its next request.'); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Kiosk" subtitle="What the campus information kiosk shows, and the devices allowed to call the kiosk API." />
      <Notice>
        The ESP32 kiosk firmware is unchanged. It talks to the PC over USB; the PC side (or any kiosk backend) calls this platform's
        read-only kiosk API with a device key. See <code>kiosk/API_CONTRACT.md</code>.
      </Notice>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {msg && <div className="mt-4"><Notice tone="green">{msg}</Notice></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Content and actions</h2>
          {!c ? <Spinner /> : (
            <>
              {configs.data && configs.data.length > 1 && (
                <Field label="Kiosk configuration" htmlFor="k-id"><select id="k-id" className="input" value={c.id} onChange={(e) => setC(configs.data!.find((x) => x.id === e.target.value) ?? c)}>{configs.data.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
              )}
              <Field label="Name" htmlFor="k-name"><input id="k-name" className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
              <Field label="Where the kiosk stands" htmlFor="k-loc" hint="Directions on the kiosk start here.">
                <select id="k-loc" className="input" value={c.locationId ?? ''} onChange={(e) => setC({ ...c, locationId: e.target.value || null })}>
                  <option value="">-</option>{places.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Welcome text" htmlFor="k-welcome" hint="ASCII only on the kiosk screen; other characters are dropped."><textarea id="k-welcome" className="input" rows={3} maxLength={280} value={c.welcomeText} onChange={(e) => setC({ ...c, welcomeText: e.target.value })} /></Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-800">Enabled actions</legend>
                <div className="grid grid-cols-2 gap-2">
                  {C.kioskActions.map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={c.enabledActions.includes(a)}
                      onChange={(e) => setC({ ...c, enabledActions: e.target.checked ? [...c.enabledActions, a] : c.enabledActions.filter((x) => x !== a) })} />{ACTION_LABELS[a] ?? a}</label>
                  ))}
                </div>
              </fieldset>
              <Field label="Notices shown" htmlFor="k-limit"><input id="k-limit" type="number" min={1} max={10} className="input w-24" value={c.announcementsLimit} onChange={(e) => setC({ ...c, announcementsLimit: Number(e.target.value) || 3 })} /></Field>
              <Field label="Featured places" hint="Suggested destinations on the kiosk home screen.">
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {places.data?.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={c.featuredLocationIds.includes(p.id)}
                      onChange={(e) => setC({ ...c, featuredLocationIds: e.target.checked ? [...c.featuredLocationIds, p.id] : c.featuredLocationIds.filter((x) => x !== p.id) })} />{p.name}</label>
                  ))}
                </div>
              </Field>
              <Button onClick={save} busy={busy}><Save className="h-4 w-4" /> Save kiosk settings</Button>
            </>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Device keys</h2><Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New key</Button></div>
          <p className="text-sm text-slate-600">Each kiosk gets its own key. Keys are shown once and stored only as a hash; revoke a key if a device is lost.</p>
          {devices.loading ? <Spinner /> : devices.error ? <ErrorBox message={devices.error} onRetry={devices.reload} /> : devices.data!.length === 0 ? <p className="text-sm text-slate-500">No devices yet.</p> : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {devices.data!.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{d.name} <span className="font-mono text-xs text-slate-500">{d.keyPrefix}…</span></p>
                    <p className="text-xs text-slate-500">{d.capabilities.join(', ')} · {d.lastSeenAt ? `last seen ${formatDateTime(new Date(d.lastSeenAt))}` : 'never used'}</p>
                  </div>
                  {d.active ? <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Revoke the key for ${d.name}?`)) { await apiFetch(idToken, `/api/admin/kiosk-devices/${d.id}`, { method: 'DELETE' }); devices.reload(); } }}>Revoke</Button> : <Badge tone="red">Revoked</Badge>}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold">Try it</p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono">{`curl -H "Authorization: Bearer <key>" \\\n  "${publicEnv.siteUrl}/api/kiosk/v1/directions?to=library-reading-hall"`}</pre>
          </div>
        </section>
      </div>

      <NewDevice open={adding} configId={c?.id ?? 'default'} onClose={() => setAdding(false)} onCreated={(key) => { setAdding(false); setNewKey(key); devices.reload(); }} />
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Copy the device key now">
        <div className="space-y-3">
          <Notice tone="amber">This key will not be shown again. Store it on the kiosk PC only (for example in its .env file), never in the ESP32 firmware or a repository.</Notice>
          <code className="block break-all rounded-lg bg-slate-900 p-3 font-mono text-sm text-emerald-300">{newKey}</code>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(newKey ?? '')}><Copy className="h-4 w-4" /> Copy</Button>
        </div>
      </Modal>
    </div>
  );
}

function NewDevice({ open, configId, onClose, onCreated }: { open: boolean; configId: string; onClose: () => void; onCreated: (key: string) => void }) {
  const { idToken } = useAuth();
  const [name, setName] = useState('');
  const [caps, setCaps] = useState<string[]>(['kiosk']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="New device key">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          const r = await apiFetch<{ key: string }>(idToken, '/api/admin/kiosk-devices', { method: 'POST', body: JSON.stringify({ name, kioskConfigId: configId, capabilities: caps }) });
          setName(''); onCreated(r.key);
        } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
      }}>
        {error && <ErrorBox message={error} />}
        <Field label="Device name" htmlFor="d-name" required><input id="d-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Admin lobby kiosk PC" /></Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-800">Allowed to</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={caps.includes('kiosk')} onChange={(e) => setCaps(e.target.checked ? [...caps, 'kiosk'] : caps.filter((x) => x !== 'kiosk'))} /> Read kiosk content</label>
          {publicEnv.features.rfidAttendance && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={caps.includes('attendance')} onChange={(e) => setCaps(e.target.checked ? [...caps, 'attendance'] : caps.filter((x) => x !== 'attendance'))} /> Submit RFID check-ins (future)</label>
          )}
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={name.trim().length < 2 || caps.length === 0}><KeyRound className="h-4 w-4" /> Create key</Button></div>
      </form>
    </Modal>
  );
}
