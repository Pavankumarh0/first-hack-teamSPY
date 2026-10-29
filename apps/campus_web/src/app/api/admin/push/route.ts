import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { adminServices } from '@/lib/server/admin';
import { handle, HttpError, json, readBody, requireCaller } from '@/lib/server/http';
import { C } from '@/lib/constants';

const Body = z.object({ notificationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

// Sends a campus-wide inbox notification (notifications/{id}, audience "all",
// written by the dashboard when a notice is published or an event announced)
// as a push notification to every student app, through the FCM topic the app
// subscribes to. Each notification is pushed at most once.
export const POST = handle(async (req: Request) => {
  await requireCaller(req, ['admin']);
  const { notificationId } = await readBody(req, Body);
  const { app, db } = adminServices();
  const ref = db.doc(`notifications/${notificationId}`);

  // Claim it in a transaction, so two clicks cannot send it twice.
  const n = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpError(404, 'That notification does not exist.');
    const d = snap.data()!;
    if (d.audience !== 'all') throw new HttpError(400, 'Only campus-wide notifications are pushed.');
    if (d.pushedAt) return null;
    t.update(ref, { pushedAt: FieldValue.serverTimestamp() });
    return d;
  });
  if (!n) return json({ sent: false, reason: 'already sent' });

  const link = typeof n.link === 'string' && n.link.startsWith('/campus/') ? n.link : null;
  try {
    const messageId = await getMessaging(app).send({
      topic: C.push.topic,
      notification: { title: String(n.title).slice(0, 120), body: String(n.body ?? '').slice(0, 200) },
      data: link ? { link } : {},
      android: { priority: 'high', notification: { channelId: C.push.androidChannel } },
    });
    return json({ sent: true, messageId });
  } catch (err) {
    // Not sent: release the claim so it can be retried.
    await ref.update({ pushedAt: FieldValue.delete() });
    throw err;
  }
});
