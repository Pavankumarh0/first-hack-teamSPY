'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { QrCode } from '@/components/QrCode';
import { Badge, Button, ErrorBox, Field, Notice, PageHeader, SampleBadge, Spinner } from '@/components/ui';
import { listQr, saveQr, setQrActive } from '@/lib/admin-data';
import { listAnnouncements, listBuildings, listClubs, listPlaces, listUpcomingEvents } from '@/lib/data';
import { campusPath, campusUrl, type CampusLink } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';
import type { DeepLinkType } from '@/lib/constants';

export default function QrPage() {
  return <Suspense fallback={<Spinner />}><QrAdmin /></Suspense>;
}

function QrAdmin() {
  const { profile } = useAuth();
  const params = useSearchParams();
  const targets = useAsync(async () => {
    const [places, buildings, events, clubs, notices] = await Promise.all([listPlaces(), listBuildings(), listUpcomingEvents(50), listClubs(), listAnnouncements(50)]);
    return {
      location: places.map((p) => ({ id: p.id, name: p.name })),
      building: buildings.map((b) => ({ id: b.id, name: b.name })),
      event: events.items.map((e) => ({ id: e.id, name: e.title })),
      club: clubs.map((c) => ({ id: c.id, name: c.name })),
      notice: notices.items.map((a) => ({ id: a.id, name: a.title })),
      route: places.map((p) => ({ id: p.id, name: p.name })),
    } as Record<DeepLinkType, { id: string; name: string }[]>;
  }, []);
  const saved = useAsync(() => listQr(), []);
  const [type, setType] = useState<DeepLinkType>((params.get('type') as DeepLinkType) || 'location');
  const [id, setId] = useState(params.get('id') ?? '');
  const [from, setFrom] = useState('');
  const [labelText, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = targets.data?.[type] ?? [];
  const link: CampusLink | null = id ? (type === 'route' ? { type, to: id, from: from || undefined } : { type, id }) : null;
  const url = useMemo(() => (link ? campusUrl(publicEnv.siteUrl, link) : null), [link?.type, link?.id, link?.from, link?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultLabel = options.find((o) => o.id === id)?.name ?? '';

  async function save() {
    if (!link) return;
    setBusy(true); setError(null); setMsg(null);
    try { await saveQr(link, labelText || (type === 'route' ? `Directions to ${defaultLabel}` : defaultLabel), profile!.id); setMsg('Saved to the QR list.'); saved.reload(); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="QR codes" subtitle="Print a code for a room, building, event, club, notice or route. It always links to the public page; with the app installed it opens there." />
      {publicEnv.siteUrl.includes('localhost') && <div className="mb-4"><Notice tone="amber">NEXT_PUBLIC_SITE_URL is <code>{publicEnv.siteUrl}</code>. Set it to your public domain before printing codes, or phones will not reach them.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          {targets.error && <ErrorBox message={targets.error} />}
          <Field label="What should the code open?" htmlFor="qr-type">
            <select id="qr-type" className="input" value={type} onChange={(e) => { setType(e.target.value as DeepLinkType); setId(''); setFrom(''); }}>
              <option value="location">A room or facility</option><option value="building">A building</option><option value="event">An event</option>
              <option value="club">A club</option><option value="notice">A notice</option><option value="route">Directions (route)</option>
            </select>
          </Field>
          {type === 'route' && (
            <Field label="Start from" htmlFor="qr-from" hint="Usually where the code is posted, e.g. the kiosk.">
              <select id="qr-from" className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Let the visitor choose</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          )}
          <Field label={type === 'route' ? 'Destination' : 'Which one?'} htmlFor="qr-target">
            <select id="qr-target" className="input" value={id} onChange={(e) => setId(e.target.value)} disabled={targets.loading}>
              <option value="">Choose...</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Label (for your list)" htmlFor="qr-label"><input id="qr-label" className="input" value={labelText} placeholder={defaultLabel} onChange={(e) => setLabel(e.target.value)} maxLength={120} /></Field>
          {error && <ErrorBox message={error} />}
          {msg && <Notice tone="green">{msg}</Notice>}
          <Button onClick={save} busy={busy} disabled={!link}><Save className="h-4 w-4" /> Save to list</Button>
        </div>
        <div className="card flex flex-col items-center justify-center gap-4 p-6 text-center">
          {url ? (
            <>
              <QrCode value={url} size={240} downloads fileName={link ? campusPath(link).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') : 'qr'} />
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-sm text-brand-700 hover:underline">{url}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
            </>
          ) : <p className="text-sm text-slate-500">Choose a destination to see its code.</p>}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Saved codes</h2>
        {saved.loading ? <Spinner /> : saved.error ? <ErrorBox message={saved.error} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {saved.data!.map((q) => {
              const full = `${publicEnv.siteUrl}${q.path}`;
              return (
                <div key={q.id} className="card flex gap-4 p-4">
                  <QrCode value={full} size={88} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5"><Badge tone="brand">{q.type}</Badge>{!q.active && <Badge tone="red">Inactive</Badge>}<SampleBadge show={q.isSample} /></div>
                    <p className="mt-1 truncate text-sm font-medium text-slate-900">{q.label}</p>
                    <p className="truncate text-xs text-slate-500">{q.path}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => { setType(q.type); setId(q.type === 'route' ? q.targetId.split('>')[1] : q.targetId); setFrom(q.type === 'route' ? q.targetId.split('>')[0] : ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Open</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { await setQrActive(q.id, !q.active); saved.reload(); }}>{q.active ? 'Deactivate' : 'Activate'}</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
