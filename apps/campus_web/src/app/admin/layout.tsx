import type { Metadata } from 'next';
import { AdminShell } from '@/components/AdminShell';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
