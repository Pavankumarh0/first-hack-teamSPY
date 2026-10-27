'use client';

import { useMemo, useState } from 'react';
import { Bell, Pencil, Plus } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, Notice, PageHeader, SampleBadge, type Tone } from '@/components/ui';
import { announceEvent, listEventsForClubs, listManagedClubs, saveEvent, type EventInput } from '@/lib/admin-data';
import { listPlaces, type CampusEvent, type Club } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { formatRange } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

const TONE: Record<string, Tone> = { draft: 'slate', published: 'green', cancelled: 'red' };

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default function EventsAdmin() {
  const { profile, isAdmin } = useAuth();
  const data = useAsync(async () => {
    const clubs = await listManagedClubs(profile!.id, isAdmin);
    const events = await listEventsForClubs(isAdmin ? 'all' : clubs.map((c) => c.id));
    return { clubs, events };
  }, [profile?.id, isAdmin]);
  const [editing, setEditing] = useState<CampusEvent | 'new' | null>(null);
  const [filter, setFilter] = useState('upcoming');
  const [msg, setMsg] = useState<string | null>(null);
  const now = new Date();
  const shown = useMemo(() => (data.data?.events ?? []).filter((e) =>
    filter === 'all' ? true : filter === 'upcoming' ? e.endAt >= now : e.status === filter), [data.data, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader title="Events" subtitle={isAdmin ? 'All club and campus events.' : 'Events for the clubs you manage.'}
        actions={<Button onClick={() => setEditing('new')} disabled={!data.data?.clubs.length}><Plus className="h-4 w-4" /> New event</Button>} />
      {!isAdmin && data.data && data.data.clubs.length === 0 && <div className="mb-4"><Notice tone="amber">You are not a manager of any club yet. An administrator adds you in Clubs.</Notice></div>}
      {msg && <div className="mb-4"><Notice tone="green">{msg}</Notice></div>}
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="ev-filter" className="text-sm text-slate-600">Show</label>
        <select id="ev-filter" className="input w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="upcoming">Upcoming</option><option value="all">All</option><option value="draft">Drafts</option><option value="published">Published</option><option value="cancelled">Cancelled</option>
        </select>
      </div>
      {data.loading ? <ListSkeleton count={3} rows={1} /> : data.error ? <ErrorBox message={data.error} onRetry={data.reload} /> :
        shown.length === 0 ? <EmptyState title="No events" /> : (
          <ul className="card divide-y divide-slate-100">
            {shown.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2"><Badge tone={TONE[e.status]}>{e.status}</Badge><Badge>{e.clubName}</Badge><SampleBadge show={e.isSample} /></div>
                  <p className="mt-1 font-medium text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{formatRange(e.startAt, e.endAt)} · {e.venueName}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {isAdmin && e.status === 'published' && e.endAt >= now && (
                    <Button size="sm" variant="secondary" title="Send a campus-wide notification"
                      onClick={async () => { await announceEvent(e.id, e.title, formatRange(e.startAt, e.endAt)); setMsg(`Students were notified about "${e.title}".`); }}>
                      <Bell className="h-4 w-4" /> Notify
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      <EventEditor value={editing} clubs={data.data?.clubs ?? []} uid={profile!.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); data.reload(); }} />
    </div>
  );
}

function EventEditor({ value, clubs, uid, onClose, onSaved }: { value: CampusEvent | 'new' | null; clubs: Club[]; uid: string; onClose: () => void; onSaved: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const places = useAsync(() => listPlaces(), []);
  const blank = () => {
    const start = new Date(Date.now() + 86400000); start.setMinutes(0, 0, 0);
    return { clubId: clubs[0]?.id ?? '', title: '', description: '', start: toLocalInput(start), end: toLocalInput(new Date(start.getTime() + 7200000)), venueName: '', venueLocationId: '', status: 'draft' };
  };
  const [f, setF] = useState(blank);
  const [key, setKey] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (value !== key) {
    setKey(value); setError(null);
    setF(existing ? { clubId: existing.clubId, title: existing.title, description: existing.description, start: toLocalInput(existing.startAt), end: toLocalInput(existing.endAt), venueName: existing.venueName, venueLocationId: existing.venueLocationId ?? '', status: existing.status } : blank());
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const club = clubs.find((c) => c.id === f.clubId);
    const startAt = new Date(f.start); const endAt = new Date(f.end);
    if (!club) return setError('Choose a club.');
    if (!f.title.trim()) return setError('Give the event a title.');
    if (!f.venueName.trim()) return setError('Say where it happens.');
    if (!(endAt >= startAt)) return setError('The end must be after the start.');
    setBusy(true); setError(null);
    try {
      const input: EventInput = { clubId: club.id, clubName: club.name, title: f.title, description: f.description, startAt, endAt,
        venueName: f.venueName, venueLocationId: f.venueLocationId || null, status: f.status as EventInput['status'] };
      await saveEvent(existing?.id ?? null, input, uid, existing);
      onSaved();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!value} onClose={onClose} title={existing ? 'Edit event' : 'New event'} wide>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Club" htmlFor="e-club" required>
            <select id="e-club" className="input" value={f.clubId} onChange={(e) => setF({ ...f, clubId: e.target.value })} disabled={!!existing}>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status" htmlFor="e-status" hint="Only published and cancelled events are visible to students.">
            <select id="e-status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </div>
        <Field label="Title" htmlFor="e-title" required><input id="e-title" className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description" htmlFor="e-desc"><textarea id="e-desc" className="input" rows={4} maxLength={4000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" htmlFor="e-start" required><input id="e-start" type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Ends" htmlFor="e-end" required><input id="e-end" type="datetime-local" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venue (on the map)" htmlFor="e-venue-loc" hint="Lets students get directions.">
            <select id="e-venue-loc" className="input" value={f.venueLocationId} onChange={(e) => {
              const p = places.data?.find((x) => x.id === e.target.value);
              setF({ ...f, venueLocationId: e.target.value, venueName: p ? (p.room ? `${p.name} (${p.room})` : p.name) : f.venueName });
            }}>
              <option value="">Not on the map</option>
              {places.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Venue name" htmlFor="e-venue" required><input id="e-venue" className="input" maxLength={120} value={f.venueName} onChange={(e) => setF({ ...f, venueName: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save event</Button></div>
      </form>
    </Modal>
  );
}
