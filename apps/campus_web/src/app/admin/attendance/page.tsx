'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, Fingerprint } from 'lucide-react';
import { apiFetch, useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, Field, Notice, PageHeader, Spinner, Tabs, type Tone } from '@/components/ui';
import {
  getAttendanceSettings, listAttendanceRecords, listAttendanceSessions, listRfidCards, listScanLog, saveAttendanceSession,
  saveAttendanceSettings, setSessionReaders, type AttendanceSession, type AttendanceSettings, type RecordFilter,
} from '@/lib/admin-data';
import { SCAN_STATUS_LABELS } from '@/lib/attendance';
import { friendlyError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

// RFID attendance: UNO Q card reader -> kiosk ESP32 -> kiosk PC -> scan API.
// Every record here was created by the server after it checked the card
// (docs/RFID_BACKEND.md); this page never writes records itself. Raw card
// UIDs are never stored or shown - only the last two bytes ("91:0C").

interface Reader { id: string; name: string; capabilities: string[]; active: boolean; lastSeenAt: string | null }
type TabId = 'records' | 'cards' | 'log' | 'setup';

const RESULT_TONES: Record<string, Tone> = {
  checked_in: 'green', already_checked_in: 'slate', duplicate: 'slate', unknown_card: 'amber', no_open_session: 'amber',
  student_inactive: 'red', disabled: 'slate', card_registered: 'blue', card_activated: 'blue', card_deactivated: 'violet',
};
const resultLabel = (r: string) => SCAN_STATUS_LABELS[r as keyof typeof SCAN_STATUS_LABELS] ?? r;

export default function AttendanceAdmin() {
  const { idToken } = useAuth();
  const [tab, setTab] = useState<TabId>('records');
  const settings = useAsync(() => getAttendanceSettings(), []);
  const sessions = useAsync(() => listAttendanceSessions(), []);
  const readers = useAsync(() => apiFetch<{ devices: Reader[] }>(idToken, '/api/admin/kiosk-devices')
    .then((r) => r.devices.filter((d) => d.active && d.capabilities.includes('attendance'))), []);
  const health = useAsync(() => fetch('/api/health').then((r) => r.json() as Promise<{ rfidAttendance?: { cardSecret?: string } }>), []);
  const sessionTitles = useMemo(() => new Map((sessions.data ?? []).map((s) => [s.id, s.title])), [sessions.data]);
  const readerNames = useMemo(() => new Map((readers.data ?? []).map((r) => [r.id, r.name])), [readers.data]);

  const secret = health.data?.rfidAttendance?.cardSecret;
  const steps = [
    { ok: secret === 'set', label: 'Card secret set on the server', hint: secret && secret !== 'set' ? secret : undefined, loading: health.loading },
    { ok: (readers.data?.length ?? 0) > 0, label: `Reader keys with "RFID check-ins": ${readers.data?.length ?? '...'}`, hint: 'Dashboard > Kiosk > Device keys', loading: readers.loading },
    { ok: (sessions.data ?? []).some((s) => (s.readerIds ?? []).length > 0), label: 'A session is assigned to a reader', hint: 'Sessions & settings tab', loading: sessions.loading },
    { ok: settings.data?.enabled === true, label: 'Check-ins switched on', hint: 'Sessions & settings tab', loading: settings.loading },
  ];

  return (
    <div>
      <PageHeader title="RFID attendance" subtitle="Card taps at the kiosk, checked by the server, recorded here." />
      <section className="card mb-6 p-5">
        <div className="flex items-start gap-3">
          <Fingerprint className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900">Setup</h2>
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              {steps.map((s) => (
                <li key={s.label} className="flex items-start gap-2">
                  {s.loading ? <Spinner label="" /> : s.ok
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="done" />
                    : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="to do" />}
                  <span className="min-w-0">{s.label}{!s.ok && s.hint && <span className="block text-xs text-slate-500">{s.hint}</span>}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Reader hardware: UNO Q + RC522 to the kiosk ESP32 (GPIO16) to the kiosk PC. Verify each stage with
              <code> docs/RFID_TESTING.md</code> before relying on these records. A card identifies a card, not a person.
            </p>
          </div>
        </div>
      </section>

      <Tabs<TabId> value={tab} onChange={setTab} tabs={[
        { value: 'records', label: 'Records' }, { value: 'cards', label: 'Cards' },
        { value: 'log', label: 'Scan log' }, { value: 'setup', label: 'Sessions & settings' },
      ]} />
      {tab === 'records' && <RecordsTab sessions={sessions.data ?? []} />}
      {tab === 'cards' && <CardsTab />}
      {tab === 'log' && <ScanLogTab sessionTitles={sessionTitles} />}
      {tab === 'setup' && (
        <SetupTab settings={settings.data} settingsLoading={settings.loading} sessions={sessions} readers={readers.data ?? []}
          readersError={readers.error} readerNames={readerNames} onSettingsSaved={settings.reload} />
      )}
    </div>
  );
}

// --- records ------------------------------------------------------------------

function RecordsTab({ sessions }: { sessions: AttendanceSession[] }) {
  const [draft, setDraft] = useState<RecordFilter>({});
  const [filter, setFilter] = useState<RecordFilter>({});
  const records = useAsync(() => listAttendanceRecords(filter), [filter]);
  const apply = (e: FormEvent) => { e.preventDefault(); setFilter({ ...draft }); };

  return (
    <section className="space-y-4">
      <form onSubmit={apply} className="card grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
        <Field label="Session" htmlFor="f-session">
          <select id="f-session" className="input" value={draft.sessionId ?? ''} onChange={(e) => setDraft({ ...draft, sessionId: e.target.value || undefined })}>
            <option value="">All sessions</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title} · {formatDateTime(s.startsAt)}</option>)}
          </select>
        </Field>
        <Field label="Day" htmlFor="f-day">
          <input id="f-day" type="date" className="input" value={draft.day ?? ''} onChange={(e) => setDraft({ ...draft, day: e.target.value || undefined })} />
        </Field>
        <Field label="Student username" htmlFor="f-student">
          <input id="f-student" className="input" value={draft.username ?? ''} placeholder="asha.k" autoCapitalize="none"
            onChange={(e) => setDraft({ ...draft, username: e.target.value || undefined })} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Show</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft({}); setFilter({}); }}>Clear</Button>
        </div>
      </form>
      {records.loading ? <Spinner /> : records.error ? <ErrorBox message={records.error} onRetry={records.reload} /> :
        records.data!.length === 0 ? (
          <EmptyState title="No check-ins found" body="Records appear when a registered card is tapped on a reader during an open session." />
        ) : (
          <div className="card overflow-x-auto">
            <p className="px-4 pt-3 text-xs text-slate-500">{records.data!.length === 100 ? 'Newest 100 shown - narrow the filters for more.' : `${records.data!.length} record(s)`}</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Session</th><th className="px-4 py-2">Checked in</th><th className="px-4 py-2">Reader</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.data!.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2"><span className="font-medium text-slate-900">{r.studentName ?? r.studentUsername ?? r.studentId}</span>
                      {r.studentUsername && <span className="block text-xs text-slate-500">@{r.studentUsername}</span>}</td>
                    <td className="px-4 py-2">{r.sessionTitle ?? r.sessionId}{r.course && <span className="block text-xs text-slate-500">{r.course}</span>}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(r.checkInAt)}
                      {(r.deviceDelayMs ?? 0) > 5000 && <span className="block text-xs text-slate-500" title="The tap waited at the kiosk while it was answering a question.">tapped ~{Math.round((r.deviceDelayMs ?? 0) / 1000)} s earlier</span>}</td>
                    <td className="px-4 py-2">{r.readerName ?? r.readerId}</td>
                    <td className="px-4 py-2"><Badge tone="green" title={`Card ..${r.cardHint ?? ''}, verified by the server`}>Verified</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

// --- cards --------------------------------------------------------------------

function CardsTab() {
  const { idToken } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const cards = useAsync(() => listRfidCards(query), [query]);
  const unknown = useAsync(() => listScanLog('unknown_card'), []);
  const [f, setF] = useState({ username: '', cardUid: '', label: '' });
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // One row per card that was tapped but is not registered (newest first).
  const unknownCards = useMemo(() => {
    const seen = new Set<string>();
    return (unknown.data ?? []).filter((r) => (seen.has(r.cardKey) ? false : (seen.add(r.cardKey), true))).slice(0, 20);
  }, [unknown.data]);

  async function register(body: Record<string, string>, key: string) {
    setBusy(key); setError(null); setMsg(null);
    try {
      const r = await apiFetch<{ cardHint: string; studentUsername: string }>(idToken, '/api/admin/rfid-cards', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Card ..${r.cardHint} now belongs to @${r.studentUsername}.`);
      cards.reload(); unknown.reload();
      return true;
    } catch (e) { setError(friendlyError(e)); return false; } finally { setBusy(null); }
  }

  async function toggle(id: string, active: boolean) {
    setBusy(id); setError(null); setMsg(null);
    try { await apiFetch(idToken, `/api/admin/rfid-cards/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); cards.reload(); setMsg(active ? 'Card activated.' : 'Card deactivated: it will be refused at every reader.'); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBox message={error} />}
      {msg && <Notice tone="green">{msg}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold text-slate-900">Register a card</h2>
          <p className="text-sm text-slate-600">The UID is shown in the reader&apos;s log (e.g. <code>A3:2F:91:0C</code>). Easier: tap the card on a reader, then assign it under &quot;Tapped, not registered&quot;.</p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await register({ username: f.username, cardUid: f.cardUid, ...(f.label ? { label: f.label } : {}) }, 'form')) setF({ username: '', cardUid: '', label: '' });
          }}>
            <Field label="Student username" htmlFor="c-user" required><input id="c-user" className="input" value={f.username} autoCapitalize="none" onChange={(e) => setF({ ...f, username: e.target.value })} required /></Field>
            <Field label="Card UID" htmlFor="c-uid" required><input id="c-uid" className="input font-mono" value={f.cardUid} placeholder="A3:2F:91:0C" autoComplete="off" onChange={(e) => setF({ ...f, cardUid: e.target.value })} required /></Field>
            <Field label="Label (optional)" htmlFor="c-label"><input id="c-label" className="input" value={f.label} placeholder="ID card 2026" onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
            <div className="flex items-end"><Button type="submit" size="sm" busy={busy === 'form'}>Register card</Button></div>
          </form>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold text-slate-900">Tapped, not registered</h2>
          {unknown.loading ? <Spinner /> : unknown.error ? <ErrorBox message={unknown.error} onRetry={unknown.reload} /> : unknownCards.length === 0 ? (
            <p className="text-sm text-slate-500">No unknown cards have been tapped. Check-ins must be switched on for readers to report cards.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {unknownCards.map((u) => (
                <li key={u.cardKey} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-mono">..{u.cardHint}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(u.at)} · {u.readerName ?? u.readerId}</span>
                  <form className="ml-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); register({ username: assign[u.cardKey] ?? '', cardKey: u.cardKey }, u.cardKey); }}>
                    <label className="sr-only" htmlFor={`as-${u.id}`}>Student username for card ..{u.cardHint}</label>
                    <input id={`as-${u.id}`} className="input h-8 w-32" placeholder="username" autoCapitalize="none" value={assign[u.cardKey] ?? ''} onChange={(e) => setAssign({ ...assign, [u.cardKey]: e.target.value })} required />
                    <Button type="submit" size="sm" variant="secondary" busy={busy === u.cardKey}>Assign</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
          <Field label="Find cards by student username" htmlFor="c-search"><input id="c-search" className="input" value={search} autoCapitalize="none" onChange={(e) => setSearch(e.target.value)} /></Field>
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
        {cards.loading ? <Spinner /> : cards.error ? <ErrorBox message={cards.error} onRetry={cards.reload} /> : cards.data!.length === 0 ? (
          <EmptyState title="No registered cards" body={query ? `No card is registered to @${query}.` : 'Register a card above.'} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Card</th><th className="px-4 py-2">Student</th><th className="px-4 py-2">Registered</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cards.data!.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2"><span className="font-mono">..{c.cardHint}</span>{c.label && <span className="block text-xs text-slate-500">{c.label}</span>}</td>
                    <td className="px-4 py-2">{c.studentName ?? c.studentUsername}<span className="block text-xs text-slate-500">@{c.studentUsername}</span></td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(c.registeredAt)}</td>
                    <td className="px-4 py-2"><Badge tone={c.active ? 'green' : 'red'}>{c.active ? 'Active' : 'Deactivated'}</Badge></td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" busy={busy === c.id} onClick={() => {
                        if (!c.active || confirm(`Deactivate card ..${c.cardHint} of @${c.studentUsername}? It will be refused at every reader.`)) toggle(c.id, !c.active);
                      }}>{c.active ? 'Deactivate' : 'Activate'}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// --- scan log -----------------------------------------------------------------

function ScanLogTab({ sessionTitles }: { sessionTitles: Map<string, string> }) {
  const [result, setResult] = useState('');
  const log = useAsync(() => listScanLog(result || undefined), [result]);
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">Every scan the server received, accepted or refused, and every card change. Refused scans create no record.</p>
      <Field label="Result" htmlFor="l-result">
        <select id="l-result" className="input w-56" value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">All results</option>
          {['checked_in', 'already_checked_in', 'duplicate', 'unknown_card', 'no_open_session', 'student_inactive', 'card_registered', 'card_deactivated', 'card_activated']
            .map((r) => <option key={r} value={r}>{resultLabel(r)}</option>)}
        </select>
      </Field>
      {log.loading ? <Spinner /> : log.error ? <ErrorBox message={log.error} onRetry={log.reload} /> : log.data!.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Scans appear here as soon as a reader sends one." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Card</th><th className="px-4 py-2">Student</th><th className="px-4 py-2">Session</th><th className="px-4 py-2">Reader</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {log.data!.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(r.at)}</td>
                  <td className="px-4 py-2"><Badge tone={RESULT_TONES[r.result] ?? 'slate'}>{resultLabel(r.result)}</Badge></td>
                  <td className="px-4 py-2 font-mono">..{r.cardHint ?? '??'}</td>
                  <td className="px-4 py-2">{r.studentUsername ? `@${r.studentUsername}` : '-'}</td>
                  <td className="px-4 py-2">{r.sessionId ? sessionTitles.get(r.sessionId) ?? r.sessionId : '-'}</td>
                  <td className="px-4 py-2">{r.readerName ?? r.readerId ?? 'dashboard'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// --- sessions & settings ------------------------------------------------------

function SetupTab({ settings, settingsLoading, sessions, readers, readersError, readerNames, onSettingsSaved }: {
  settings: AttendanceSettings | null | undefined; settingsLoading: boolean;
  sessions: ReturnType<typeof useAsync<AttendanceSession[]>>; readers: Reader[]; readersError: string | null;
  readerNames: Map<string, string>; onSettingsSaved: () => void;
}) {
  const [s, setS] = useState<AttendanceSettings | null>(null);
  const [f, setF] = useState({ title: '', course: '', start: '', end: '', readerIds: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!settingsLoading && !s) setS(settings ?? { enabled: false, duplicateWindowMinutes: 10 }); }, [settings, settingsLoading, s]);
  const toggleReader = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="space-y-4">
      {error && <ErrorBox message={error} />}
      {msg && <Notice tone="green">{msg}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Settings</h2>
          {!s ? <Spinner /> : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
                Accept check-ins from readers <Badge tone={s.enabled ? 'green' : 'slate'}>{s.enabled ? 'on' : 'off'}</Badge>
              </label>
              <p className="text-xs text-slate-500">While off, every scan is refused (&quot;Attendance is off&quot; on the kiosk) and nothing is logged.</p>
              <Field label="Count a repeat scan as a duplicate within (minutes)" htmlFor="att-window" hint="A student is recorded once per session; later scans only appear in the scan log.">
                <input id="att-window" type="number" min={1} max={120} className="input w-28" value={s.duplicateWindowMinutes ?? 10} onChange={(e) => setS({ ...s, duplicateWindowMinutes: Number(e.target.value) || 10 })} />
              </Field>
              <Button busy={busy} onClick={async () => {
                setBusy(true); setError(null); setMsg(null);
                try { await saveAttendanceSettings({ ...s, status: s.enabled ? 'enabled' : 'disabled' }); setMsg('Settings saved.'); onSettingsSaved(); }
                catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
              }}>Save settings</Button>
            </>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">New session</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!f.title.trim() || !f.start || !f.end) { setError('A session needs a title, a start and an end.'); return; }
            if (new Date(f.end) <= new Date(f.start)) { setError('The session must end after it starts.'); return; }
            setError(null); setMsg(null);
            try {
              await saveAttendanceSession({ title: f.title, course: f.course, startsAt: new Date(f.start), endsAt: new Date(f.end), readerIds: f.readerIds });
              setF({ title: '', course: '', start: '', end: '', readerIds: [] }); sessions.reload(); setMsg('Session added.');
            } catch (err) { setError(friendlyError(err)); }
          }}>
            <Field label="Title" htmlFor="s-title"><input id="s-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="CS301 lecture" /></Field>
            <Field label="Course / group" htmlFor="s-course"><input id="s-course" className="input" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} /></Field>
            <Field label="Starts" htmlFor="s-start"><input id="s-start" type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Ends" htmlFor="s-end"><input id="s-end" type="datetime-local" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Readers that record this session</legend>
              {readersError ? <p className="text-sm text-red-700">{readersError}</p> : readers.length === 0 ? (
                <p className="text-sm text-slate-500">No reader keys yet: Dashboard &gt; Kiosk &gt; Device keys, tick &quot;Submit RFID check-ins&quot;.</p>
              ) : readers.map((r) => (
                <label key={r.id} className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.readerIds.includes(r.id)} onChange={() => setF({ ...f, readerIds: toggleReader(f.readerIds, r.id) })} />
                  {r.name}
                </label>
              ))}
            </fieldset>
            <div className="sm:col-span-2"><Button type="submit" size="sm" variant="secondary">Add session</Button></div>
          </form>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Sessions</h2>
        {sessions.loading ? <Spinner /> : sessions.error ? <ErrorBox message={sessions.error} onRetry={sessions.reload} /> : sessions.data!.length === 0 ? (
          <EmptyState title="No sessions yet" body="A scan is recorded only during a session that its reader is assigned to." />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {sessions.data!.map((x) => {
              const now = new Date();
              const open = x.startsAt <= now && now <= x.endsAt;
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <span className="font-medium text-slate-900">{x.title}</span>
                  {open && <Badge tone="green">Open now</Badge>}
                  <span className="text-slate-500">{formatDateTime(x.startsAt)} - {formatDateTime(x.endsAt)}</span>
                  <span className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
                    Readers: {(x.readerIds ?? []).length ? (x.readerIds ?? []).map((id) => readerNames.get(id) ?? id).join(', ') : 'none'}
                  </span>
                  {readers.length > 0 && (
                    <details className="w-full text-sm">
                      <summary className="cursor-pointer text-brand-700">Change readers</summary>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {readers.map((r) => (
                          <label key={r.id} className="inline-flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={(x.readerIds ?? []).includes(r.id)}
                              onChange={async () => {
                                try { await setSessionReaders(x.id, toggleReader(x.readerIds ?? [], r.id)); sessions.reload(); }
                                catch (e) { setError(friendlyError(e)); }
                              }} />
                            {r.name}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
