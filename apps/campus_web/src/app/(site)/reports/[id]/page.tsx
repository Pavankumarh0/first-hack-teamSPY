'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { RequireMember } from '@/components/RequireMember';
import { ReportProgress, ReportStatusBadge } from '@/components/ReportStatus';
import { ReportTimeline } from '@/components/ReportTimeline';
import { Button, CardSkeleton, ErrorBox, Field, PageHeader } from '@/components/ui';
import { UnknownDestination } from '@/components/Destination';
import { REPORT_CATEGORY_LABELS, label } from '@/lib/constants';
import { addReporterComment, getReport, listReportUpdates, type UserProfile } from '@/lib/data';
import { fb } from '@/lib/firebase/client';
import { friendlyError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { isValidId } from '@/lib/deeplinks';
import { useAsync } from '@/lib/useAsync';

export default function ReportPage() {
  return <RequireMember why="Reports are visible to the student who filed them and to campus staff.">{(p) => <Report profile={p} />}</RequireMember>;
}

function Report({ profile }: { profile: UserProfile }) {
  const { id } = useParams<{ id: string }>();
  const data = useAsync(async () => {
    if (!isValidId(id)) return null;
    const report = await getReport(id);
    return report ? { report, updates: await listReportUpdates(id) } : null;
  }, [id]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = data.data?.report.imagePath;
    if (path) getDownloadURL(ref(fb().storage, path)).then(setPhotoUrl).catch(() => setPhotoUrl(null));
  }, [data.data?.report.imagePath]);

  if (data.loading) return <CardSkeleton rows={6} />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data) return <UnknownDestination what="report" />;
  const { report, updates } = data.data;
  const mine = report.reporterId === profile.id;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true); setError(null);
    try {
      await addReporterComment(report.id, profile, comment);
      setComment('');
      data.reload();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={label(REPORT_CATEGORY_LABELS, report.category)} title={report.title}
        subtitle={<>Reported {formatDateTime(report.createdAt)} · {[report.buildingName, report.locationName, report.locationDetail].filter(Boolean).join(', ') || 'No location given'}</>}
        actions={<ReportStatusBadge status={report.status} />} />
      <div className="space-y-6">
        <div className="card p-5"><ReportProgress status={report.status} /></div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Description</h2>
          <p className="prose-text mt-2">{report.description}</p>
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Photo attached to the report" className="mt-4 max-h-96 rounded-lg border border-slate-200" />
          )}
          {report.assigneeName && <p className="mt-4 text-sm text-slate-600">Assigned to <strong>{report.assigneeName}</strong></p>}
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">History</h2>
          <ReportTimeline createdAt={report.createdAt} updates={updates} />
          {mine && (
            <form onSubmit={send} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              {error && <ErrorBox message={error} />}
              <Field label="Add a note for staff" htmlFor="rep-note">
                <textarea id="rep-note" className="input" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
              <Button type="submit" size="sm" busy={busy} disabled={!comment.trim()}>Send note</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
