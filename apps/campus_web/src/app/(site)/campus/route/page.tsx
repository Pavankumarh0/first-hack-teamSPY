'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { OpenInApp } from '@/components/OpenInApp';
import { RoutePlanner } from '@/components/RoutePlanner';
import { PageHeader, Skeleton } from '@/components/ui';
import { UnknownDestination } from '@/components/Destination';
import { parseCampusPath } from '@/lib/deeplinks';

export default function RoutePage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Route /></Suspense>;
}

function Route() {
  const params = useSearchParams();
  const link = parseCampusPath('/campus/route', `?${params.toString()}`);
  if (!link) return <UnknownDestination what="route" />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Directions" title="Your route" subtitle="Shared from the campus kiosk or a QR code." />
      <OpenInApp link={link} />
      <RoutePlanner initialFrom={link.from ?? ''} initialTo={link.to ?? ''} />
    </div>
  );
}
