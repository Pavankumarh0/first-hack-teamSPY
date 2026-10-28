'use client';

import Link from 'next/link';
import { Building2, CalendarDays, MapPin, MessageSquare, Megaphone, ThumbsUp, Users } from 'lucide-react';
import { Badge, PosterHeading, SampleBadge } from './ui';
import { formatDate, formatRange, timeAgo } from '@/lib/format';
import { label, LOCATION_TYPE_LABELS, POST_CATEGORY_LABELS } from '@/lib/constants';
import type { Announcement, CampusEvent, Club, Place, Post } from '@/lib/data';

export function OfficialBadge() {
  return <Badge tone="brand" title="Published by the college">Official</Badge>;
}

/** Student posts are always labelled as opinions, never as official information. */
export function OpinionBadge() {
  return <Badge tone="violet" title="Written by a student - not verified by the college">Student opinion</Badge>;
}

export function NoticeCard({ a }: { a: Announcement }) {
  return (
    <Link href={`/campus/notice/${a.id}`} className="card block p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-tangerine"><Megaphone className="h-4 w-4" aria-hidden /></span>
        <OfficialBadge />
        <Badge tone={a.category === 'notice' ? 'saffron' : 'blue'}>{a.category === 'notice' ? 'Notice' : 'Announcement'}</Badge>
        {a.pinned && <Badge tone="amber">Pinned</Badge>}
        <SampleBadge show={a.isSample} />
      </div>
      <h3 className="mt-3 text-xl leading-tight">{a.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-slate-700">{a.body}</p>
      <p className="mt-3 label-caps text-slate-600">{formatDate(a.publishedAt)}</p>
    </Link>
  );
}

export function EventCard({ e }: { e: CampusEvent }) {
  return (
    <Link href={`/campus/event/${e.id}`} className="card flex gap-4 p-4">
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-ink bg-periwinkle">
        <span className="text-[11px] font-extrabold uppercase tracking-wider">{e.startAt.toLocaleDateString('en-IN', { month: 'short' })}</span>
        <span className="display text-3xl">{e.startAt.getDate()}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {e.status === 'cancelled' && <Badge tone="red">Cancelled</Badge>}
          <SampleBadge show={e.isSample} />
        </div>
        <h3 className="text-lg leading-tight">{e.title}</h3>
        <p className="text-sm font-semibold text-slate-700">{e.clubName}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><CalendarDays className="h-3.5 w-3.5" />{formatRange(e.startAt, e.endAt)}</p>
        <p className="flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5" />{e.venueName}</p>
      </div>
    </Link>
  );
}

export function PlaceCard({ p }: { p: Place }) {
  return (
    <Link href={`/campus/location/${p.id}`} className="card flex items-start gap-3 p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-mint"><MapPin className="h-5 w-5" aria-hidden /></div>
      <div className="min-w-0">
        <h3 className="text-lg leading-tight">{p.name}</h3>
        <p className="text-sm text-slate-700">
          {[p.buildingName, p.floor != null ? `Floor ${p.floor}` : null, p.room].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge>{label(LOCATION_TYPE_LABELS, p.type)}</Badge>
          <SampleBadge show={p.isSample} />
        </div>
      </div>
    </Link>
  );
}

export function ClubCard({ c }: { c: Club }) {
  return (
    <Link href={`/campus/club/${c.id}`} className="card block p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-bubblegum font-[family-name:var(--font-display)] text-base font-extrabold">
          {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div>
          <h3 className="text-lg leading-tight">{c.name}</h3>
          <div className="flex gap-1.5">
            {c.category && <Badge>{c.category}</Badge>}
            <SampleBadge show={c.isSample} />
          </div>
        </div>
      </div>
      {c.description && <p className="mt-3 line-clamp-2 text-sm text-slate-700">{c.description}</p>}
    </Link>
  );
}

export function PostCard({ p, href }: { p: Post; href?: string }) {
  return (
    <Link href={href ?? `/community/${p.id}`} className="card block p-5">
      <div className="flex flex-wrap items-center gap-2">
        <OpinionBadge />
        <Badge>{label(POST_CATEGORY_LABELS, p.category)}</Badge>
        {p.locationName && <Badge tone="blue"><MapPin className="h-3 w-3" />{p.locationName}</Badge>}
        <SampleBadge show={p.isSample} />
      </div>
      <h3 className="mt-3 text-xl leading-tight">{p.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-slate-700">{p.body}</p>
      <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-slate-600">
        <span>@{p.authorUsername} · {timeAgo(p.createdAt)}</span>
        <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{p.helpfulCount}</span>
        <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{p.commentCount}</span>
      </div>
    </Link>
  );
}

/** Section heading in poster type. The icon parameter is kept for callers but
    the poster style drops it. */
export function SectionTitle({ title, href, linkLabel = 'See all' }: { icon?: React.ReactNode; title: string; href?: string; linkLabel?: string }) {
  return <PosterHeading title={title} href={href} linkLabel={linkLabel} />;
}

export const Icons = { Building2, CalendarDays, MapPin, MessageSquare, Megaphone, Users };
