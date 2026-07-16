import type { NextConfig } from 'next';

// Security headers applied to every response. A full script/style CSP with
// per-request nonces is a follow-up; these directives harden clickjacking,
// MIME-sniffing and transport without risking inline-script/style breakage.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'"].join('; '),
  },
];

const nextConfig: NextConfig = {
  // sharp is a native addon (prebuilt .node binary) — bundling it (webpack/
  // Turbopack) breaks its CJS/ESM default export interop. Keep it external
  // so Next resolves it via plain Node `require` at runtime instead.
  // ffmpeg-static/ffprobe-static resolve their bundled binary paths via
  // __dirname, which webpack rewrites when bundled — external for the same
  // reason.
  serverExternalPackages: ['sharp', 'fluent-ffmpeg', 'ffmpeg-static', '@ffprobe-installer/ffprobe'],

  // Next.js enforces a 10MB cap on incoming request bodies before they reach
  // any API route handler. Without this, video files > 10MB are silently
  // truncated, causing ffprobe to see a broken MP4 container and report the
  // file as corrupt. Raise to 160MB here (matching the Nginx client_max_body_size
  // set for /api/upload/video); the route itself enforces the real 150MB limit.
  experimental: {
    optimizePackageImports: ['framer-motion', 'gsap'],
    middlewareClientMaxBodySize: 160 * 1024 * 1024, // 160 MB in bytes
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
