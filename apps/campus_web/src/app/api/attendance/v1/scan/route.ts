import { z } from 'zod';
import { requireDevice } from '@/lib/server/devices';
import { publicEnv } from '@/lib/env';
import { handle, json, requireFeature, rateLimit, readBody } from '@/lib/server/http';
import { recordScan } from '@/lib/server/attendance';

// RFID check-in from a kiosk PC (pc_client.py -> kiosk/rfid_bridge.py) or any
// reader holding a device key with the "attendance" capability. The device
// reports only the card UID; the student and the session are decided on the
// server (lib/server/attendance.ts). Contract: docs/RFID_BACKEND.md.
const Body = z.object({
  cardUid: z.string().min(4).max(40),
  // Optional: normally the session is the one open now on this reader.
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  // How long the tap waited in the kiosk's queue (it is held while an answer plays).
  ageMs: z.number().int().min(0).max(600_000).optional(),
});

export const POST = handle(async (req: Request) => {
  requireFeature(publicEnv.features.rfidAttendance);
  const device = await requireDevice(req, 'attendance');
  // A person taps a card every few seconds at most; anything faster is a fault.
  rateLimit(`rfid-scan:${device.id}`, 60, 60_000);
  const body = await readBody(req, Body);
  const outcome = await recordScan(device, body);
  return json(outcome.body, outcome.httpStatus);
});
