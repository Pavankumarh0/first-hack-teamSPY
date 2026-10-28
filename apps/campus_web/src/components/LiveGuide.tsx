'use client';

import { CircleCheck, LocateFixed, Navigation, ShieldCheck, X } from 'lucide-react';
import type { Plan, Progress } from '@/lib/liveNav';
import type { LiveStatus } from '@/lib/useLivePosition';
import { Button, Notice, Spinner } from './ui';

/** GPS fixes worse than this are flagged: the dot may be on the wrong path. */
const WEAK_GPS_M = 35;

/** Turn-by-turn card for live directions from the walker's own position. */
export function LiveGuidePanel({ toName, status, message, accuracyM, plan, progress, onStop }: {
  toName: string | null;
  status: LiveStatus;
  message: string | null;
  accuracyM: number | null;
  plan: Plan | null;
  progress: Progress | null;
  onStop: () => void;
}) {
  const stop = <Button variant="secondary" size="sm" onClick={onStop}><X className="h-4 w-4" /> Stop</Button>;
  const privacy = (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-paper/70">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      Your location stays on this device. Campus Mithra does not store or share it.
    </p>
  );

  if (!toName) return <Notice tone="blue">Choose where you want to go, and directions will start from where you are.</Notice>;
  if (status === 'unavailable') return <Notice tone="amber">This browser cannot share your location. Choose a starting place instead.</Notice>;
  if (status === 'denied') {
    return (
      <Notice tone="amber">
        Location access is blocked for this site. Allow it in your browser&apos;s site settings, or choose a starting place instead.
        <div className="mt-3">{stop}</div>
      </Notice>
    );
  }

  return (
    <section className="rounded-[var(--radius-blob)] border-2 border-ink bg-ink p-5 text-paper" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sun px-3 py-1 label-caps text-ink"><Navigation className="h-3.5 w-3.5" aria-hidden /> Live directions</span>
        <button onClick={onStop} className="grid h-9 w-9 place-items-center rounded-full border-2 border-paper/60 hover:bg-paper/10" aria-label="Stop live directions"><X className="h-4 w-4" /></button>
      </div>

      {(status === 'asking' || (status === 'tracking' && !plan)) && (
        <div className="mt-4 flex items-center gap-3 text-paper/85"><Spinner label="" /> <span>Finding you{status === 'asking' ? ' - allow location access if your browser asks' : ''}...</span></div>
      )}
      {status === 'error' && <p className="mt-4 text-paper/85">{message}</p>}

      {plan?.status === 'off_campus' && (
        <p className="mt-4 text-lg font-semibold">
          You seem to be about {plan.distanceM} m from the nearest campus path. Directions start once you are on campus.
        </p>
      )}
      {plan?.status === 'no_route' && <p className="mt-4 text-lg font-semibold">There is no mapped path from here to {toName}{' '}yet.</p>}
      {plan?.status === 'arrived' && (
        <p className="display mt-4 flex items-center gap-2 text-4xl"><CircleCheck className="h-8 w-8 text-sun" aria-hidden /> You&apos;re here.</p>
      )}

      {plan?.status === 'ok' && progress && (
        progress.arrived ? (
          <p className="display mt-4 flex items-center gap-2 text-4xl"><CircleCheck className="h-8 w-8 text-sun" aria-hidden /> You&apos;re here.</p>
        ) : (
          <>
            <p className="display mt-4 text-[2.1rem] leading-[0.95] text-paper sm:text-5xl">{progress.next.text}.</p>
            <p className="mt-3 text-sm font-semibold text-paper/85">
              {progress.remainingM} m to {toName} · about {progress.minutes} min
              {progress.offRoute && <span className="ml-2 rounded-full bg-tangerine px-2 py-0.5 text-xs font-extrabold uppercase text-ink">Re-routing</span>}
            </p>
          </>
        )
      )}

      {accuracyM != null && (
        <p className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${accuracyM > WEAK_GPS_M ? 'text-sun' : 'text-paper/70'}`}>
          <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          {accuracyM > WEAK_GPS_M ? `Weak GPS signal (within ${accuracyM} m) - step outside or wait a moment.` : `Located within ${accuracyM} m`}
        </p>
      )}
      {privacy}
    </section>
  );
}
