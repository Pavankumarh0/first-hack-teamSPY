'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Flag, MapPin, ThumbsUp, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { OpinionBadge } from '@/components/cards';
import { UnknownDestination } from '@/components/Destination';
import { Badge, Button, CardSkeleton, EmptyState, ErrorBox, Field, Modal, Notice, SampleBadge, cx } from '@/components/ui';
import { POST_CATEGORY_LABELS, label } from '@/lib/constants';
import {
  addComment, deleteOwnComment, deleteOwnPost, flagContent, getPost, hasMarkedHelpful, listComments, setHelpful,
} from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import { isValidId } from '@/lib/deeplinks';
import { useAsync } from '@/lib/useAsync';

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, active, profile } = useAuth();
  const member = status === 'signedIn' && active && !!profile;
  const data = useAsync(async () => {
    if (!isValidId(id) || status === 'loading') return status === 'loading' ? new Promise<never>(() => {}) : null;
    const post = await getPost(id);
    if (!post) return null;
    return { post, comments: await listComments(id) };
  }, [id, status]);
  const [helpful, setHelpfulState] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flag, setFlag] = useState<{ type: 'post' | 'comment'; path: string } | null>(null);

  useEffect(() => {
    if (member && profile && data.data?.post) hasMarkedHelpful(id, profile.id).then(setHelpfulState).catch(() => {});
  }, [member, profile, id, data.data?.post]);

  if (data.loading) return <div className="mx-auto max-w-3xl space-y-4"><CardSkeleton rows={5} /><CardSkeleton rows={2} /></div>;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data) return <UnknownDestination what="discussion" />;
  const { post, comments } = data.data;
  const mine = profile?.id === post.authorId;

  async function toggleHelpful() {
    if (!profile || helpful === null) return;
    setError(null);
    try {
      await setHelpful(post.id, profile.id, !helpful);
      setHelpfulState(!helpful);
      data.setData({ post: { ...post, helpfulCount: post.helpfulCount + (helpful ? -1 : 1) }, comments });
    } catch (err) { setError(friendlyError(err)); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !comment.trim()) return;
    setBusy(true); setError(null);
    try { await addComment(post.id, profile, comment); setComment(''); data.reload(); }
    catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/community" className="text-sm font-medium text-brand-700 hover:underline">&larr; All discussions</Link>
      {post.status !== 'visible' && <Notice tone="amber">This post is {post.status} and only visible to you{post.moderationNote ? `: ${post.moderationNote}` : '.'}</Notice>}
      <article className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <OpinionBadge />
          <Badge>{label(POST_CATEGORY_LABELS, post.category)}</Badge>
          {post.locationName && post.locationId && <Link href={`/campus/location/${post.locationId}`}><Badge tone="blue"><MapPin className="h-3 w-3" />{post.locationName}</Badge></Link>}
          <SampleBadge show={post.isSample} />
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{post.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{post.authorDisplayName} <span className="text-slate-400">@{post.authorUsername}</span> · {formatDateTime(post.createdAt)}</p>
        <p className="prose-text mt-4">{post.body}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <Button variant={helpful ? 'primary' : 'secondary'} size="sm" disabled={!member || mine || helpful === null} onClick={toggleHelpful}
            title={mine ? 'You cannot mark your own post' : member ? undefined : 'Sign in to vote'}>
            <ThumbsUp className="h-4 w-4" /> Helpful · {post.helpfulCount}
          </Button>
          {member && !mine && <Button variant="ghost" size="sm" onClick={() => setFlag({ type: 'post', path: `posts/${post.id}` })}><Flag className="h-4 w-4" /> Report</Button>}
          {mine && post.status === 'visible' && (
            <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete this post?')) { await deleteOwnPost(post.id); router.replace('/community'); } }}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </article>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">{post.commentCount} {post.commentCount === 1 ? 'reply' : 'replies'}</h2>
        {error && <div className="mb-3"><ErrorBox message={error} /></div>}
        {comments.length === 0 ? <EmptyState title="No replies yet" body={member ? 'Be the first to help.' : undefined} /> : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm"><span className="font-medium text-slate-900">{c.authorDisplayName}</span> <span className="text-slate-400">@{c.authorUsername}</span> <span className="text-slate-400">· {timeAgo(c.createdAt)}</span></p>
                  <div className="flex shrink-0 gap-1">
                    {member && profile?.id !== c.authorId && <button onClick={() => setFlag({ type: 'comment', path: `posts/${post.id}/comments/${c.id}` })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Report reply"><Flag className="h-3.5 w-3.5" /></button>}
                    {profile?.id === c.authorId && <button onClick={async () => { await deleteOwnComment(post.id, c.id); data.reload(); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Delete reply"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {member ? (
          <form onSubmit={send} className={cx('card mt-4 space-y-3 p-4', post.status !== 'visible' && 'hidden')}>
            <Field label="Your reply" htmlFor="reply"><textarea id="reply" className="input" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
            <Button type="submit" size="sm" busy={busy} disabled={!comment.trim()}>Reply</Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-600"><Link href={`/login?next=/community/${post.id}`} className="font-medium text-brand-700 hover:underline">Sign in</Link> to reply.</p>
        )}
      </section>

      <FlagDialog target={flag} onClose={() => setFlag(null)} uid={profile?.id ?? ''} />
    </div>
  );
}

function FlagDialog({ target, onClose, uid }: { target: { type: 'post' | 'comment'; path: string } | null; onClose: () => void; uid: string }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setReason(''); setDone(false); setError(null); }, [target]);
  return (
    <Modal open={!!target} onClose={onClose} title="Report to moderators">
      {done ? <Notice tone="green">Thanks. A moderator will review it.</Notice> : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!target || !reason.trim()) return;
          setBusy(true); setError(null);
          try { await flagContent(uid, target.type, target.path, reason); setDone(true); }
          catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
        }}>
          {error && <ErrorBox message={error} />}
          <Field label="What is wrong with it?" htmlFor="flag-reason"><textarea id="flag-reason" className="input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Abusive, spam, false information..." /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={!reason.trim()}>Send report</Button></div>
        </form>
      )}
    </Modal>
  );
}
