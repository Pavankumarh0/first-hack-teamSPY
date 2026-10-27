'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useAuth } from '@/components/AuthProvider';
import { ReportProgress, ReportStatusBadge } from '@/components/ReportStatus';
import { ReportTimeline } from '@/components/ReportTimeline';
import { Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, Notice, PageHeader, Spinner, Tabs, cx } from '@/components/ui';
import { C, REPORT_CATEGORY_LABELS, REPORT_STATUS_LABELS, label, type ReportStatus } from '@/lib/constants';
import { changeReport, getWorkflow, listReports, listStaff, saveWorkflow, type ReportFilter } from '@/lib/admin-data';
import { getReport, listReportUpdates, type Report } from '@/lib/data';
import { fb } from '@/lib/firebase/client';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import { DEFAULT_WORKFLOW, nextStatuses, type Workflow } from '@/lib/reports';
import { useAsync } from '@/lib/useAsync';

export default function ReportsAdminPage() {
  return <Suspense fallback={<Spinner />}><ReportsAdmin /></Suspense>;
}

function ReportsAdmin() {
  const { role, profile } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'reports' | 'workflow'>('reports');
  const [status, setStatus] = useState<string>(params.get('status') ?? 'open');
  const [mine, setMine] = useState(params.get('mine') === '1' || role === 'staff');
  const filter: ReportFilter = { status, assignedTo: mine ? profile!.id : null };
  const [page, setPage] = useState<{ items: Report[]; cursor: QueryDocumentSnapshot | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useAsync(() => listReports(filter, 25), [status, mine]);
  const workflow = useAsync(() => getWorkflow(), []);
  const openId = params.get('open');

  useEffect(() => setPage(null), [status, mine]);
  const items = [...(first.data?.items ?? []), ...(page?.items ?? [])];
  const cursor = page ? page.cursor : first.data?.cursor;

  async function more() {
    setBusy(true);
    try {
      const p = await listReports(filter, 25, cursor);
      setPage({ items: [...(page?.items ?? []), ...p.items], cursor: p.cursor });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Maintenance reports" subtitle="Acknowledge, assign and resolve what students report. Every change is recorded and the student is notified." />
      {role === 'admin' && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'reports', label: 'Reports' }, { value: 'workflow', label: 'Workflow' }]} />}
      {tab === 'workflow' ? <WorkflowEditor initial={workflow.data ?? null} onSaved={workflow.reload} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label htmlFor="rep-status" className="text-sm text-slate-600">Filter by status</label>
            <select id="rep-status" className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)} disabled={mine}>
              <option value="open">Open (not closed)</option>
              <option value="all">All</option>
              {C.reportStatuses.map((s) => <option key={s} value={s}>{REPORT_STATUS_LABELS[s as ReportStatus]}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 rounded border-slate-300" disabled={role === 'staff'} />
              Assigned to me
            </label>
            {role === 'staff' && <span className="text-xs text-slate-500">Staff can update the reports assigned to them; an administrator assigns them.</span>}
          </div>

          {first.loading ? <ListSkeleton count={4} rows={1} /> : first.error ? <ErrorBox message={first.error} onRetry={first.reload} /> :
            items.length === 0 ? <EmptyState title="No reports here" body="Nothing matches this filter." /> : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3">Report</th><th className="px-4 py-3">Where</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assignee</th><th className="px-4 py-3">Updated</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((r) => (
                      <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.replace(`/admin/reports?open=${r.id}`)}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{r.title}</p>
                          <p className="text-xs text-slate-500">{label(REPORT_CATEGORY_LABELS, r.category)} · @{r.reporterUsername}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{[r.buildingName, r.locationName].filter(Boolean).join(' · ') || r.locationDetail || '-'}</td>
                        <td className="px-4 py-3"><ReportStatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-slate-700">{r.assigneeName ?? <span className="text-slate-400">Unassigned</span>}</td>
                        <td className="px-4 py-3 text-slate-500">{timeAgo(r.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cursor && <div className="border-t border-slate-100 p-3 text-center"><Button variant="secondary" size="sm" busy={busy} onClick={more}>Load more</Button></div>}
              </div>
            )}
        </>
      )}
      <ReportDrawer id={openId} workflow={workflow.data ?? null} onClose={() => router.replace('/admin/reports')} onChanged={first.reload} />
    </div>
  );
}

