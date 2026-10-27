import { Check } from 'lucide-react';
import { Badge, cx, type Tone } from './ui';
import { REPORT_STATUS_LABELS, type ReportStatus } from '@/lib/constants';
import { progressIndex, REPORT_FLOW } from '@/lib/reports';

const TONE: Record<ReportStatus, Tone> = {
  submitted: 'slate', acknowledged: 'blue', assigned: 'violet', in_progress: 'amber', resolved: 'green', rejected: 'red',
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={TONE[status] ?? 'slate'}>{REPORT_STATUS_LABELS[status] ?? status}</Badge>;
}

/** Submitted -> Acknowledged -> Assigned -> In progress -> Resolved. */
export function ReportProgress({ status }: { status: ReportStatus }) {
  if (status === 'rejected') return <p className="text-sm text-red-700">This report was closed without action. See the history below for the reason.</p>;
  const at = progressIndex(status);
  return (
    <ol className="flex items-center gap-1" aria-label="Report progress">
      {REPORT_FLOW.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center gap-1.5 text-center">
          <span className={cx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold',
            i < at ? 'bg-brand-600 text-white' : i === at ? 'bg-saffron-500 text-navy-900 ring-4 ring-saffron-100' : 'bg-slate-200 text-slate-500')}
            aria-current={i === at ? 'step' : undefined}>
            {i < at ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={cx('text-[11px] leading-tight', i <= at ? 'font-medium text-slate-800' : 'text-slate-500')}>{REPORT_STATUS_LABELS[s]}</span>
        </li>
      ))}
    </ol>
  );
}
