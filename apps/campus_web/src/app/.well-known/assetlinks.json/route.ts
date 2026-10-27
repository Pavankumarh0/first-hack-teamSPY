import { serverEnv } from '@/lib/server/config';

// Android App Links: lets the Campus Mithra app open https://<site>/campus/...
// links directly once ANDROID_APP_PACKAGE and ANDROID_SHA256_CERT_FINGERPRINTS
// are set (docs/QR_DEEP_LINKS.md).
export async function GET() {
  const body = serverEnv.androidPackage && serverEnv.androidCertFingerprints.length
    ? [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: serverEnv.androidPackage,
          sha256_cert_fingerprints: serverEnv.androidCertFingerprints,
        },
      }]
    : [];
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
