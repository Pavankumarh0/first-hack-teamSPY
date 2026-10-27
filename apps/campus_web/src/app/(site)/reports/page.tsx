'use client';

import Link from 'next/link';
import { Plus, Wrench } from 'lucide-react';
import { RequireMember } from '@/components/RequireMember';
import { ReportStatusBadge } from '@/components/ReportStatus';
import { EmptyState, ErrorBox, LinkButton, ListSkeleton, PageHeader } from '@/components/ui';
import { REPORT_CATEGORY_LABELS, label } from '@/lib/constants';
import { listMyReports } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

export default function MyReportsPage() {
  return (
    <RequireMember why="Your maintenance reports are linked to your account.">
      {(profile) => <MyReports uid={profile.id} />}
    </RequireMember>
  );
}

function MyReports({ uid }: { uid: string }) {
  const reports = useAsync(() => listMyReports(uid, 50).then((p) => p.items), [uid]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Maintenance" title="My reports" subtitle="Track what you reported and what staff have done about it."
        actions={<LinkButton href="/reports/new"><Plus className="h-4 w-4" /> New report</LinkButton>} />
      {reports.loading ? <ListSkeleton count={3} rows={1} /> : reports.error ? <ErrorBox message={reports.error} onRetry={reports.reload} /> :
        reports.data!.length === 0 ? (
          <EmptyState icon={<Wrench className="h-6 w-6" />} title="No reports yet" body="Broken fan, leaking tap, Wi-Fi down? Report it and follow the fix here."
            action={<LinkButton href="/reports/new">Report an issue</LinkButton>} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {reports.data!.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{r.title}</p>
                    <p className="text-sm text-slate-500">{label(REPORT_CATEGORY_LABELS, r.category)} · {r.locationName ?? r.buildingName ?? 'No location'} · {timeAgo(r.createdAt)}</p>
                  </div>
                  <ReportStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
