'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { RequireMember } from '@/components/RequireMember';
import { Button, ErrorBox, Field, PageHeader, Spinner } from '@/components/ui';
import { C, REPORT_CATEGORY_LABELS } from '@/lib/constants';
import { createReport, listBuildings, listPlaces, PHOTO_MAX_BYTES, PHOTO_TYPES, type UserProfile } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { useAsync } from '@/lib/useAsync';

export default function NewReportPage() {
  return (
    <RequireMember why="Reports are linked to your account so you can follow their progress.">
      {(profile) => <NewReport profile={profile} />}
    </RequireMember>
  );
}

function NewReport({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const dir = useAsync(() => Promise.all([listBuildings(), listPlaces()]), []);
  const [f, setF] = useState({ category: '', title: '', description: '', buildingId: '', locationId: '', locationDetail: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rooms = useMemo(() => (dir.data?.[1] ?? []).filter((p) => p.buildingId === f.buildingId), [dir.data, f.buildingId]);
  const errors = {
    category: f.category ? null : 'Choose a category.',
    title: f.title.trim().length < 3 ? 'Give a short title (3+ characters).' : null,
    description: f.description.trim().length < 10 ? 'Describe the problem (10+ characters).' : null,
    where: f.buildingId || f.locationDetail.trim() ? null : 'Choose a building or describe where it is.',
    photo: photo && !PHOTO_TYPES.includes(photo.type) ? 'Use a JPEG, PNG, WebP or HEIC image.' : photo && photo.size > PHOTO_MAX_BYTES ? 'The photo must be under 5 MB.' : null,
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true); setError(null);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      const building = dir.data?.[0].find((b) => b.id === f.buildingId);
      const room = rooms.find((r) => r.id === f.locationId);
      const id = await createReport(profile, {
        category: f.category, title: f.title, description: f.description,
        buildingId: building?.id ?? null, buildingName: building?.name ?? null,
        locationId: room?.id ?? null, locationName: room?.name ?? null, locationDetail: f.locationDetail,
      }, photo);
      router.replace(`/reports/${id}`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  if (dir.loading) return <Spinner />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Maintenance" title="Report an issue" subtitle="Staff see your report straight away. You will be notified as its status changes." />
      <form onSubmit={submit} className="card space-y-5 p-6" noValidate>
        {(error || dir.error) && <ErrorBox message={error ?? dir.error!} />}
        <Field label="Category" htmlFor="rep-cat" required error={show('category')}>
          <select id="rep-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Choose...</option>
            {C.reportCategories.map((c) => <option key={c} value={c}>{REPORT_CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="rep-title" required error={show('title')}>
          <input id="rep-title" className="input" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ceiling fan not working" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Building" htmlFor="rep-bld" error={show('where')}>
            <select id="rep-bld" className="input" value={f.buildingId} onChange={(e) => setF({ ...f, buildingId: e.target.value, locationId: '' })}>
              <option value="">Choose...</option>
              {dir.data?.[0].map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Room or facility" htmlFor="rep-room">
            <select id="rep-room" className="input" value={f.locationId} disabled={!f.buildingId || rooms.length === 0} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
              <option value="">{f.buildingId && rooms.length === 0 ? 'No rooms listed' : 'Optional'}</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.room ? `${r.name} (${r.room})` : r.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Exact spot" htmlFor="rep-spot" hint="e.g. second floor corridor near the stairs">
          <input id="rep-spot" className="input" maxLength={200} value={f.locationDetail} onChange={(e) => setF({ ...f, locationDetail: e.target.value })} />
        </Field>
        <Field label="What is wrong?" htmlFor="rep-desc" required error={show('description')}>
          <textarea id="rep-desc" className="input" rows={5} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Photo (optional)" error={show('photo')} hint="JPEG, PNG, WebP or HEIC, up to 5 MB. Only you and campus staff can see it.">
          {photo ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="truncate">{photo.name} ({Math.round(photo.size / 1024)} KB)</span>
              <button type="button" onClick={() => setPhoto(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Remove photo"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-6 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-700">
              <ImagePlus className="h-5 w-5" /> Add a photo
              <input type="file" accept={PHOTO_TYPES.join(',')} className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </Field>
        <Button type="submit" busy={busy}>Submit report</Button>
      </form>
    </div>
  );
}
