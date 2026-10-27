import 'server-only';
import { adminServices } from './admin';
import { requireDevice } from './devices';
import { HttpError } from './http';

export interface KioskContext {
  deviceId: string;
  configId: string;
  config: {
    name: string;
    welcomeText: string;
    enabledActions: string[];
    navNodeId: string | null;
    locationId: string | null;
    announcementsLimit: number;
    featuredLocationIds: string[];
  };
}

/** Authenticates the kiosk and checks that the action is switched on for it. */
export async function kioskRequest(req: Request, action: string | null): Promise<KioskContext> {
  const device = await requireDevice(req, 'kiosk');
  const snap = await adminServices().db.doc(`kioskConfig/${device.kioskConfigId}`).get();
  if (!snap.exists) throw new HttpError(503, `Kiosk configuration "${device.kioskConfigId}" does not exist.`);
  const c = snap.data()!;
  const config = {
    name: c.name ?? 'Campus kiosk',
    welcomeText: c.welcomeText ?? '',
    enabledActions: c.enabledActions ?? [],
    navNodeId: c.navNodeId ?? null,
    locationId: c.locationId ?? null,
    announcementsLimit: c.announcementsLimit ?? 3,
    featuredLocationIds: c.featuredLocationIds ?? [],
  };
  if (action && !config.enabledActions.includes(action))
    throw new HttpError(403, `The "${action}" action is switched off for this kiosk.`);
  return { deviceId: device.id, configId: device.kioskConfigId, config };
}
