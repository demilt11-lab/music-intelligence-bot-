/** @type {import('next').NextConfig} */

// CORS: explicit allowlist — never default to wildcard.
// Set ALLOWED_ORIGIN to your frontend domain in all environments.
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

// CSP: production removes unsafe-eval (webpack dev server needs it locally).
// NOTE: unsafe-inline for script-src is required by Next.js for inline hydration
// scripts. Full removal requires implementing per-request nonces — tracked as
// a future hardening task. unsafe-eval is removed in production unconditionally.
const isProd = process.env.NODE_ENV === 'production';
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";

const nextConfig = {
  // Security + CORS headers on every response
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
            ].join('; '),
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