function ReportDrawer({ id, workflow, onClose, onChanged }: { id: string | null; workflow: Workflow | null; onClose: () => void; onChanged: () => void }) {
  const { role, profile } = useAuth();
  const data = useAsync(async () => {
    if (!id) return null;
    const report = await getReport(id);
    return report ? { report, updates: await listReportUpdates(id) } : null;
  }, [id]);
  const staff = useAsync(() => (role === 'admin' ? listStaff() : Promise.resolve([])), [role]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [f, setF] = useState({ status: '', assignee: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = data.data?.report;

  useEffect(() => {
    setPhoto(null); setError(null);
    if (r) {
      setF({ status: r.status, assignee: r.assigneeId ?? '', message: '' });
      if (r.imagePath) getDownloadURL(ref(fb().storage, r.imagePath)).then(setPhoto).catch(() => setPhoto(null));
    }
  }, [r]);

  const options = useMemo(() => (r ? [r.status, ...nextStatuses(r.status, workflow).filter((s) => s !== r.status)] : []), [r, workflow]);
  const canEdit = r && (role === 'admin' || (role === 'staff' && r.assigneeId === profile?.id));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!r || !profile) return;
    const assignee = role === 'admin' && f.assignee !== (r.assigneeId ?? '')
      ? (f.assignee ? { uid: f.assignee, name: staff.data?.find((s) => s.id === f.assignee)?.username ?? 'staff' } : null)
      : undefined;
    if (f.status === r.status && assignee === undefined && !f.message.trim()) { setError('Change the status, the assignee, or write a note.'); return; }
    let status = f.status as ReportStatus;
    // Assigning an acknowledged report moves it to "assigned" automatically.
    if (assignee && status === 'acknowledged') status = 'assigned';
    setBusy(true); setError(null);
    try {
      await changeReport(r, { status, message: f.message, assignee, by: { uid: profile.id, name: profile.username } });
      data.reload();
      onChanged();
    } catch (err) {
      setError((err as { code?: string }).code === 'permission-denied'
        ? 'That change is not allowed: check the workflow (e.g. a report must be acknowledged before it is assigned).'
        : friendlyError(err));
    } finally { setBusy(false); }
  }

  return (
    <Modal open={!!id} onClose={onClose} title={r ? r.title : 'Report'} wide>
      {data.loading ? <Spinner /> : data.error ? <ErrorBox message={data.error} /> : !r ? <Notice tone="amber">This report does not exist or you cannot see it.</Notice> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <ReportStatusBadge status={r.status} />
            <span>{label(REPORT_CATEGORY_LABELS, r.category)}</span>·<span>@{r.reporterUsername}</span>·<span>{formatDateTime(r.createdAt)}</span>
          </div>
          <ReportProgress status={r.status} />
          <div>
            <p className="text-sm font-medium text-slate-900">{[r.buildingName, r.locationName, r.locationDetail].filter(Boolean).join(' · ') || 'No location given'}</p>
            <p className="prose-text mt-2">{r.description}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo && <img src={photo} alt="Photo attached by the student" className="mt-3 max-h-72 rounded-lg border border-slate-200" />}
          </div>
          {canEdit ? (
            <form onSubmit={save} className="space-y-3 rounded-xl bg-slate-50 p-4">
              {error && <ErrorBox message={error} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status" htmlFor="d-status">
                  <select id="d-status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                    {options.map((s) => <option key={s} value={s}>{REPORT_STATUS_LABELS[s as ReportStatus] ?? s}{s === r.status ? ' (current)' : ''}</option>)}
                  </select>
                </Field>
                {role === 'admin' && (
                  <Field label="Assign to" htmlFor="d-assignee">
                    <select id="d-assignee" className="input" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
                      <option value="">Unassigned</option>
                      {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.displayName} (@{s.username})</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <Field label="Note for the student" htmlFor="d-msg" hint="Shown in the report history and in the student's notification.">
                <textarea id="d-msg" className="input" rows={2} maxLength={1000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
              </Field>
              <Button type="submit" busy={busy}>Save update</Button>
            </form>
          ) : (
            <Notice>Only an administrator, or the staff member it is assigned to, can update this report.</Notice>
          )}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">History</h3>
            <ReportTimeline createdAt={r.createdAt} updates={data.data!.updates} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function WorkflowEditor({ initial, onSaved }: { initial: Workflow | null; onSaved: () => void }) {
  const [wf, setWf] = useState<Workflow>(initial ?? DEFAULT_WORKFLOW);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (initial) setWf(initial); }, [initial]);
  const statuses = C.reportStatuses as ReportStatus[];
  const toggle = (from: string, to: string) => setWf((w) => {
    const cur = new Set(w[from] ?? []);
    if (cur.has(to)) cur.delete(to); else cur.add(to);
    return { ...w, [from]: statuses.filter((s) => cur.has(s)) };
  });
  return (
    <div className="space-y-4">
      <Notice>Allowed moves between statuses. The Firestore rules enforce this table for every change, from any app. Ticking a move here allows it; unticking it rejects it.</Notice>
      {error && <ErrorBox message={error} />}
      {msg && <Notice tone="green">{msg}</Notice>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr><th className="px-3 py-2 text-left">From \ To</th>{statuses.map((s) => <th key={s} className="px-3 py-2">{REPORT_STATUS_LABELS[s]}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {statuses.map((from) => (
              <tr key={from}>
                <th className="px-3 py-2 text-left font-medium text-slate-800">{REPORT_STATUS_LABELS[from]}</th>
                {statuses.map((to) => (
                  <td key={to} className={cx('px-3 py-2 text-center', from === to && to !== 'assigned' && 'bg-slate-50')}>
                    <input type="checkbox" aria-label={`${from} to ${to}`} className="h-4 w-4 rounded border-slate-300"
                      checked={(wf[from] ?? []).includes(to)} onChange={() => toggle(from, to)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button busy={busy} onClick={async () => {
          setBusy(true); setError(null); setMsg(null);
          try { await saveWorkflow(wf); setMsg('Workflow saved. It applies to the next change of any report.'); onSaved(); }
          catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
        }}>Save workflow</Button>
        <Button variant="secondary" onClick={() => setWf(DEFAULT_WORKFLOW)}>Reset to default</Button>
      </div>
    </div>
  );
}
