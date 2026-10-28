'use client';

import Link from 'next/link';
import { QrCode as QrIcon, SearchX } from 'lucide-react';
import { OpenInApp } from './OpenInApp';
import { QrCode } from './QrCode';
import { CardSkeleton, ErrorBox } from './ui';
import { campusUrl, type CampusLink } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

/** Safe page for unknown, removed or malformed QR destinations. */
export function UnknownDestination({ what = 'place' }: { what?: string }) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border-2 border-ink bg-sun text-ink"><SearchX className="h-7 w-7" /></div>
      <h1 className="display text-5xl">We could not find that {what}</h1>
      <p className="mt-2 text-slate-600">
        The QR code or link may be out of date, or the {what} is no longer listed. Nothing was opened or changed.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/directory" className="rounded-full border-2 border-ink bg-sun px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink transition-shadow hover:shadow-[0_3px_0_0_var(--color-ink)]">Search the directory</Link>
        <Link href="/map" className="rounded-full border-2 border-ink px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink hover:bg-ink/5">Open the campus map</Link>
      </div>
    </div>
  );
}

export function DestinationLoading() {
  return <div className="space-y-4"><CardSkeleton rows={4} /><CardSkeleton rows={2} /></div>;
}

/** Common frame: the content, the app hand-off and the shareable QR. */
export function DestinationFrame({ link, children, error, onRetry }: { link: CampusLink; children: React.ReactNode; error?: string | null; onRetry?: () => void }) {
  if (error) return <ErrorBox message={error} onRetry={onRetry} />;
  const url = campusUrl(publicEnv.siteUrl, link);
  return (
    <div className="space-y-6">
      <OpenInApp link={link} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">{children}</div>
        <aside className="card flex flex-col items-center gap-3 self-start p-5 text-center">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><QrIcon className="h-4 w-4" /> Share this page</h2>
          <QrCode value={url} size={168} />
          <p className="break-all text-xs text-slate-500">{url}</p>
        </aside>
      </div>
    </div>
  );
}
