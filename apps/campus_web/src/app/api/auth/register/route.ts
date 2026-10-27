import { z } from 'zod';
import { createAccount } from '@/lib/server/accounts';
import { serverEnv } from '@/lib/server/config';
import { clientIp, handle, HttpError, json, rateLimit, readBody } from '@/lib/server/http';

const Body = z.object({
  username: z.string().max(64),
  password: z.string().max(128),
  displayName: z.string().trim().min(2, 'Enter your name (2-40 characters).').max(40, 'Enter your name (2-40 characters).'),
  department: z.string().trim().max(60).optional(),
  year: z.number().int().min(1).max(6).nullable().optional(),
  inviteCode: z.string().max(100).optional(),
});

// Student self-registration. The client signs in afterwards with the same
// username and password; this route never returns or logs the password.
export const POST = handle(async (req: Request) => {
  if (serverEnv.registrationMode === 'closed')
    throw new HttpError(403, 'Registration is closed. Ask the college office for an account.');
  rateLimit(`register:${clientIp(req)}`, 5, 10 * 60_000);
  const body = await readBody(req, Body);
  if (serverEnv.registrationMode === 'invite') {
    if (!serverEnv.registrationInviteCode)
      throw new HttpError(503, 'Registration needs REGISTRATION_INVITE_CODE to be set on the server.');
    if (body.inviteCode?.trim() !== serverEnv.registrationInviteCode)
      throw new HttpError(403, 'That campus registration code is not correct.');
  }
  await createAccount({
    username: body.username,
    password: body.password,
    displayName: body.displayName,
    department: body.department,
    year: body.year ?? null,
    role: 'student',
    createdBy: 'self-registration',
  });
  return json({ ok: true }, 201);
});

export const GET = handle(async () => json({ mode: serverEnv.registrationMode }));
