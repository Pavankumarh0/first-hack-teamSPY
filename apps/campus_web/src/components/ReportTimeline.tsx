import { ArrowRight, MessageCircle, UserCheck, Wrench } from 'lucide-react';
import { REPORT_STATUS_LABELS, type ReportStatus } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { ReportUpdate } from '@/lib/data';

export function ReportTimeline({ createdAt, updates }: { createdAt: Date | null; updates: ReportUpdate[] }) {
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      <Item icon={<Wrench className="h-3.5 w-3.5" />} title="Report submitted" at={createdAt} />
      {updates.map((u) => {
        const moved = u.fromStatus && u.toStatus && u.fromStatus !== u.toStatus;
        const title = u.type === 'assignment'
          ? 'Assigned to staff'
          : moved
            ? <span className="inline-flex flex-wrap items-center gap-1">{REPORT_STATUS_LABELS[u.fromStatus as ReportStatus]} <ArrowRight className="h-3.5 w-3.5" /> {REPORT_STATUS_LABELS[u.toStatus as ReportStatus]}</span>
            : 'Comment';
        return (
          <Item key={u.id} icon={u.type === 'assignment' ? <UserCheck className="h-3.5 w-3.5" /> : u.type === 'comment' ? <MessageCircle className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
            title={title} at={u.at} by={u.byName} message={u.message} />
        );
      })}
    </ol>
  );
}

function Item({ icon, title, at, by, message }: { icon: React.ReactNode; title: React.ReactNode; at: Date | null; by?: string; message?: string }) {
  return (
    <li className="relative">
      <span className="absolute -left-[34px] grid h-5 w-5 place-items-center rounded-full bg-white text-brand-700 ring-2 ring-brand-200">{icon}</span>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="text-xs text-slate-500">{formatDateTime(at)}{by ? ` · ${by}` : ''}</p>
      {message && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{message}</p>}
    </li>
  );
}
