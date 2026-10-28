'use client';

import { useEffect, useState } from 'react';

export type LiveStatus = 'off' | 'asking' | 'tracking' | 'denied' | 'unavailable' | 'error';
export interface Fix { lat: number; lng: number; accuracyM: number; at: number }

/**
 * Watches the device's position while `enabled`. The position is only kept in
 * this page's memory for live directions: it is never stored or sent to the
 * server. Stops the GPS as soon as guidance ends or the page closes.
 */
export function useLivePosition(enabled: boolean): { status: LiveStatus; fix: Fix | null; message: string | null } {
  const [status, setStatus] = useState<LiveStatus>('off');
  const [fix, setFix] = useState<Fix | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus('off'); setFix(null); return; }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { setStatus('unavailable'); return; }
    setStatus('asking');
    setMessage(null);
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: p.timestamp });
        setStatus('tracking');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else { setStatus('error'); setMessage(err.code === err.TIMEOUT ? 'Getting your position is taking long - are you indoors?' : 'Your position is not available right now.'); }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { status, fix, message };
}
