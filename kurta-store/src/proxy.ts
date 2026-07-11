import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, redisConfigured } from '@/lib/redis';
import { MemoryRatelimit, type Limiter } from '@/lib/rate-limit-fallback';

// Distributed limiting via Upstash when configured; per-process in-memory
// sliding window otherwise so limited routes (incl. the fail-closed ones)
// keep working without Redis.
function makeLimiter(max: number, windowSecs: number, prefix: string): Limiter {
  if (!redisConfigured) return new MemoryRatelimit(max, windowSecs * 1000, prefix);
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${windowSecs} s`),
    prefix,
    analytics: false,
  });
}

// Separate limiters per endpoint class so one burst doesn't starve others
const orderLimiter = makeLimiter(5, 60, 'rl:orders');
const otpLimiter = makeLimiter(5, 600, 'rl:otp');
const searchLimiter = makeLimiter(30, 60, 'rl:search');
const generalLimiter = makeLimiter(60, 60, 'rl:general');

/**
 * Resolve the client IP for rate limiting.
 *
 * NOTE: X-Forwarded-For is only trustworthy when the app sits behind a proxy
 * that overwrites it (Vercel, Cloudflare, an ALB, etc.). Set TRUSTED_PROXY_HOPS
 * to the number of trusted proxies in front of the app so we take the correct
 * hop from the right and ignore any client-spoofed prefix. Defaults to the
 * platform's single-hop behaviour (rightmost entry).
 */
function getIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1);
      // Count `hops` in from the right — these are added by trusted infra; anything
      // further left may be attacker-supplied and must not be used as the key.
      const idx = Math.max(0, parts.length - hops);
      return parts[idx];
    }
  }
  return request.headers.get('x-real-ip') ?? 'anonymous';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  let limiter: Limiter | null = null;
  // Sensitive limiters (abuse of these enables account takeover / fraud) fail
  // CLOSED on a limiter outage; best-effort limiters fail open for availability.
  let failClosed = false;

  if (pathname === '/api/orders' && method === 'POST') {
    limiter = orderLimiter;
    failClosed = true;
  } else if (pathname === '/api/auth/send-otp' && method === 'POST') {
    limiter = otpLimiter;
    failClosed = true;
  } else if (pathname === '/api/auth/callback/credentials' && method === 'POST') {
    // OTP verification — brute-force surface, throttle + fail closed.
    limiter = otpLimiter;
    failClosed = true;
  } else if (pathname === '/api/search' && method === 'GET') {
    limiter = searchLimiter;
  } else if (['POST', 'PATCH', 'DELETE'].includes(method) && pathname.startsWith('/api/')) {
    limiter = generalLimiter;
  }

  if (limiter) {
    const ip = getIp(request);
    try {
      const { success, limit, remaining, reset } = await limiter.limit(ip);
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000);
        return NextResponse.json(
          { error: 'Too many requests', retryAfter },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'Retry-After': String(retryAfter),
            },
          },
        );
      }
    } catch {
      if (failClosed) {
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503, headers: { 'Retry-After': '30' } },
        );
      }
      // Best-effort limiter — allow through to preserve availability.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
