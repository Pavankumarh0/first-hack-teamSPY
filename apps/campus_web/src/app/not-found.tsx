import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">This page is not on the campus map</h1>
      <p className="mt-3 text-slate-600">The link may be old, or the QR code may belong to something that was removed.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Home</Link>
        <Link href="/directory" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Campus directory</Link>
      </div>
    </main>
  );
}
