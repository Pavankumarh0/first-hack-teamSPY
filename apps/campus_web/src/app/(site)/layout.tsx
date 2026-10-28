import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-6xl px-4 pb-8 pt-10 sm:pt-14">{children}</main>
      <SiteFooter />
    </>
  );
}
