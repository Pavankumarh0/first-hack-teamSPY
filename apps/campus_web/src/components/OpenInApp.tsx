import { Smartphone } from 'lucide-react';
import { appSchemeUrl, type CampusLink } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';
import { ANDROID_APP } from '@/lib/app-download';

/**
 * Shown on every QR/deep-link page. On phones where the app is installed and
 * App Links / Universal Links are configured, the link opens the app before
 * this page is ever shown. Otherwise the visitor lands here, with everything
 * they need on the web. We do not try to detect whether the app is
 * installed: browsers do not allow it reliably.
 */
export function OpenInApp({ link }: { link: CampusLink }) {
  const stores = [
    // A Play Store listing if there is one, otherwise the site's own download page.
    { href: publicEnv.playStoreUrl || ANDROID_APP.page, label: 'Get it for Android' },
    publicEnv.appStoreUrl && { href: publicEnv.appStoreUrl, label: 'Get it for iPhone' },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-blob)] border-2 border-ink bg-periwinkle p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-white"><Smartphone className="h-5 w-5" aria-hidden /></span>
        <p className="text-sm font-medium text-ink">
          Have the <strong>Campus Mithra</strong> student app? Open this page in the app for saved directions and
          notifications. Everything you need is also right here.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
        <a href={appSchemeUrl(link)} className="rounded-full border-2 border-ink bg-sun px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink transition-shadow hover:shadow-[0_3px_0_0_var(--color-ink)]">
          Open in app
        </a>
        {stores.map((s) => (
          <a key={s.href} href={s.href} className="rounded-full border-2 border-ink bg-white px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-paper">
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}
