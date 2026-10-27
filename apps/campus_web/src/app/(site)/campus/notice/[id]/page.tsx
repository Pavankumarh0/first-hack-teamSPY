'use client';

import { useParams } from 'next/navigation';
import { DestinationFrame, DestinationLoading, UnknownDestination } from '@/components/Destination';
import { OfficialBadge } from '@/components/cards';
import { Badge, Notice, SampleBadge } from '@/components/ui';
import { getAnnouncement } from '@/lib/data';
import { isValidId } from '@/lib/deeplinks';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

export default function NoticePage() {
  const { id } = useParams<{ id: string }>();
  const valid = isValidId(id);
  const data = useAsync(() => (valid ? getAnnouncement(id) : Promise.resolve(null)), [id]);

  if (!valid) return <UnknownDestination what="notice" />;
  if (data.loading) return <DestinationLoading />;
  if (!data.error && !data.data) return <UnknownDestination what="notice" />;
  const a = data.data;
  return (
    <DestinationFrame link={{ type: 'notice', id }} error={data.error} onRetry={data.reload}>
      {a && (
        <article className="card p-6">
          {a.status === 'archived' && <div className="mb-4"><Notice tone="amber">This notice has been archived and may be out of date.</Notice></div>}
          <div className="flex flex-wrap gap-2">
            <OfficialBadge />
            <Badge tone={a.category === 'notice' ? 'saffron' : 'blue'}>{a.category === 'notice' ? 'Notice' : 'Announcement'}</Badge>
            <SampleBadge show={a.isSample} />
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{a.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Published {formatDate(a.publishedAt)}</p>
          <p className="prose-text mt-5">{a.body}</p>
        </article>
      )}
    </DestinationFrame>
  );
}
