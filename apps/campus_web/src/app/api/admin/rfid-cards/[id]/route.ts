import { z } from 'zod';
import { publicEnv } from '@/lib/env';
import { handle, json, requireFeature, readBody, requireCaller } from '@/lib/server/http';
import { setCardActive } from '@/lib/server/attendance';

// Deactivates (lost card) or reactivates a registered card. Records stay.
const Body = z.object({ active: z.boolean() });

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireFeature(publicEnv.features.rfidAttendance);
  const caller = await requireCaller(req, ['admin']);
  const { id } = await ctx.params;
  const { active } = await readBody(req, Body);
  await setCardActive(caller.uid, id, active);
  return json({ ok: true, active });
});
