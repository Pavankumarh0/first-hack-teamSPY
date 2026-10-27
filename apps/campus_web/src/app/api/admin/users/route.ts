import { z } from 'zod';
import { createAccount } from '@/lib/server/accounts';
import { handle, json, readBody, requireCaller } from '@/lib/server/http';

const Body = z.object({
  username: z.string().max(64),
  password: z.string().max(128),
  displayName: z.string().trim().min(2).max(40),
  role: z.enum(['student', 'staff', 'club_manager', 'admin']),
  department: z.string().trim().max(60).optional(),
  year: z.number().int().min(1).max(6).nullable().optional(),
});

// Administrator-managed account creation (for campus-only deployments).
export const POST = handle(async (req: Request) => {
  const caller = await requireCaller(req, ['admin']);
  const body = await readBody(req, Body);
  const uid = await createAccount({ ...body, year: body.year ?? null, createdBy: caller.uid });
  return json({ uid }, 201);
});
