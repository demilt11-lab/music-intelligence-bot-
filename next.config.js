/** @type {import('next').NextConfig} */

// CORS: explicit allowlist — never default to wildcard.
// Set ALLOWED_ORIGIN to your frontend domain in all environments.
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

// CSP is now set per-request in proxy.ts middleware with a unique nonce,
// replacing the static unsafe-inline that was here previously.

const nextConfig = {
  // Security + CORS headers on every response
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      // API routes: CORS + no-cache (data is real-time)
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: allowedOrigin,
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PATCH, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, x-api-key, x-request-id',
          },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },

  // Allow cover art from any HTTPS CDN (Spotify, YouTube, etc.)
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },

  compress: true,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  // Keep Prisma out of the bundle (stable replacement for the former
  // experimental.serverComponentsExternalPackages)
  serverExternalPackages: ['@prisma/client', 'prisma'],
};

module.exports = nextConfig;
