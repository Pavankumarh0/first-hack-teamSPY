import Link from 'next/link';
import { LogoMark } from './Logo';
import { publicEnv } from '@/lib/env';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-navy-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-white">
            <LogoMark className="h-7 w-7" />
            <span className="font-[family-name:var(--font-display)] font-bold">Campus Mithra</span>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            The campus guide for {publicEnv.collegeName}: places, directions, events and notices, also on the
            information kiosk in the Administrative Block lobby.
          </p>
        </div>
        <div className="text-sm">
          <h2 className="font-semibold text-white">Explore</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className="hover:text-white" href="/map">Campus map and directions</Link></li>
            <li><Link className="hover:text-white" href="/directory">Buildings and rooms</Link></li>
            <li><Link className="hover:text-white" href="/events">Upcoming events</Link></li>
            <li><Link className="hover:text-white" href="/notices">Official notices</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <h2 className="font-semibold text-white">Students</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className="hover:text-white" href="/login">Sign in</Link></li>
            <li><Link className="hover:text-white" href="/reports/new">Report a maintenance issue</Link></li>
            <li><Link className="hover:text-white" href="/community">Student community</Link></li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Community posts are student opinions, not official college information.
          </p>
        </div>
      </div>
    </footer>
  );
}
