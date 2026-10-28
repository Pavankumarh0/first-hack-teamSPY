'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, CalendarDays, MessageSquare, Search, Sparkles, Wrench } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { EventCard, NoticeCard, PlaceCard, PostCard } from '@/components/cards';
import { MapRoute, MithraBuddy, PhoneWithQr } from '@/components/Illustrations';
import { LogoMark } from '@/components/Logo';
import {
  ColorCard, EmptyState, ErrorBox, LinkButton, ListSkeleton, PosterHeading, RoundSticker, SampleBadge, Skeleton, Starburst, Tile,
} from '@/components/ui';
import { listAnnouncements, listPlaces, listPosts, listPublicPosts, listUpcomingEvents, type Announcement } from '@/lib/data';
import { firebaseConfigured, publicEnv } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

const FEATURED = ['library-reading-hall', 'main-canteen', 'admission-office', 'placement-cell'];

export default function Home() {
  const router = useRouter();
  const { status, active } = useAuth();
  const [q, setQ] = useState('');
  const member = status === 'signedIn' && active;

  const notices = useAsync(() => listAnnouncements(4).then((p) => p.items), []);
  const events = useAsync(() => listUpcomingEvents(4).then((p) => p.items), []);
  const places = useAsync(async () => {
    const all = await listPlaces();
    const featured = all.filter((p) => FEATURED.includes(p.id));
    return (featured.length ? featured : all).slice(0, 4);
  }, []);
  const posts = useAsync(() => (member ? listPosts(null, 3) : listPublicPosts(3)).then((p) => p.items), [member]);

  return (
    <div className="space-y-16 sm:space-y-24">
      {/* --- hero ------------------------------------------------------------ */}
      <section className="grid items-end gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative">
          <RoundSticker top="YOUR CAMPUS" bottom="ONE PLACE" className="sticker-spin absolute right-0 top-2 z-10 sm:-top-4 lg:-right-4">
            <LogoMark className="h-14 w-14 sm:h-16 sm:w-16" />
          </RoundSticker>
          <p className="mb-6 max-w-[55%] label-caps text-slate-700 sm:max-w-[60%]">{publicEnv.collegeName}</p>
          <h1 className="display relative pt-20 text-[5.4rem] sm:pt-24 sm:text-[8.5rem] lg:text-[9.5rem]">Find your way.</h1>
        </div>
        <ColorCard color="paper" className="p-6 sm:p-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase tracking-[-0.01em]">Rooms. Labs. Offices.</h2>
          <hr className="my-4 border-t-2 border-ink" />
          <p className="text-base text-slate-700 sm:text-lg">Search any room, then walk there on the campus map. Notices and events come straight from the college.</p>
          <form className="mt-5 space-y-3" role="search"
            onSubmit={(e) => { e.preventDefault(); router.push(`/directory?q=${encodeURIComponent(q.trim())}`); }}>
            <label htmlFor="home-search" className="sr-only">Search the campus</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2" aria-hidden />
              <input id="home-search" value={q} onChange={(e) => setQ(e.target.value)} className="input h-14 pl-12"
                placeholder="Library, A-201, canteen..." />
            </div>
            <button className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full border-2 border-ink bg-sun text-sm font-extrabold uppercase tracking-[0.06em] transition-shadow hover:shadow-[0_3px_0_0_var(--color-ink)] sm:text-base">
              <Sparkles className="h-5 w-5" aria-hidden /> Search the campus
            </button>
          </form>
          <p className="mt-4 text-sm text-slate-600">
            Students sign in with a username. <Link href="/register" className="font-bold text-ink underline decoration-2 underline-offset-4">Join</Link> or{' '}
            <Link href="/login" className="font-bold text-ink underline decoration-2 underline-offset-4">sign in</Link>.
          </p>
        </ColorCard>
      </section>

      {/* --- map banner + tiles --------------------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ColorCard color="bubblegum" className="relative overflow-hidden p-6 sm:p-8">
          <div className="halftone absolute inset-0 opacity-60" aria-hidden />
          <div className="relative">
            <span className="inline-block -rotate-6 rounded-[50%] border-2 border-ink bg-sun p-1">
              <span className="block rounded-[50%] border-2 border-ink bg-periwinkle px-6 py-2 font-[family-name:var(--font-display)] text-xl font-extrabold uppercase italic tracking-tight text-paper [text-shadow:2px_2px_0_var(--color-ink)] sm:text-2xl">
                No guesswork!
              </span>
            </span>
            <div className="mt-4 flex items-end gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold sm:text-xl">Every building and room on one campus map, with walking directions - step-free when you need them.</p>
                <LinkButton href="/map" variant="dark" size="lg" className="mt-5">Open the map <ArrowUpRight className="h-5 w-5" /></LinkButton>
              </div>
              <MapRoute className="hidden h-36 w-36 shrink-0 sm:block" />
            </div>
          </div>
        </ColorCard>
        <div className="grid grid-cols-2 gap-4">
          <Tile href="/reports/new" color="tangerine" icon={<Wrench />} title="Report an issue" subtitle="Track the fix" />
          <Tile href="/events" color="periwinkle" icon={<CalendarDays />} title="Events" subtitle="Clubs & fests" />
          <Tile href="/community" color="bubblegum" icon={<MessageSquare />} title="Community" subtitle="Ask a senior" />
          <Tile href="/notices" color="sun" title="Notices" subtitle="From the office"
            icon={<span className="inline-block rounded-[50%] bg-ink px-4 py-1.5 font-[family-name:var(--font-display)] text-xl font-extrabold uppercase text-paper">Official</span>} />
        </div>
      </section>

      {/* --- featured notice (dark card) ------------------------------------ */}
      {firebaseConfigured && <FeaturedNotice loading={notices.loading} error={notices.error} reload={notices.reload} notice={notices.data?.[0]} />}

      {/* --- how it works ----------------------------------------------------- */}
      <section>
        <PosterHeading title="How it works" />
        <div className="grid gap-x-4 gap-y-16 pt-20 md:grid-cols-3">
          <Step n="01" color="mint" art={<MithraBuddy className="h-44 w-44" />} title="Ask Mithra"
            body="At the kiosk in the Administrative Block lobby, hold the button and ask out loud." />
          <Step n="02" color="sun" art={<PhoneWithQr className="h-44 w-44" />} title="Scan a campus QR"
            body="Codes on doors and notice boards open that place, event or notice on your phone." />
          <Step n="03" color="periwinkle" art={<MapRoute className="h-44 w-44" />} title="Walk there"
            body="Turn-by-turn directions on the campus map - no outside map service needed." />
        </div>
      </section>

      {firebaseConfigured && (
        <>
          {/* --- events + notices --------------------------------------------- */}
          <section className="grid gap-12 lg:grid-cols-2">
            <div className="min-w-0">
              <PosterHeading title="Coming up" href="/events" />
              {events.loading ? <ListSkeleton count={3} rows={1} /> : events.error ? <ErrorBox message={events.error} onRetry={events.reload} /> :
                events.data!.length === 0 ? <EmptyState title="No upcoming events" body="Club events appear here once published." /> :
                <div className="space-y-3">{events.data!.map((e) => <EventCard key={e.id} e={e} />)}</div>}
            </div>
            <div className="min-w-0">
              <PosterHeading title="Notice board" href="/notices" />
              {notices.loading ? <ListSkeleton count={2} /> : notices.error ? <ErrorBox message={notices.error} onRetry={notices.reload} /> :
                notices.data!.length <= 1 ? <EmptyState title="Nothing else posted" body="Official announcements from the college appear here." /> :
                <div className="space-y-3">{notices.data!.slice(1).map((a) => <NoticeCard key={a.id} a={a} />)}</div>}
            </div>
          </section>

          {/* --- community + places ------------------------------------------ */}
          <section className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <PosterHeading title="Students say" href="/community" />
              {posts.loading ? <ListSkeleton count={2} /> : posts.error ? <ErrorBox message={posts.error} onRetry={posts.reload} /> :
                posts.data!.length === 0 ? <EmptyState title="No discussions yet" body={member ? 'Start one in the community.' : 'Sign in to see and join student discussions.'} /> :
                <div className="space-y-3">{posts.data!.map((p) => <PostCard key={p.id} p={p} />)}</div>}
            </div>
            <div className="min-w-0">
              <PosterHeading title="Popular" href="/directory" />
              {places.loading ? <ListSkeleton count={3} rows={1} /> : places.error ? <ErrorBox message={places.error} onRetry={places.reload} /> :
                places.data!.length === 0 ? <EmptyState title="The directory is empty" body="An administrator adds buildings and rooms from the dashboard." /> :
                <div className="space-y-3">{places.data!.map((p) => <PlaceCard key={p.id} p={p} />)}</div>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Step({ n, color, art, title, body }: { n: string; color: 'mint' | 'sun' | 'periwinkle'; art: React.ReactNode; title: string; body: string }) {
  return (
    <ColorCard color={color} className="relative px-6 pb-6 pt-32">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2">{art}</div>
      <span className="absolute left-5 top-5 grid h-16 w-16 place-items-center rounded-full border-2 border-ink bg-white font-[family-name:var(--font-display)] text-2xl font-extrabold">{n}</span>
      <hr className="mb-4 border-t-2 border-ink" />
      <h3 className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase tracking-[-0.02em]">{title}</h3>
      <p className="mt-1.5 text-base">{body}</p>
    </ColorCard>
  );
}

function FeaturedNotice({ loading, error, reload, notice }: { loading: boolean; error: string | null; reload: () => void; notice?: Announcement }) {
  const fresh = notice?.publishedAt && Date.now() - notice.publishedAt.getTime() < 7 * 86_400_000;
  return (
    <section className="relative">
      {notice && (fresh || notice.pinned) && (
        <Starburst color="sun" size={104} className="sticker-wobble absolute -right-2 -top-12 z-10 sm:-top-14 sm:right-8">
          {fresh ? <>Just<br />in!</> : <>Pinned!</>}
        </Starburst>
      )}
      <ColorCard color="ink" className="p-6 sm:p-10">
        {loading ? (
          <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-16 w-3/4" /><Skeleton className="h-4 w-full" /></div>
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : !notice ? (
          <>
            <span className="inline-flex rounded-full bg-sun px-3 py-1 label-caps text-ink">Official notices</span>
            <h2 className="display mt-5 text-5xl text-paper sm:text-7xl">All quiet.</h2>
            <p className="mt-4 max-w-2xl text-lg text-paper/85">No notice has been published yet. When the college posts one, it appears here first.</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-sun px-3 py-1 label-caps text-ink">
                Official · {notice.category === 'notice' ? 'Notice' : 'Announcement'} · {formatDate(notice.publishedAt)}
              </span>
              <SampleBadge show={notice.isSample} />
            </div>
            <h2 className="display mt-5 max-w-4xl text-[2.6rem] text-paper sm:text-7xl">{notice.title}</h2>
            <p className="mt-5 line-clamp-4 max-w-2xl text-lg leading-relaxed text-paper/85 sm:text-xl">{notice.body}</p>
            <LinkButton href={`/campus/notice/${notice.id}`} size="lg" className="mt-7 w-full sm:w-auto">
              Read the notice <ArrowUpRight className="h-5 w-5" />
            </LinkButton>
          </>
        )}
      </ColorCard>
    </section>
  );
}
