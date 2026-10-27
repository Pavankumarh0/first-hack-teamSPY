import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { SetupRequired } from '@/components/SetupRequired';
import { firebaseConfigured } from '@/lib/env';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap', weight: ['600', '700', '800'] });

export const metadata: Metadata = {
  title: { default: 'Campus Mithra', template: '%s | Campus Mithra' },
  description: 'Campus directory, directions, events, notices and student community.',
};

export const viewport: Viewport = { themeColor: '#0b1020', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-screen font-sans">
        {!firebaseConfigured && <SetupRequired />}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
