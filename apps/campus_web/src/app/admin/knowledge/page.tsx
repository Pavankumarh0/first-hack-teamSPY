'use client';

import { useMemo, useState } from 'react';
import { Archive, FileUp, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, PageHeader, Tabs, type Tone } from '@/components/ui';
import { adminListCampusKnowledge, deleteCampusKnowledge, saveCampusKnowledge } from '@/lib/admin-data';
import type { CampusKnowledge } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

type Status = CampusKnowledge['status'];
const TONE: Record<Status, Tone> = { draft: 'slate', published: 'green', archived: 'amber' };

export default function CampusKnowledgeAdmin() {
  const { profile } = useAuth();
  const list = useAsync(() => adminListCampusKnowledge(), []);
  const [tab, setTab] = useState<'all' | Status>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CampusKnowledge | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => (list.data ?? [])
    .filter((item) => tab === 'all' || item.status === tab)
    .filter((item) => !query || `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase())),
  [list.data, tab, query]);

  async function setStatus(item: CampusKnowledge, status: Status) {
    setError(null);
    try {
      const { id: _id, updatedAt: _updated, createdBy: _creator, ...value } = item;
      await saveCampusKnowledge(item.id, { ...value, status }, profile!.id, item);
      list.reload();
    } catch (e) { setError(friendlyError(e)); }
  }

  return <div>
    <PageHeader title="Campus knowledge" subtitle="Curated facts, FAQs, policies and procedures used by the kiosk. Only published public entries are searchable."
      actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add knowledge</Button>} />
    <p className="mb-4 rounded-2xl border-2 border-ink/15 bg-white/70 p-4 text-sm text-slate-700">
      Publish verified text only. Kiosk search reads published public entries and refreshes its in-memory index within about a minute. Do not add private student information.
    </p>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Drafts' }, { value: 'archived', label: 'Archived' }]} />
      <input className="input sm:ml-auto sm:w-64" placeholder="Search knowledge..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search campus knowledge" />
    </div>
    {error && <div className="mb-4"><ErrorBox message={error} /></div>}
    {list.loading ? <ListSkeleton count={3} rows={1} /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> :
      shown.length === 0 ? <EmptyState title="No campus knowledge yet" action={<Button onClick={() => setEditing('new')}>Add an entry</Button>} /> :
      <ul className="card divide-y divide-slate-100">
        {shown.map((item) => <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[item.status]}>{item.status}</Badge>
              <Badge>{item.sourceType}</Badge>
              <Badge tone={item.access === 'public' ? 'green' : 'amber'}>{item.access}</Badge>
            </div>
            <p className="mt-1 font-medium text-slate-900">{item.title}</p>
            <p className="line-clamp-2 text-sm text-slate-600">{item.body}</p>
            <p className="text-xs text-slate-500">Updated {formatDate(item.updatedAt)} · Source ID {item.id}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {item.status !== 'published' && item.access === 'public' && <Button size="sm" variant="secondary" onClick={() => setStatus(item, 'published')}><Send className="h-4 w-4" /> Publish</Button>}
            {item.status === 'published' && <Button size="sm" variant="secondary" onClick={() => setStatus(item, 'archived')}><Archive className="h-4 w-4" /> Archive</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEditing(item)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (confirm('Delete this knowledge entry?')) { await deleteCampusKnowledge(item.id); list.reload(); } }} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </li>)}
      </ul>}
    <Editor value={editing} uid={profile!.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />
  </div>;
}

function Editor({ value, uid, onClose, onSaved }: { value: CampusKnowledge | 'new' | null; uid: string; onClose: () => void; onSaved: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const [f, setF] = useState({ title: '', body: '', sourceType: 'faq' as CampusKnowledge['sourceType'], status: 'draft' as Status, access: 'public' as CampusKnowledge['access'] });
  const [key, setKey] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (value !== key) {
    setKey(value);
    setError(null);
    setF(existing ? { title: existing.title, body: existing.body, sourceType: existing.sourceType, status: existing.status, access: existing.access }
      : { title: '', body: '', sourceType: 'faq', status: 'draft', access: 'public' });
  }

  async function importText(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 20000) {
      setError('Choose a .md or .txt file up to 20 KB.');
      return;
    }
    const body = await file.text();
    setF((previous) => ({ ...previous, title: previous.title || file.name.replace(/\.(md|txt)$/i, ''), body }));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.body.trim()) { setError('A title and text are required.'); return; }
    if (f.status === 'published' && f.access !== 'public') { setError('Restricted entries cannot be published to kiosk search.'); return; }
    setBusy(true); setError(null);
    try { await saveCampusKnowledge(existing?.id ?? null, f, uid, existing); onSaved(); }
    catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  return <Modal open={!!value} onClose={onClose} title={existing ? 'Edit campus knowledge' : 'Add campus knowledge'} wide>
    <form onSubmit={save} className="space-y-4">
      {error && <ErrorBox message={error} />}
      <Field label="Title" htmlFor="knowledge-title" required><input id="knowledge-title" className="input" maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Text" htmlFor="knowledge-body" required hint="Verified plain text, up to 20,000 characters. The kiosk re-indexes published entries automatically.">
        <textarea id="knowledge-body" className="input" rows={10} maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </Field>
      {!existing && <Field label="Import a text file" htmlFor="knowledge-file" hint="Markdown and TXT files are imported into this entry; this does not store the original file.">
        <input id="knowledge-file" type="file" accept=".md,.txt,text/markdown,text/plain" className="block w-full text-sm" onChange={(e) => void importText(e.target.files?.[0])} />
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600"><FileUp className="h-3.5 w-3.5" /> .md / .txt only; PDF upload is not supported.</span>
      </Field>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Source type" htmlFor="knowledge-type"><select id="knowledge-type" className="input" value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value as CampusKnowledge['sourceType'] })}>
          <option value="faq">FAQ</option><option value="handbook">Handbook text</option><option value="policy">Policy</option><option value="procedure">Procedure</option><option value="general">General</option>
        </select></Field>
        <Field label="Status" htmlFor="knowledge-status"><select id="knowledge-status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
          <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select></Field>
        <Field label="Access" htmlFor="knowledge-access"><select id="knowledge-access" className="input" value={f.access} onChange={(e) => setF({ ...f, access: e.target.value as CampusKnowledge['access'] })}>
          <option value="public">Public</option><option value="restricted">Restricted</option>
        </select></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save</Button></div>
    </form>
  </Modal>;
}

