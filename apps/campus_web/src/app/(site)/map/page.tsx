'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader, Skeleton } from '@/components/ui';
import { RoutePlanner } from '@/components/RoutePlanner';
import { isValidId } from '@/lib/deeplinks';

export default function MapPage() {
  return (
    <div>
      <PageHeader eyebrow="Campus map" title="Get walking directions"
        subtitle="Directions cover the campus only, along mapped walkways. Choose step-free routes if you need them." />
      <Suspense fallback={<Skeleton className="h-96" />}><Planner /></Suspense>
    </div>
  );
}

function Planner() {
  const p = useSearchParams();
  const from = p.get('from');
  const to = p.get('to');
  return <RoutePlanner initialFrom={isValidId(from) ? from : ''} initialTo={isValidId(to) ? to : ''} />;
}
