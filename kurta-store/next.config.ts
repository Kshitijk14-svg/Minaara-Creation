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
  serverExternalPackages: ['sharp'],
  experimental: {
    optimizePackageImports: ['framer-motion', 'gsap'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
