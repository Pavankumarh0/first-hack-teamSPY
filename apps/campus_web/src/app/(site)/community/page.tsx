'use client';

import { useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { MessageSquare, PenSquare } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { PostCard } from '@/components/cards';
import { Button, EmptyState, ErrorBox, LinkButton, ListSkeleton, Notice, PageHeader, cx } from '@/components/ui';
import { POST_CATEGORY_LABELS } from '@/lib/constants';
import { listPosts, listPublicPosts, type Post } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';

export default function CommunityPage() {
  const { status, active } = useAuth();
  const member = status === 'signedIn' && active;
  const [category, setCategory] = useState<string | null>(null);
  const load = (cursor?: QueryDocumentSnapshot | null) => (member ? listPosts(category, 10, cursor) : listPublicPosts(10, cursor));
  const first = useAsync(() => (status === 'loading' ? new Promise<never>(() => {}) : load()), [member, category, status]);
  const [more, setMore] = useState<{ key: string; items: Post[]; cursor: QueryDocumentSnapshot | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = `${member}-${category}`;
  const extra = more?.key === key ? more : null;
  const next = extra ? extra.cursor : first.data?.cursor;
  const all = [...(first.data?.items ?? []), ...(extra?.items ?? [])];

  async function loadMore() {
    setBusy(true); setErr(null);
    try {
      const p = await load(next);
      setMore({ key, items: [...(extra?.items ?? []), ...p.items], cursor: p.cursor });
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Community" title="Student discussions"
        subtitle="Questions, tips and feedback from students about campus life. These are opinions, not official college information."
        actions={member ? <LinkButton href="/community/new"><PenSquare className="h-4 w-4" /> New post</LinkButton> : undefined} />

      {!member && status !== 'loading' && (
        <div className="mb-5"><Notice>You are seeing discussions approved for the public website. <a href="/login?next=/community" className="font-medium underline">Sign in</a> to see everything, post and reply.</Notice></div>
      )}

      {member && (
        <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...Object.keys(POST_CATEGORY_LABELS)].map((c) => (
            <button key={c ?? 'all'} onClick={() => setCategory(c)}
              className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset',
                category === c ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>
              {c ? POST_CATEGORY_LABELS[c] : 'All'}
            </button>
          ))}
        </div>
      )}

      {first.loading ? <ListSkeleton count={3} /> : first.error ? <ErrorBox message={first.error} onRetry={first.reload} /> :
        all.length === 0 ? <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No discussions here yet"
          body={member ? 'Ask a question or share something useful.' : 'Approved discussions will appear here.'}
          action={member ? <LinkButton href="/community/new">Start a discussion</LinkButton> : undefined} /> : (
          <>
            <div className="space-y-3">{all.map((p) => <PostCard key={p.id} p={p} />)}</div>
            {err && <div className="mt-4"><ErrorBox message={err} /></div>}
            {next && <div className="mt-6 text-center"><Button variant="secondary" busy={busy} onClick={loadMore}>Load more</Button></div>}
          </>
        )}
    </div>
  );
}
