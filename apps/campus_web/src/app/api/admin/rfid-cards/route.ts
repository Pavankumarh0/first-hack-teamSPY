import { z } from 'zod';
import { publicEnv } from '@/lib/env';
import { handle, json, requireFeature, readBody, requireCaller } from '@/lib/server/http';
import { registerCard } from '@/lib/server/attendance';

// Registers a card to a student (administrators only). The card UID is hashed
// with RFID_UID_HMAC_SECRET and never stored; listing cards is a plain
// Firestore read for admins (rfidCards).
const Body = z.object({
  username: z.string().trim().min(3).max(24),
  cardUid: z.string().trim().min(4).max(40).optional(),
  cardKey: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  label: z.string().trim().max(60).optional(),
}).refine((b) => Boolean(b.cardUid) !== Boolean(b.cardKey), { message: 'Give either the card UID or a scanned card.' });

export const POST = handle(async (req: Request) => {
  requireFeature(publicEnv.features.rfidAttendance);
  const caller = await requireCaller(req, ['admin']);
  const body = await readBody(req, Body);
  return json(await registerCard(caller.uid, body), 201);
});
