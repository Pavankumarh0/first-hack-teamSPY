import { FieldValue } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/server/admin';
import { handle, HttpError, json, requireCaller } from '@/lib/server/http';

// Revoking keeps the record (for the audit trail) and disables the key.
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireCaller(req, ['admin']);
  const { id } = await ctx.params;
  const ref = adminServices().db.collection('kioskDevices').doc(id);
  if (!(await ref.get()).exists) throw new HttpError(404, 'No such device.');
  await ref.update({ active: false, revokedBy: caller.uid, revokedAt: FieldValue.serverTimestamp() });
  return json({ ok: true });
});
