'use client';

import Link from 'next/link';
import { Building2, CalendarDays, MapPin, MessageSquare, Megaphone, ThumbsUp, Users } from 'lucide-react';
import { Badge, SampleBadge } from './ui';
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
    <Link href={`/campus/notice/${a.id}`} className="card block p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <Megaphone className="h-4 w-4 text-saffron-600" aria-hidden />
        <OfficialBadge />
        <Badge tone={a.category === 'notice' ? 'saffron' : 'blue'}>{a.category === 'notice' ? 'Notice' : 'Announcement'}</Badge>
        {a.pinned && <Badge tone="amber">Pinned</Badge>}
        <SampleBadge show={a.isSample} />
      </div>
      <h3 className="mt-2 font-semibold text-slate-900">{a.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.body}</p>
      <p className="mt-2 text-xs text-slate-500">{formatDate(a.publishedAt)}</p>
    </Link>
  );
}

export function EventCard({ e }: { e: CampusEvent }) {
  return (
    <Link href={`/campus/event/${e.id}`} className="card flex gap-4 p-4 transition-shadow hover:shadow-md">
      <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-saffron-50 py-2 text-saffron-700">
        <span className="text-xs font-semibold uppercase">{e.startAt.toLocaleDateString('en-IN', { month: 'short' })}</span>
        <span className="text-xl font-bold leading-none">{e.startAt.getDate()}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {e.status === 'cancelled' && <Badge tone="red">Cancelled</Badge>}
          <SampleBadge show={e.isSample} />
        </div>
        <h3 className="truncate font-semibold text-slate-900">{e.title}</h3>
        <p className="text-sm text-slate-600">{e.clubName}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{formatRange(e.startAt, e.endAt)}</p>
        <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{e.venueName}</p>
      </div>
    </Link>
  );
}

export function PlaceCard({ p }: { p: Place }) {
  return (
    <Link href={`/campus/location/${p.id}`} className="card flex items-start gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="rounded-lg bg-brand-50 p-2 text-brand-700"><MapPin className="h-5 w-5" aria-hidden /></div>
      <div className="min-w-0">
        <h3 className="font-semibold text-slate-900">{p.name}</h3>
        <p className="text-sm text-slate-600">
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
    <Link href={`/campus/club/${c.id}`} className="card block p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy-900 text-sm font-bold text-saffron-500">
          {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{c.name}</h3>
          <div className="flex gap-1.5">
            {c.category && <Badge>{c.category}</Badge>}
            <SampleBadge show={c.isSample} />
          </div>
        </div>
      </div>
      {c.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{c.description}</p>}
    </Link>
  );
}

export function PostCard({ p, href }: { p: Post; href?: string }) {
  return (
    <Link href={href ?? `/community/${p.id}`} className="card block p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <OpinionBadge />
        <Badge>{label(POST_CATEGORY_LABELS, p.category)}</Badge>
        {p.locationName && <Badge tone="blue"><MapPin className="h-3 w-3" />{p.locationName}</Badge>}
        <SampleBadge show={p.isSample} />
      </div>
      <h3 className="mt-2 font-semibold text-slate-900">{p.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.body}</p>
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span>@{p.authorUsername} · {timeAgo(p.createdAt)}</span>
        <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{p.helpfulCount}</span>
        <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{p.commentCount}</span>
      </div>
    </Link>
  );
}

export function SectionTitle({ icon, title, href, linkLabel = 'See all' }: { icon: React.ReactNode; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">{icon}{title}</h2>
      {href && <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">{linkLabel}</Link>}
    </div>
  );
}

export const Icons = { Building2, CalendarDays, MapPin, MessageSquare, Megaphone, Users };
