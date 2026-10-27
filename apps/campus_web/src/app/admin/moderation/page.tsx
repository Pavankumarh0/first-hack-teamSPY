'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, EyeOff, Globe, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, ListSkeleton, Notice, PageHeader, Tabs } from '@/components/ui';
import { adminListPosts, listOpenFlags, loadFlagTarget, moderateComment, moderatePost, resolveFlag, type FlagRow } from '@/lib/admin-data';
import type { Post } from '@/lib/data';
import { POST_CATEGORY_LABELS, label } from '@/lib/constants';
import { friendlyError } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

export default function Moderation() {
  const [tab, setTab] = useState<'flags' | 'visible' | 'hidden' | 'removed'>('flags');
  return (
    <div>
      <PageHeader title="Moderation" subtitle="Review flagged content, approve discussions for the public website, and hide or remove abuse." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'flags', label: 'Flagged' }, { value: 'visible', label: 'Visible posts' }, { value: 'hidden', label: 'Hidden' }, { value: 'removed', label: 'Removed' }]} />
      {tab === 'flags' ? <Flags /> : <Posts status={tab} />}
    </div>
  );
}

function Flags() {
  const { profile } = useAuth();
  const flags = useAsync(async () => {
    const rows = await listOpenFlags();
    return Promise.all(rows.map(async (f) => ({ flag: f, target: await loadFlagTarget(f.targetPath).catch(() => null) })));
  }, []);
  const [error, setError] = useState<string | null>(null);
  async function act(f: FlagRow, action: 'keep' | 'hide' | 'remove') {
    setError(null);
    try {
      if (action !== 'keep') {
        const status = action === 'hide' ? 'hidden' : 'removed';
        if (f.targetType === 'post') await moderatePost(f.targetPath.split('/')[1], profile!.id, { status, public: false, note: `Flagged: ${f.reason}` });
        else await moderateComment(f.targetPath, status);
      }
      await resolveFlag(f.id);
      flags.reload();
    } catch (e) { setError(friendlyError(e)); }
  }
  if (flags.loading) return <ListSkeleton count={3} />;
  if (flags.error) return <ErrorBox message={flags.error} onRetry={flags.reload} />;
  if (flags.data!.length === 0) return <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Nothing flagged" body="Students' reports of abusive or false content appear here." />;
  return (
    <div className="space-y-3">
      {error && <ErrorBox message={error} />}
      {flags.data!.map(({ flag, target }) => (
        <div key={flag.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="red">Flagged {flag.targetType}</Badge>
            <span className="text-slate-600">Reason: <strong>{flag.reason}</strong></span>
            <span className="text-slate-400">· {timeAgo(flag.createdAt)}</span>
          </div>
          {target ? (
            <blockquote className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
              {'title' in target && <p className="font-semibold">{String(target.title)}</p>}
              <p className="whitespace-pre-line">{String(target.body ?? '')}</p>
              <p className="mt-1 text-xs text-slate-500">@{String(target.authorUsername ?? '?')} · status {String(target.status ?? '?')}</p>
            </blockquote>
          ) : <p className="mt-3 text-sm text-slate-500">The content no longer exists.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => act(flag, 'keep')}>Keep (dismiss flag)</Button>
            <Button size="sm" variant="secondary" onClick={() => act(flag, 'hide')}><EyeOff className="h-4 w-4" /> Hide</Button>
            <Button size="sm" variant="danger" onClick={() => act(flag, 'remove')}><Trash2 className="h-4 w-4" /> Remove</Button>
            {flag.targetType === 'post' && <Link className="self-center text-sm text-brand-700 hover:underline" href={`/community/${flag.targetPath.split('/')[1]}`} target="_blank">Open</Link>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Posts({ status }: { status: string }) {
  const { profile } = useAuth();
  const posts = useAsync(() => adminListPosts(status, 50).then((p) => p.items), [status]);
  const [error, setError] = useState<string | null>(null);
  async function set(p: Post, change: { status: string; public: boolean }) {
    setError(null);
    try { await moderatePost(p.id, profile!.id, change); posts.reload(); } catch (e) { setError(friendlyError(e)); }
  }
  if (posts.loading) return <ListSkeleton count={3} />;
  if (posts.error) return <ErrorBox message={posts.error} onRetry={posts.reload} />;
  return (
    <div className="space-y-3">
      {status === 'visible' && <Notice>“Show on website” makes a discussion readable without signing in. Only approve posts that are useful and respectful; they stay labelled as student opinion.</Notice>}
      {error && <ErrorBox message={error} />}
      {posts.data!.length === 0 ? <EmptyState title="No posts" /> : posts.data!.map((p) => (
        <div key={p.id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2"><Badge>{label(POST_CATEGORY_LABELS, p.category)}</Badge>{p.public && <Badge tone="green"><Globe className="h-3 w-3" />On website</Badge>}</div>
            <Link href={`/community/${p.id}`} target="_blank" className="mt-1 block font-medium text-slate-900 hover:underline">{p.title}</Link>
            <p className="line-clamp-2 text-sm text-slate-600">{p.body}</p>
            <p className="mt-1 text-xs text-slate-500">@{p.authorUsername} · {timeAgo(p.createdAt)} · {p.helpfulCount} helpful · {p.commentCount} replies</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {status === 'visible' ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => set(p, { status: 'visible', public: !p.public })}><Globe className="h-4 w-4" /> {p.public ? 'Remove from website' : 'Show on website'}</Button>
                <Button size="sm" variant="secondary" onClick={() => set(p, { status: 'hidden', public: false })}><EyeOff className="h-4 w-4" /> Hide</Button>
                <Button size="sm" variant="danger" onClick={() => set(p, { status: 'removed', public: false })}><Trash2 className="h-4 w-4" /> Remove</Button>
              </>
            ) : <Button size="sm" variant="secondary" onClick={() => set(p, { status: 'visible', public: false })}><RotateCcw className="h-4 w-4" /> Restore</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}
