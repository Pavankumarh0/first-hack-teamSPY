import path from 'node:path';
import type { NextConfig } from 'next';

// The site imports the shared schema from ../../firebase, so the bundler's
// root is the repository root.
const repoRoot = path.resolve(process.cwd(), '..', '..');

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  serverExternalPackages: ['firebase-admin'],
  // A separate build folder for the emulator test build (e2e/run.sh).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Geolocation only for this site itself: live campus directions (on the device only).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
      {
        // Both association files must be served as JSON, unredirected.
        source: '/.well-known/:file*',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default nextConfig;
