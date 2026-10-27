import { handle, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii } from '@/lib/server/campus';
import { publicEnv } from '@/lib/env';

export const GET = handle(async (req: Request) => {
  const { configId, config } = await kioskRequest(req, null);
  return json({
    kiosk: {
      id: configId,
      name: ascii(config.name, 60),
      welcomeText: ascii(config.welcomeText, 280),
      enabledActions: config.enabledActions,
      locationId: config.locationId,
    },
    siteUrl: publicEnv.siteUrl,
  });
});
