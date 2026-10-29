'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, UsersRound } from 'lucide-react';
import { RequireMember } from '@/components/RequireMember';
import { Badge, Button, EmptyState, ErrorBox, Field, PageHeader, Spinner } from '@/components/ui';
import { listClubs, listUpcomingEvents } from '@/lib/data';
import { INTERESTS, discoverableProfiles, ownDiscoveryProfile, saveDiscoveryProfile, type DiscoveryDraft, type Interest } from '@/lib/discovery';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

const LABEL: Record<Interest, string> = {
  coding: 'Coding', gaming: 'Gaming', music: 'Music', photography: 'Photography', sports: 'Sports',
  entrepreneurship: 'Entrepreneurship', design: 'Design', robotics: 'Robotics', volunteering: 'Volunteering', other: 'Other',
};
const blank: DiscoveryDraft = { alias: '', blurb: '', interests: [], clubIds: [], openToTeams: false, discoverable: false };

export default function FindPeoplePage() {
  return <RequireMember why="Sign in to discover campus communities and choose what you want to share.">
    {(profile) => <FindPeople uid={profile.id} />}
  </RequireMember>;
}

function FindPeople({ uid }: { uid: string }) {
  const mine = useAsync(() => ownDiscoveryProfile(uid), [uid]);
  const people = useAsync(() => discoverableProfiles(), []);
  const clubs = useAsync(() => listClubs(), []);
  const events = useAsync(() => listUpcomingEvents(20).then((p) => p.items), []);
  const [draft, setDraft] = useState<DiscoveryDraft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (mine.data) {
      const { alias, blurb, interests, clubIds, openToTeams, discoverable } = mine.data;
      setDraft({ alias, blurb, interests, clubIds, openToTeams, discoverable });
    }
  }, [mine.data]);

  const clubById = useMemo(() => new Map((clubs.data ?? []).map((c) => [c.id, c])), [clubs.data]);
  const visiblePeers = useMemo(() => {
    const own = new Set(draft.interests);
    return (people.data ?? []).filter((p) => p.id !== uid)
      .map((p) => ({ profile: p, shared: p.interests.filter((i) => own.has(i)) }))
      .sort((a, b) => b.shared.length - a.shared.length)
      .filter((x) => draft.interests.length === 0 || x.shared.length > 0);
  }, [people.data, draft.interests, uid]);

  async function save() {
    if (!draft.alias.trim()) { setError('Choose a display name before saving.'); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveDiscoveryProfile(uid, draft, mine.data ?? null);
      setSaved(true); mine.reload(); people.reload();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  function toggleInterest(interest: Interest) {
    setDraft((d) => ({ ...d, interests: d.interests.includes(interest) ? d.interests.filter((v) => v !== interest) : [...d.interests, interest] }));
  }
  function toggleClub(id: string) {
    setDraft((d) => ({ ...d, clubIds: d.clubIds.includes(id) ? d.clubIds.filter((v) => v !== id) : [...d.clubIds, id] }));
  }

  return <div className="mx-auto max-w-5xl space-y-8">
    <PageHeader eyebrow="Student community" title="Find Your People" subtitle="Meet students with shared interests, discover clubs, and find teammates for projects and competitions." />
    <section className="card p-5 sm:p-7">
      <div className="mb-5 flex items-start gap-3"><UsersRound className="mt-1 h-6 w-6" /><div><h2 className="text-xl font-extrabold">Your shareable profile</h2><p className="text-sm text-slate-600">Only the alias, short bio, selected interests, club choices, and team availability below can appear to other students. Your username, contact details, department, attendance, and reports stay private.</p></div></div>
      {mine.loading ? <Spinner label="Loading your profile" /> : mine.error ? <ErrorBox message={mine.error} onRetry={mine.reload} /> : <>
        {error && <div className="mb-3"><ErrorBox message={error} /></div>}
        {saved && <p className="mb-3 text-sm font-bold text-emerald-800">Your privacy settings were saved.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="people-alias" hint="Choose what other students see; do not put contact details here."><input id="people-alias" className="input" maxLength={32} value={draft.alias} onChange={(e) => setDraft({ ...draft, alias: e.target.value })} /></Field>
          <Field label="A little about you" htmlFor="people-blurb"><input id="people-blurb" className="input" maxLength={160} value={draft.blurb} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} placeholder="What would you like to learn or build?" /></Field>
        </div>
        <fieldset className="mt-4"><legend className="mb-2 text-sm font-bold">Choose interests</legend><div className="flex flex-wrap gap-2">
          {INTERESTS.map((interest) => <button type="button" key={interest} aria-pressed={draft.interests.includes(interest)} onClick={() => toggleInterest(interest)}
            className={draft.interests.includes(interest) ? 'rounded-full border-2 border-ink bg-sun px-3 py-1.5 text-sm font-bold' : 'rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-bold'}>{LABEL[interest]}</button>)}
        </div></fieldset>
        <fieldset className="mt-4"><legend className="mb-2 text-sm font-bold">Clubs you want to explore</legend>
          {clubs.loading ? <Spinner /> : clubs.error ? <ErrorBox message={clubs.error} onRetry={clubs.reload} /> : <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(clubs.data ?? []).map((club) => <label key={club.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.clubIds.includes(club.id)} onChange={() => toggleClub(club.id)} />{club.name}</label>)}
          </div>}
        </fieldset>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.openToTeams} onChange={(e) => setDraft({ ...draft, openToTeams: e.target.checked })} />I’m open to joining a project or competition team</label>
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={draft.discoverable} onChange={(e) => setDraft({ ...draft, discoverable: e.target.checked })} />Show my selected profile to other active students</label>
          </div>
          <Button busy={busy} onClick={() => void save()}>Save privacy and interests</Button>
        </div>
      </>}
    </section>

    <section>
      <div className="mb-4 flex items-end justify-between gap-3"><div><p className="label-caps text-slate-500">Opt-in profiles</p><h2 className="display text-4xl">Students like you</h2></div><span className="text-sm text-slate-500">No contact details shown</span></div>
      {people.loading ? <Spinner label="Finding students" /> : people.error ? <ErrorBox message={people.error} onRetry={people.reload} /> :
        visiblePeers.length === 0 ? <EmptyState title="No matching profiles yet" body={draft.interests.length ? 'Try adding another interest or check back when more students opt in.' : 'Choose interests above to find students with similar interests.'} /> :
        <div className="grid gap-3 md:grid-cols-2">{visiblePeers.map(({ profile, shared }) => <article key={profile.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{profile.alias}</h3>{profile.openToTeams && <Badge tone="green">Open to teams</Badge>}</div>
          {profile.blurb && <p className="mt-2 text-sm text-slate-700">{profile.blurb}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">{profile.interests.map((i) => <Badge key={i} tone={shared.includes(i) ? 'brand' : 'slate'}>{LABEL[i]}</Badge>)}</div>
          <div className="mt-3 flex flex-wrap gap-2">{profile.clubIds.map((id) => {
            const club = clubById.get(id);
            return club ? <Link key={id} href={'/campus/club/' + id} className="text-sm font-bold underline">{club.name}</Link> : null;
          })}</div>
        </article>)}</div>}
    </section>

    <section className="grid gap-8 lg:grid-cols-2">
      <div><PageHeader eyebrow="Communities" title="Explore clubs" subtitle="See published clubs and societies across campus." />
        {clubs.loading ? <Spinner /> : clubs.error ? <ErrorBox message={clubs.error} onRetry={clubs.reload} /> :
          <div className="grid gap-2 sm:grid-cols-2">{(clubs.data ?? []).map((club) => <Link key={club.id} href={'/campus/club/' + club.id} className="card p-4 hover:shadow-hard-sm">
            <h3 className="font-extrabold">{club.name}</h3><p className="mt-1 line-clamp-3 text-sm text-slate-600">{club.description}</p>
          </Link>)}</div>}
      </div>
      <div><PageHeader eyebrow="Upcoming" title="Club activities" subtitle="Find an event, then join its club." />
        {events.loading ? <Spinner /> : events.error ? <ErrorBox message={events.error} onRetry={events.reload} /> :
          (events.data ?? []).length === 0 ? <EmptyState title="No upcoming events posted" /> :
          <ul className="card divide-y divide-slate-100">{events.data!.map((event) => <li key={event.id} className="p-4">
            <Link href={'/campus/event/' + event.id} className="font-extrabold hover:underline">{event.title}</Link>
            <p className="mt-1 text-sm text-slate-600"><CalendarDays className="mr-1 inline h-4 w-4" />{formatDate(event.startAt)} · {event.clubName} · {event.venueName}</p>
          </li>)}</ul>}
      </div>
    </section>
  </div>;
}

