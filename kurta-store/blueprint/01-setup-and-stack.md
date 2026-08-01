# 01 — Project Setup & Stack

Scaffold a new Next.js 16 App Router project and wire up every piece of shared infrastructure before any feature work begins. This establishes the conventions files 02–09 depend on.

## 1. Scaffold

```
npx create-next-app@latest --typescript --app --tailwind --eslint --src-dir --import-alias "@/*"
```

- App Router only — never create a `pages/` directory.
- Path alias `@/*` → `./src/*` in `tsconfig.json`.
- Tailwind v4: **do not** create `tailwind.config.js`/`.ts`. Tailwind v4 is CSS-native — configure via `@theme` directives directly inside `src/app/globals.css`. `postcss.config.mjs` only needs the `@tailwindcss/postcss` plugin.

## 2. Dependencies

Install exactly these (grouped by purpose — keep versions current-major, don't pin to the exact patch versions below unless reproducing the source project verbatim):

**Database / ORM**
```
mysql2 drizzle-orm
drizzle-kit (dev)
```

**Auth**
```
next-auth@beta        # v5 (beta.31+) — v4 API differs significantly, don't mix docs
```

**Payments**
```
razorpay
```

**Cache / rate limiting**
```
@upstash/redis @upstash/ratelimit
```

**Media (self-hosted, no CDN)**
```
sharp
fluent-ffmpeg ffmpeg-static @ffprobe-installer/ffprobe
@types/fluent-ffmpeg (dev)
```

**Email**
```
nodemailer
@types/nodemailer (dev)
```

**Styling helpers**
```
clsx tailwind-merge
```

**Animation / UX**
```
framer-motion gsap lenis embla-carousel-react
```

**Validation**
```
zod
```

**Scripts tooling**
```
ts-node tsconfig-paths dotenv (all dev)
```

## 3. Config files

### `next.config.ts`
```ts
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'"].join('; ') },
];

const nextConfig: NextConfig = {
  // sharp/ffmpeg-static/ffprobe are native-addon/binary-path packages. Bundling
  // them (webpack or Turbopack) breaks native binding resolution — keep them
  // external so Next resolves them via plain Node `require` at runtime.
  serverExternalPackages: ['sharp', 'fluent-ffmpeg', 'ffmpeg-static', '@ffprobe-installer/ffprobe'],
  experimental: {
    optimizePackageImports: ['framer-motion', 'gsap'],
    // Next's default 10MB request-body cap silently truncates video uploads —
    // raise to match whatever your video upload route enforces (this project uses 160MB).
    middlewareClientMaxBodySize: 160 * 1024 * 1024,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
```

### `drizzle.config.ts`
```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

### `package.json` scripts
```json
{
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build --webpack",
    "start": "next start -p $PORT",
    "lint": "eslint",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```
Note `build` explicitly opts **out** of Turbopack (`--webpack`) — this project's sharp-loading trick (file 04) is built and tested against webpack's `serverExternalPackages` handling; Turbopack's static analysis has historically stubbed native-addon requires to `{}` even with `serverExternalPackages` set.

## 4. `src/proxy.ts` — reserve the middleware slot

Next.js 16 renamed `middleware.ts` to `proxy.ts` (same `export default`/matcher convention). Create the file now as a stub:

```ts
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
```

File 10 fills this in with real per-route-class rate limiting. Do not put auth logic here — this project's auth protection is per-page/per-route (see file 03), not middleware-based.

## 5. Environment variables

Create `.env.local.example` documenting every var by name (never commit real secrets):

```
# Database
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DB_NAME?connection_limit=10&pool_timeout=20"

# Self-hosted media (replaces Cloudinary/S3) — absolute path OUTSIDE the git
# checkout in production so redeploys never wipe uploads. Unset in dev (defaults to ./uploads).
MEDIA_DIR="/var/www/yourapp/shared/uploads"

# Upstash Redis (optional — cache + rate limiting fall back gracefully without it)
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Admin bearer-token auth for server-to-server API calls
ADMIN_SECRET_KEY=""
# Internal-only route guard (e.g. protects order creation from direct browser hits)
INTERNAL_API_KEY=""

# NextAuth
AUTH_SECRET=""

# Razorpay — REQUIRED for checkout; missing these makes payment routes return 503
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
NEXT_PUBLIC_RAZORPAY_KEY_ID=""

# Email — SMTP preferred, Gmail as fallback, console-log in dev if both unset
SMTP_HOST=""
SMTP_PORT=""
SMTP_SECURE=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
EMAIL_USER=""
EMAIL_PASS=""

# Cron endpoint auth (external crontab hits /api/cron/* with this bearer token)
CRON_SECRET=""

# Delhivery fulfillment (optional — every export no-ops gracefully until set)
DELHIVERY_API_TOKEN=""
DELHIVERY_API_BASE_URL="https://track.delhivery.com"
DELHIVERY_PICKUP_LOCATION=""
DELHIVERY_PICKUP_PINCODE=""
DELHIVERY_WEBHOOK_TOKEN=""
DELHIVERY_WEBHOOK_HEADER_NAME="x-api-key"
DELHIVERY_DEFAULT_BOX_LENGTH_CM="30"
DELHIVERY_DEFAULT_BOX_BREADTH_CM="25"
DELHIVERY_DEFAULT_BOX_HEIGHT_CM="5"
DELHIVERY_DEFAULT_ITEM_WEIGHT_GRAMS="300"

# Rate-limiting IP resolution — number of trusted reverse proxies in front of the app
TRUSTED_PROXY_HOPS="1"

# Optional: currency conversion + analytics
NEXT_PUBLIC_EXCHANGE_RATE_API_KEY=""
NEXT_PUBLIC_GA4_MEASUREMENT_ID=""
NEXT_PUBLIC_META_PIXEL_ID=""
```

## Verification

- `npm run dev` starts without error on the configured port.
- `npm run build` completes using webpack (not Turbopack).
- `.env.local.example` has no real secrets; a copied `.env.local` with dummy values still lets the app boot (every third-party integration must degrade gracefully when unconfigured — this is a running theme through files 03–08).
