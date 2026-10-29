import type { Metadata } from 'next';
import { Bell, Download, MapPin, QrCode, ShieldCheck } from 'lucide-react';
import { ColorCard, PosterHeading } from '@/components/ui';
import { LogoMark } from '@/components/Logo';
import { ANDROID_APP } from '@/lib/app-download';

export const metadata: Metadata = {
  title: 'Get the Android app | Campus Mithra',
  description: 'Install the Campus Mithra student app: live campus directions, QR scanning and notifications for new notices and events.',
};

const FEATURES = [
  { icon: <MapPin className="h-5 w-5" />, title: 'Live directions', body: 'Walk to any building or room with your location on the campus map.' },
  { icon: <QrCode className="h-5 w-5" />, title: 'Scan campus QR codes', body: 'Codes on doors, notice boards and the Main Gate kiosk open straight in the app.' },
  { icon: <Bell className="h-5 w-5" />, title: 'Notifications', body: 'New notices and events from the college arrive on your phone.' },
];

export default function GetTheApp() {
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="label-caps text-slate-700">Campus Mithra for Android</p>
          <h1 className="display mt-4 text-[4rem] sm:text-[6.5rem]">Get the app.</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-700">
            Everything on this website, plus live walking directions, the QR scanner and notifications, in the student app.
          </p>
        </div>
        <ColorCard color="paper" className="p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <LogoMark className="h-20 w-20 shrink-0" />
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase">Campus Mithra</p>
              <p className="text-sm text-slate-600">Version {ANDROID_APP.version} · {ANDROID_APP.sizeMb} MB · Android 7 or newer</p>
            </div>
          </div>
          <a href={ANDROID_APP.href} download="campus-mithra.apk"
            className="mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-full border-2 border-ink bg-sun text-sm font-extrabold uppercase tracking-[0.06em] transition-shadow hover:shadow-[0_3px_0_0_var(--color-ink)] sm:text-base">
            <Download className="h-5 w-5" aria-hidden /> Install Android app
          </a>
          <p className="mt-3 text-xs text-slate-600">Not on the Play Store yet, so Android asks you to allow the install. iPhone: use this website.</p>
        </ColorCard>
      </section>

      <section>
        <PosterHeading title="Install in three steps" />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['Download', 'Tap "Install Android app" above on your phone. Chrome may warn that the file can harm your device: tap Download anyway.'],
            ['Allow the install', 'Open the downloaded file. If Android says installs from this source are blocked, tap Settings and turn on "Allow from this source", then go back.'],
            ['Open and allow notifications', 'Tap Install, open Campus Mithra, and allow notifications to hear about new notices and events.'],
          ].map(([title, body], i) => (
            <li key={title}>
              <ColorCard color={(['mint', 'sun', 'periwinkle'] as const)[i]} className="h-full p-6">
                <p className="display text-5xl">0{i + 1}</p>
                <p className="mt-3 font-extrabold uppercase">{title}</p>
                <p className="mt-2 text-sm">{body}</p>
              </ColorCard>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-sun">{f.icon}</span>
            <p className="mt-3 font-extrabold uppercase">{f.title}</p>
            <p className="mt-1 text-sm text-slate-700">{f.body}</p>
          </div>
        ))}
      </section>

      <p className="flex items-start gap-2 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        The app asks for your location only while you use directions, and never uploads it. Notifications are campus-wide: no
        phone number or account is needed to receive them.
      </p>
    </div>
  );
}
