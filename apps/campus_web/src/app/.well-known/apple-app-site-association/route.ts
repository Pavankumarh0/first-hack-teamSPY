import { serverEnv } from '@/lib/server/config';

// iOS Universal Links for /campus/* once APPLE_TEAM_ID and IOS_BUNDLE_ID are
// set. Served as JSON with no redirect and no file extension, as iOS requires.
export async function GET() {
  const appIds = serverEnv.appleTeamId && serverEnv.iosBundleId ? [`${serverEnv.appleTeamId}.${serverEnv.iosBundleId}`] : [];
  return Response.json(
    { applinks: { details: appIds.length ? [{ appIDs: appIds, components: [{ '/': '/campus/*' }] }] : [] } },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
