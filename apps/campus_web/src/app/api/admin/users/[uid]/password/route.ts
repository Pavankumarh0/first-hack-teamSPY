import { z } from 'zod';
import { setPassword } from '@/lib/server/accounts';
import { handle, json, readBody, requireCaller } from '@/lib/server/http';

const Body = z.object({ password: z.string().max(128) });

// Account recovery without email: an administrator sets a temporary password
// and gives it to the student in person; their sessions are signed out.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ uid: string }> }) => {
  await requireCaller(req, ['admin']);
  const { uid } = await ctx.params;
  const { password } = await readBody(req, Body);
  await setPassword(uid, password);
  return json({ ok: true });
});
