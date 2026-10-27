'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireMember } from '@/components/RequireMember';
import { Button, ErrorBox, Field, Notice, PageHeader } from '@/components/ui';
import { C, POST_CATEGORY_LABELS } from '@/lib/constants';
import { createPost, listPlaces, type UserProfile } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';

export default function NewPostPage() {
  return <RequireMember why="Posts show your username, so you need to be signed in.">{(p) => <NewPost profile={p} />}</RequireMember>;
}

function NewPost({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const places = useAsync(() => listPlaces(), []);
  const [f, setF] = useState({ title: '', body: '', category: '', locationId: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = {
    title: f.title.trim().length < 5 ? 'Use a title of at least 5 characters.' : null,
    body: f.body.trim().length < 1 ? 'Write something.' : null,
    category: f.category ? null : 'Choose a topic.',
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true); setError(null);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      const place = places.data?.find((p) => p.id === f.locationId);
      const id = await createPost(profile, { title: f.title, body: f.body, category: f.category, locationId: place?.id ?? null, locationName: place?.name ?? null });
      router.replace(`/community/${id}`);
    } catch (err) { setError(friendlyError(err)); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Community" title="Start a discussion" />
      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
        <Notice>Your post shows <strong>@{profile.username}</strong> and is labelled as a student opinion. Be kind: abusive posts are removed by moderators.</Notice>
        {error && <ErrorBox message={error} />}
        <Field label="Topic" htmlFor="post-cat" required error={show('category')}>
          <select id="post-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Choose...</option>
            {C.postCategories.map((c) => <option key={c} value={c}>{POST_CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="post-title" required error={show('title')}>
          <input id="post-title" className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Is the Wi-Fi in the library working today?" />
        </Field>
        <Field label="Details" htmlFor="post-body" required error={show('body')}>
          <textarea id="post-body" className="input" rows={6} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <Field label="Place (optional)" htmlFor="post-place">
          <select id="post-place" className="input" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
            <option value="">None</option>
            {places.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Button type="submit" busy={busy}>Post</Button>
      </form>
    </div>
  );
}
