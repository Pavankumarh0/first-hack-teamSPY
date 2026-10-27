'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, CalendarDays, Map, Megaphone, MessageSquare, QrCode, Search, Wrench } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { EventCard, NoticeCard, PlaceCard, PostCard, SectionTitle } from '@/components/cards';
import { EmptyState, ErrorBox, ListSkeleton } from '@/components/ui';
import { listAnnouncements, listPlaces, listPosts, listPublicPosts, listUpcomingEvents } from '@/lib/data';
import { firebaseConfigured, publicEnv } from '@/lib/env';
import { useAsync } from '@/lib/useAsync';

const FEATURED = ['library-reading-hall', 'main-canteen', 'admission-office', 'placement-cell'];

export default function Home() {
  const router = useRouter();
  const { status, active } = useAuth();
  const [q, setQ] = useState('');
  const member = status === 'signedIn' && active;

  const notices = useAsync(() => listAnnouncements(3).then((p) => p.items), []);
  const events = useAsync(() => listUpcomingEvents(4).then((p) => p.items), []);
  const places = useAsync(async () => {
    const all = await listPlaces();
    const featured = all.filter((p) => FEATURED.includes(p.id));
    return (featured.length ? featured : all).slice(0, 4);
  }, []);
  const posts = useAsync(() => (member ? listPosts(null, 3) : listPublicPosts(3)).then((p) => p.items), [member]);

  return (
    <div className="space-y-12">
      <section className="relative -mx-4 -mt-8 overflow-hidden bg-navy-900 px-4 pb-12 pt-12 text-white sm:rounded-b-3xl">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-saffron-500/15 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-saffron-500">{publicEnv.collegeName}</p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-5xl">Find your way around campus</h1>
          <p className="mt-3 text-slate-300 sm:text-lg">
            Rooms, labs, offices and directions, the latest notices and events - and a place for students to help each other.
          </p>
          <form className="mx-auto mt-7 flex max-w-xl gap-2" role="search"
            onSubmit={(e) => { e.preventDefault(); router.push(`/directory?q=${encodeURIComponent(q.trim())}`); }}>
            <label htmlFor="home-search" className="sr-only">Search the campus</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id="home-search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Library, A-201, placement cell, canteen..."
                className="h-12 w-full rounded-xl border-0 bg-white pl-10 pr-3 text-slate-900 shadow-lg placeholder:text-slate-400 focus:ring-4 focus:ring-brand-500/40 focus:outline-none" />
            </div>
            <button className="h-12 rounded-xl bg-saffron-500 px-5 font-semibold text-navy-900 hover:bg-saffron-600">Search</button>
          </form>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickLink href="/map" icon={<Map className="h-5 w-5" />} label="Campus map" />
            <QuickLink href="/events" icon={<CalendarDays className="h-5 w-5" />} label="Events" />
            <QuickLink href="/reports/new" icon={<Wrench className="h-5 w-5" />} label="Report an issue" />
            <QuickLink href="/community" icon={<MessageSquare className="h-5 w-5" />} label="Community" />
          </div>
        </div>
      </section>

      {!firebaseConfigured ? null : (
        <div className="grid gap-10 lg:grid-cols-3">
          <section className="min-w-0 lg:col-span-2">
            <SectionTitle icon={<Megaphone className="h-5 w-5 text-saffron-600" />} title="Notices and announcements" href="/notices" />
            {notices.loading ? <ListSkeleton count={2} /> : notices.error ? <ErrorBox message={notices.error} onRetry={notices.reload} /> :
              notices.data!.length === 0 ? <EmptyState title="No notices right now" body="Official announcements from the college appear here." /> :
              <div className="space-y-3">{notices.data!.map((a) => <NoticeCard key={a.id} a={a} />)}</div>}
          </section>
          <section className="min-w-0">
            <SectionTitle icon={<CalendarDays className="h-5 w-5 text-brand-600" />} title="Upcoming events" href="/events" />
            {events.loading ? <ListSkeleton count={3} rows={1} /> : events.error ? <ErrorBox message={events.error} onRetry={events.reload} /> :
              events.data!.length === 0 ? <EmptyState title="No upcoming events" body="Club events appear here once published." /> :
              <div className="space-y-3">{events.data!.map((e) => <EventCard key={e.id} e={e} />)}</div>}
          </section>
          <section className="min-w-0 lg:col-span-2">
            <SectionTitle icon={<MessageSquare className="h-5 w-5 text-violet-600" />} title="Recent student discussions" href="/community" />
            {posts.loading ? <ListSkeleton count={2} /> : posts.error ? <ErrorBox message={posts.error} onRetry={posts.reload} /> :
              posts.data!.length === 0 ? <EmptyState title="No discussions yet" body={member ? 'Start one in the community.' : 'Sign in to see and join student discussions.'} /> :
              <div className="space-y-3">{posts.data!.map((p) => <PostCard key={p.id} p={p} />)}</div>}
          </section>
          <section className="min-w-0">
            <SectionTitle icon={<Map className="h-5 w-5 text-brand-600" />} title="Popular places" href="/directory" />
            {places.loading ? <ListSkeleton count={3} rows={1} /> : places.error ? <ErrorBox message={places.error} onRetry={places.reload} /> :
              places.data!.length === 0 ? <EmptyState title="The directory is empty" body="An administrator adds buildings and rooms from the dashboard." /> :
              <div className="space-y-3">{places.data!.map((p) => <PlaceCard key={p.id} p={p} />)}</div>}
            <div className="mt-6 rounded-2xl bg-saffron-50 p-5">
              <QrCode className="h-6 w-6 text-saffron-700" aria-hidden />
              <h3 className="mt-2 font-semibold text-slate-900">At the campus kiosk?</h3>
              <p className="mt-1 text-sm text-slate-700">Ask Mithra for a place, then scan the QR code on its screen to carry the directions on your phone.</p>
              <Link href="/map" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-saffron-700">Open the map <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 rounded-xl bg-white/10 px-3 py-4 text-sm font-medium ring-1 ring-white/10 transition-colors hover:bg-white/15">
      <span className="text-saffron-500">{icon}</span>{label}
    </Link>
  );
}
