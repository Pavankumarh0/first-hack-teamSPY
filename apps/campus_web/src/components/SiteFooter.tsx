import Link from 'next/link';
import { LogoMark } from './Logo';
import { publicEnv } from '@/lib/env';

export function SiteFooter() {
  return (
    <footer className="mt-20 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[var(--radius-blob)] border-2 border-ink bg-ink text-paper">
        <div className="grid gap-8 px-6 py-10 sm:grid-cols-3 sm:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-11 w-11" />
              <span className="display text-3xl">Mithra</span>
            </div>
            <p className="mt-4 text-sm text-paper/75">
              The campus guide for {publicEnv.collegeName}: places, directions, events and notices - also on the
              information kiosk in the Administrative Block lobby.
            </p>
          </div>
          <FooterList title="Explore" links={[['/map', 'Campus map'], ['/directory', 'Buildings and rooms'], ['/events', 'Upcoming events'], ['/notices', 'Official notices']]} />
          <div>
            <FooterList title="Students" links={[['/login', 'Sign in'], ['/reports/new', 'Report an issue'], ['/community', 'Student community']]} />
            <p className="mt-4 text-xs text-paper/60">Community posts are student opinions, not official college information.</p>
          </div>
        </div>
        <div className="display select-none overflow-hidden whitespace-nowrap border-t-2 border-paper/15 px-4 pb-2 pt-4 text-[17vw] leading-[0.8] text-sun sm:text-[9.5rem]" aria-hidden>
          Campus mithra.
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="text-sm">
      <h2 className="label-caps text-sun">{title}</h2>
      <ul className="mt-3 space-y-2 font-semibold">
        {links.map(([href, text]) => <li key={href}><Link className="hover:text-sun" href={href}>{text}</Link></li>)}
      </ul>
    </div>
  );
}
