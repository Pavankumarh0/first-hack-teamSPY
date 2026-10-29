'use client';

import { apiFetch } from '@/components/AuthProvider';

/**
 * Sends a campus-wide inbox notification to the student apps as a push
 * notification (POST /api/admin/push). The notice or event is already saved
 * by then, so a failed push is reported as a sentence, never thrown.
 */
export async function pushToApps(idToken: () => Promise<string>, notificationId: string | null): Promise<string | null> {
  if (!notificationId) return null;
  try {
    const r = await apiFetch<{ sent: boolean }>(idToken, '/api/admin/push', { method: 'POST', body: JSON.stringify({ notificationId }) });
    return r.sent ? 'Sent to the student app as a push notification.' : 'Already sent to the student app.';
  } catch (e) {
    return `Saved, but the push notification to the app failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}
