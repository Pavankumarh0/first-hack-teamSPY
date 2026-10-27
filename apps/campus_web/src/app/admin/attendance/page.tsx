'use client';

import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorBox, Field, Notice, PageHeader, Spinner } from '@/components/ui';
import {
  getAttendanceSettings, listAttendanceRecords, listAttendanceSessions, saveAttendanceSession, saveAttendanceSettings,
  type AttendanceSettings,
} from '@/lib/admin-data';
import { friendlyError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

export default function AttendanceAdmin() {
  const settings = useAsync(() => getAttendanceSettings(), []);
  const sessions = useAsync(() => listAttendanceSessions(), []);
  const [s, setS] = useState<AttendanceSettings | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const records = useAsync(() => (selected ? listAttendanceRecords(selected) : Promise.resolve([])), [selected]);
  const [f, setF] = useState({ title: '', course: '', start: '', end: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (settings.data !== undefined && !s) setS(settings.data ?? { enabled: false, duplicateWindowMinutes: 10 }); }, [settings.data, s]);

  return (
    <div>
      <PageHeader title="RFID attendance" subtitle="Prepared for a future phase." />
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <Fingerprint className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Status: pending hardware integration</p>
          <p className="mt-1">
            No RFID readers are installed and none are connected to this platform. The data model, security rules, admin
            views and the check-in API (<code>POST /api/attendance/v1/scan</code>) are in place, but no card can be scanned yet and
            no attendance shown here comes from a real reader. See <code>docs/RFID_INTEGRATION.md</code>.
          </p>
        </div>
      </div>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {msg && <div className="mb-4"><Notice tone="green">{msg}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Settings</h2>
          {!s ? <Spinner /> : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
                Accept check-ins from readers <Badge tone={s.enabled ? 'green' : 'slate'}>{s.enabled ? 'on' : 'off'}</Badge>
              </label>
              {s.enabled && <Notice tone="amber">Only switch this on once readers are installed, keyed (Kiosk &gt; Device keys, &quot;RFID check-ins&quot;) and cards registered. RFID_UID_HMAC_SECRET must be set on the server.</Notice>}
              <Field label="Ignore repeat scans within (minutes)" htmlFor="att-window" hint="A second scan of the same card in the same session is logged as a duplicate, never a second record.">
                <input id="att-window" type="number" min={1} max={120} className="input w-28" value={s.duplicateWindowMinutes ?? 10} onChange={(e) => setS({ ...s, duplicateWindowMinutes: Number(e.target.value) || 10 })} />
              </Field>
              <Button busy={busy} onClick={async () => {
                setBusy(true); setError(null); setMsg(null);
                try { await saveAttendanceSettings({ ...s, status: s.enabled ? 'enabled' : 'pending_hardware' }); setMsg('Settings saved.'); }
                catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
              }}>Save settings</Button>
            </>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Sessions</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!f.title.trim() || !f.start || !f.end) { setError('A session needs a title, a start and an end.'); return; }
            setError(null);
            try { await saveAttendanceSession({ title: f.title, course: f.course, startsAt: new Date(f.start), endsAt: new Date(f.end) }); setF({ title: '', course: '', start: '', end: '' }); sessions.reload(); }
            catch (err) { setError(friendlyError(err)); }
          }}>
            <Field label="Title" htmlFor="s-title"><input id="s-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="CS301 lecture" /></Field>
            <Field label="Course / group" htmlFor="s-course"><input id="s-course" className="input" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} /></Field>
            <Field label="Starts" htmlFor="s-start"><input id="s-start" type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Ends" htmlFor="s-end"><input id="s-end" type="datetime-local" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button type="submit" size="sm" variant="secondary">Add session</Button></div>
          </form>
          {sessions.loading ? <Spinner /> : sessions.error ? <ErrorBox message={sessions.error} /> : sessions.data!.length === 0 ? <p className="text-sm text-slate-500">No sessions yet.</p> : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {sessions.data!.map((x) => (
                <li key={x.id}><button onClick={() => setSelected(x.id)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span className="font-medium text-slate-900">{x.title}</span> <span className="text-slate-500">· {formatDateTime(x.startsAt)}</span>
                </button></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold text-slate-900">Attendance records</h2>
        {!selected ? <EmptyState title="Choose a session" body="Records appear here once readers are installed and students check in." /> :
          records.loading ? <Spinner /> : records.error ? <ErrorBox message={records.error} /> : records.data!.length === 0 ? (
            <EmptyState title="No check-ins" body="Nothing has been recorded for this session. RFID scanning is not live yet." />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Check-in</th><th className="px-4 py-2">Reader</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{records.data!.map((r) => <tr key={r.id}><td className="px-4 py-2 font-mono text-xs">{r.studentId}</td><td className="px-4 py-2">{formatDateTime(r.checkInAt)}</td><td className="px-4 py-2">{r.readerId}</td></tr>)}</tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}
