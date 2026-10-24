const isDev = process.env.NODE_ENV === 'development';

/**
 * In dev, `next dev` serves the site on :3000 while the Python API runs on :8000,
 * so /api is proxied across. In a production build the site is exported to plain
 * files and served by the Python server itself, where /api is already same-origin.
 * The rewrites key is therefore omitted entirely from the build config -- a static
 * export cannot apply rewrites, and leaving the key in only produces a warning.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,

  ...(isDev && {
    async rewrites() {
      return [{ source: '/api/:path*', destination: 'http://127.0.0.1:8000/api/:path*' }];
    },
  }),
};

export default nextConfig;
