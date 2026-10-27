import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { adminServices, BackendNotConfigured } from './admin';
import type { Role } from '../constants';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Wraps a handler: HttpError -> its status, missing setup -> 503, else 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof BackendNotConfigured) return json({ error: err.message }, 503);
      // Never echo request bodies here: they can hold passwords.
      console.error('[api]', err instanceof Error ? err.message : err);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  };
}

export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Expected a JSON body.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
  return parsed.data;
}

export interface Caller {
  uid: string;
  role: Role;
}

/** Verifies the Firebase ID token in "Authorization: Bearer <token>". */
export async function requireCaller(req: Request, roles: Role[]): Promise<Caller> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in first.');
  let decoded;
  try {
    decoded = await adminServices().auth.verifyIdToken(token, true);
  } catch (err) {
    if (err instanceof BackendNotConfigured) throw err;
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }
  const role = decoded.role as Role | undefined;
  if (decoded.active !== true || !role || !roles.includes(role))
    throw new HttpError(403, 'You do not have permission for this.');
  return { uid: decoded.uid, role };
}

// Small in-memory limiter for unauthenticated endpoints (per server instance;
// put a shared limiter or Cloud Armor in front for multi-instance hosting).
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}
