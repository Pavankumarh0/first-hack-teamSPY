'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Button, EmptyState, ErrorBox, Field, ListSkeleton, Modal, Notice, PageHeader, SampleBadge } from '@/components/ui';
import { addClubManager, deleteClub, listManagedClubs, listUsers, removeClubManager, saveClub, slugify, updateClubAsManager } from '@/lib/admin-data';
import { listPlaces, type Club } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';

export default function ClubsAdmin() {
  const { profile, isAdmin } = useAuth();
  const clubs = useAsync(() => listManagedClubs(profile!.id, isAdmin), [profile?.id, isAdmin]);
  const managers = useAsync(() => (isAdmin ? listUsers('club_manager', 200).then((p) => p.items) : Promise.resolve([])), [isAdmin]);
  const [editing, setEditing] = useState<Club | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (uid: string) => managers.data?.find((m) => m.id === uid)?.username ?? uid.slice(0, 8);

  return (
    <div>
      <PageHeader title="Clubs" subtitle={isAdmin ? 'Club directory and who may publish events for each club.' : 'The clubs you manage.'}
        actions={isAdmin ? <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New club</Button> : undefined} />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {clubs.loading ? <ListSkeleton count={3} /> : clubs.error ? <ErrorBox message={clubs.error} onRetry={clubs.reload} /> :
        clubs.data!.length === 0 ? <EmptyState title="No clubs" /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {clubs.data!.map((c) => (
              <div key={c.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">{!c.published && <Badge>Hidden</Badge>}{c.category && <Badge tone="violet">{c.category}</Badge>}<SampleBadge show={c.isSample} /></div>
                    <h2 className="mt-1 font-semibold text-slate-900">{c.name}</h2>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    {isAdmin && <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm(`Delete ${c.name}? Its events stay but lose their club page.`)) { await deleteClub(c.id); clubs.reload(); } }}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
                {c.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.description}</p>}
                {isAdmin && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="label-caps text-slate-600">Managers</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {c.managerIds.length === 0 && <li className="text-sm text-slate-500">None yet</li>}
                      {c.managerIds.map((m) => (
                        <li key={m}><Badge tone="brand">@{name(m)}<button aria-label="Remove manager" onClick={async () => { await removeClubManager(c.id, m); clubs.reload(); }}><UserMinus className="h-3 w-3" /></button></Badge></li>
                      ))}
                    </ul>
                    <select className="input mt-3" value="" aria-label="Add a manager" onChange={async (e) => {
                      if (!e.target.value) return;
                      setError(null);
                      try { await addClubManager(c.id, e.target.value); clubs.reload(); } catch (err) { setError(friendlyError(err)); }
                    }}>
                      <option value="">Add a manager (accounts with the club manager role)...</option>
                      {managers.data?.filter((m) => !c.managerIds.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.displayName} (@{m.username})</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      <ClubEditor value={editing} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); clubs.reload(); }} />
    </div>
  );
}

function ClubEditor({ value, isAdmin, onClose, onSaved }: { value: Club | 'new' | null; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const places = useAsync(() => listPlaces(), []);
  const [f, setF] = useState({ id: '', name: '', category: '', description: '', contact: '', homeLocationId: '', published: true });
  const [key, setKey] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (value !== key) {
    setKey(value); setError(null);
    setF(existing ? { id: existing.id, name: existing.name, category: existing.category ?? '', description: existing.description ?? '', contact: existing.contact ?? '', homeLocationId: existing.homeLocationId ?? '', published: existing.published }
      : { id: '', name: '', category: '', description: '', contact: '', homeLocationId: '', published: true });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (!isAdmin && existing) await updateClubAsManager(existing.id, { description: f.description, contact: f.contact });
      else {
        if (!f.name.trim()) throw new Error('The club needs a name.');
        const id = existing?.id ?? (f.id || slugify(f.name));
        await saveClub(id, { name: f.name.trim(), category: f.category.trim(), description: f.description.trim(), contact: f.contact.trim(),
          homeLocationId: f.homeLocationId || null, published: f.published, managerIds: existing?.managerIds ?? [], isSample: existing?.isSample ?? false }, !existing);
      }
      onSaved();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!value} onClose={onClose} title={existing ? `Edit ${existing.name}` : 'New club'}>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorBox message={error} />}
        {!isAdmin && <Notice>As a club manager you can edit the description and contact. Ask an administrator for other changes.</Notice>}
        <Field label="Name" htmlFor="c-name" required><input id="c-name" className="input" maxLength={80} value={f.name} disabled={!isAdmin} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {!existing && <Field label="Page id" htmlFor="c-id" hint={`Used in links and QR codes: /campus/club/${f.id || slugify(f.name || 'name')}`}><input id="c-id" className="input" value={f.id} onChange={(e) => setF({ ...f, id: slugify(e.target.value) })} placeholder={slugify(f.name || '')} /></Field>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="c-cat"><input id="c-cat" className="input" value={f.category} disabled={!isAdmin} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="technical, cultural..." /></Field>
          <Field label="Meets at" htmlFor="c-home"><select id="c-home" className="input" value={f.homeLocationId} disabled={!isAdmin} onChange={(e) => setF({ ...f, homeLocationId: e.target.value })}><option value="">-</option>{places.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <Field label="Description" htmlFor="c-desc"><textarea id="c-desc" className="input" rows={4} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Contact" htmlFor="c-contact"><input id="c-contact" className="input" maxLength={200} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Listed publicly</label>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
