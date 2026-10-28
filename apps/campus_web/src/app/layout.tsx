import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { SetupRequired } from '@/components/SetupRequired';
import { firebaseConfigured } from '@/lib/env';
import './globals.css';

// Headlines: Bricolage Grotesque with its width axis (condensed poster type).
const headline = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-headline', display: 'swap', axes: ['wdth', 'opsz'] });
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Campus Mithra', template: '%s | Campus Mithra' },
  description: 'Campus directory, directions, events, notices and student community.',
};

export const viewport: Viewport = { themeColor: '#1d1a16', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${headline.variable} ${body.variable}`}>
      <body className="min-h-screen font-sans">
        {!firebaseConfigured && <SetupRequired />}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
