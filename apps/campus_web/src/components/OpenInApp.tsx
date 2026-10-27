import { Smartphone } from 'lucide-react';
import { appSchemeUrl, type CampusLink } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

/**
 * Shown on every QR/deep-link page. On phones where the app is installed and
 * App Links / Universal Links are configured, the link opens the app before
 * this page is ever shown. Otherwise the visitor lands here, with everything
 * they need on the web. We do not try to detect whether the app is
 * installed: browsers do not allow it reliably.
 */
export function OpenInApp({ link }: { link: CampusLink }) {
  const stores = [
    publicEnv.playStoreUrl && { href: publicEnv.playStoreUrl, label: 'Get it for Android' },
    publicEnv.appStoreUrl && { href: publicEnv.appStoreUrl, label: 'Get it for iPhone' },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
        <p className="text-sm text-brand-800">
          Have the <strong>Campus Mithra</strong> student app? Open this page in the app for saved directions and
          notifications. Everything you need is also right here.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
        <a href={appSchemeUrl(link)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Open in app
        </a>
        {stores.map((s) => (
          <a key={s.href} href={s.href} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}
