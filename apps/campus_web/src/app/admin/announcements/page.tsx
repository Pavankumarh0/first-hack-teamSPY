'use client';

import { useMemo, useState } from 'react';
import { Archive, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, Notice, PageHeader, SampleBadge, Tabs, type Tone } from '@/components/ui';
import { adminListAnnouncements, deleteAnnouncement, saveAnnouncement } from '@/lib/admin-data';
import type { Announcement } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { pushToApps } from '@/lib/push';
import { useAsync } from '@/lib/useAsync';

const TONE: Record<string, Tone> = { draft: 'slate', published: 'green', archived: 'amber' };

export default function AnnouncementsAdmin() {
  const { profile, idToken } = useAuth();
  const list = useAsync(() => adminListAnnouncements(), []);
  const [tab, setTab] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const shown = useMemo(() => (list.data ?? [])
    .filter((a) => tab === 'all' || a.status === tab)
    .filter((a) => !q || `${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase())), [list.data, tab, q]);

  async function quick(a: Announcement, status: string) {
    setError(null); setMsg(null);
    try {
      const { notificationId } = await saveAnnouncement(a.id, { ...a, status }, profile!.id, a);
      list.reload();
      setMsg(await pushToApps(idToken, notificationId));
    }
    catch (e) { setError(friendlyError(e)); }
  }

  return (
    <div>
      <PageHeader title="Announcements and notices" subtitle="Official information. Published items appear on the website, in the app and on the kiosk, and notify students."
        actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New announcement</Button>} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Drafts' }, { value: 'archived', label: 'Archived' }]} />
        <input className="input sm:ml-auto sm:w-64" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search announcements" />
      </div>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {msg && <div className="mb-4"><Notice tone={msg.startsWith('Saved, but') ? 'amber' : 'green'}>{msg}</Notice></div>}
      {list.loading ? <ListSkeleton count={3} rows={1} /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> :
        shown.length === 0 ? <EmptyState title="Nothing here" action={<Button onClick={() => setEditing('new')}>Write one</Button>} /> : (
          <ul className="card divide-y divide-slate-100">
            {shown.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[a.status]}>{a.status}</Badge>
                    <Badge>{a.category}</Badge>
                    {a.pinned && <Badge tone="amber">Pinned</Badge>}
                    <SampleBadge show={a.isSample} />
                  </div>
                  <p className="mt-1 font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.publishedAt ? `Published ${formatDate(a.publishedAt)}` : 'Not published'} · Updated {formatDate(a.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {a.status !== 'published' && <Button size="sm" variant="secondary" onClick={() => quick(a, 'published')}><Send className="h-4 w-4" /> Publish</Button>}
                  {a.status === 'published' && <Button size="sm" variant="secondary" onClick={() => quick(a, 'archived')}><Archive className="h-4 w-4" /> Archive</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm('Delete this announcement permanently?')) { await deleteAnnouncement(a.id); list.reload(); } }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      <Editor value={editing} onClose={() => setEditing(null)} onSaved={async (notificationId) => { setEditing(null); list.reload(); setMsg(await pushToApps(idToken, notificationId)); }} uid={profile!.id} />
    </div>
  );
}

function Editor({ value, onClose, onSaved, uid }: { value: Announcement | 'new' | null; onClose: () => void; onSaved: (notificationId: string | null) => void; uid: string }) {
  const existing = value && value !== 'new' ? value : null;
  const [f, setF] = useState({ title: '', body: '', category: 'announcement', pinned: false, status: 'draft' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<unknown>(null);
  if (value !== key) {
    setKey(value);
    setError(null);
    setF(existing ? { title: existing.title, body: existing.body, category: existing.category, pinned: existing.pinned, status: existing.status } : { title: '', body: '', category: 'announcement', pinned: false, status: 'draft' });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.body.trim()) { setError('A title and text are required.'); return; }
    setBusy(true); setError(null);
    try { const { notificationId } = await saveAnnouncement(existing?.id ?? null, f, uid, existing); onSaved(notificationId); }
    catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!value} onClose={onClose} title={existing ? 'Edit announcement' : 'New announcement'} wide>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <Field label="Title" htmlFor="a-title" required><input id="a-title" className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Text" htmlFor="a-body" required hint="Plain text. The kiosk shows the first 280 characters."><textarea id="a-body" className="input" rows={7} maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type" htmlFor="a-cat"><select id="a-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="announcement">Announcement</option><option value="notice">Notice</option></select></Field>
          <Field label="Status" htmlFor="a-status"><select id="a-status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
          <label className="flex items-center gap-2 pt-7 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to the top</label>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
