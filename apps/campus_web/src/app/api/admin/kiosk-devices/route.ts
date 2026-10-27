import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/server/admin';
import { hashDeviceKey, newDeviceKey } from '@/lib/server/devices';
import { handle, json, readBody, requireCaller } from '@/lib/server/http';

const Body = z.object({
  name: z.string().trim().min(2).max(60),
  kioskConfigId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).default('default'),
  capabilities: z.array(z.enum(['kiosk', 'attendance'])).min(1).default(['kiosk']),
});

export const GET = handle(async (req: Request) => {
  await requireCaller(req, ['admin']);
  const snap = await adminServices().db.collection('kioskDevices').orderBy('createdAt', 'desc').limit(100).get();
  return json({
    devices: snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, name: x.name, kioskConfigId: x.kioskConfigId, capabilities: x.capabilities, active: x.active,
        keyPrefix: x.keyPrefix, createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
        lastSeenAt: x.lastSeenAt?.toDate?.()?.toISOString() ?? null };
    }),
  });
});

// The key is returned once and only its hash is stored.
export const POST = handle(async (req: Request) => {
  const caller = await requireCaller(req, ['admin']);
  const body = await readBody(req, Body);
  const key = newDeviceKey();
  const ref = await adminServices().db.collection('kioskDevices').add({
    name: body.name,
    kioskConfigId: body.kioskConfigId,
    capabilities: body.capabilities,
    keyHash: hashDeviceKey(key),
    keyPrefix: key.slice(0, 8),
    active: true,
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return json({ id: ref.id, key }, 201);
});
