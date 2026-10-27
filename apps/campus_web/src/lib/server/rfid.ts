import 'server-only';
import { createHmac } from 'node:crypto';
import { serverEnv } from './config';
import { HttpError } from './http';

// A card UID is stored only as HMAC-SHA256(secret, UID): the rfidCards
// document id. Without the server secret the stored value cannot be turned
// back into a UID, or matched against a UID read from a lost card list.
export function cardKey(normalizedUid: string): string {
  if (serverEnv.rfidUidSecret.length < 32)
    throw new HttpError(503, 'RFID_UID_HMAC_SECRET is not set (32+ characters).');
  return createHmac('sha256', serverEnv.rfidUidSecret).update(normalizedUid, 'utf8').digest('hex');
}
