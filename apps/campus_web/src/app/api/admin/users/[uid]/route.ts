import { z } from 'zod';
import { updateAccount } from '@/lib/server/accounts';
import { handle, HttpError, json, readBody, requireCaller } from '@/lib/server/http';

const Body = z.object({
  role: z.enum(['student', 'staff', 'club_manager', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).refine((b) => b.role || b.status, 'Nothing to change.');

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ uid: string }> }) => {
  const caller = await requireCaller(req, ['admin']);
  const { uid } = await ctx.params;
  const body = await readBody(req, Body);
  if (uid === caller.uid && (body.status === 'suspended' || (body.role && body.role !== 'admin')))
    throw new HttpError(400, 'You cannot suspend or demote your own account. Ask another administrator.');
  return json(await updateAccount(uid, body));
});
