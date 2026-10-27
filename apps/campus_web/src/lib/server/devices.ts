import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminServices } from './admin';
import { HttpError } from './http';

// Kiosks (and, later, RFID readers) call the API with a device key:
//   Authorization: Bearer cmk_<random>
// Only the SHA-256 of the key is stored (kioskDevices, unreadable by any
// client). A key is shown once, when an administrator creates it.

export type Capability = 'kiosk' | 'attendance';

export function newDeviceKey(): string {
  return 'cmk_' + randomBytes(24).toString('base64url');
}

export function hashDeviceKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export interface Device {
  id: string;
  name: string;
  kioskConfigId: string;
  capabilities: Capability[];
}

const recentlySeen = new Map<string, number>();

export async function requireDevice(req: Request, capability: Capability): Promise<Device> {
  const header = req.headers.get('authorization') ?? '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!/^cmk_[A-Za-z0-9_-]{20,64}$/.test(key)) throw new HttpError(401, 'Missing or malformed device key.');
  const { db } = adminServices();
  const snap = await db.collection('kioskDevices').where('keyHash', '==', hashDeviceKey(key)).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || doc.data().active !== true) throw new HttpError(401, 'Unknown or revoked device key.');
  const data = doc.data();
  if (!(data.capabilities ?? []).includes(capability)) throw new HttpError(403, `This device is not allowed to use ${capability}.`);
  // Record activity at most once a minute per device.
  if (Date.now() - (recentlySeen.get(doc.id) ?? 0) > 60_000) {
    recentlySeen.set(doc.id, Date.now());
    doc.ref.update({ lastSeenAt: FieldValue.serverTimestamp() }).catch(() => {});
  }
  return { id: doc.id, name: data.name, kioskConfigId: data.kioskConfigId ?? 'default', capabilities: data.capabilities };
}
