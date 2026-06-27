import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Separate limiters per endpoint class so one burst doesn't starve others
const orderLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'rl:orders',
  analytics: false,
});

const otpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '600 s'),
  prefix: 'rl:otp',
  analytics: false,
});

const searchLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  prefix: 'rl:search',
  analytics: false,
});

const generalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  prefix: 'rl:general',
  analytics: false,
});

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'anonymous'
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  let limiter: Ratelimit | null = null;

  if (pathname === '/api/orders' && method === 'POST') {
    limiter = orderLimiter;
  } else if (pathname === '/api/auth/send-otp' && method === 'POST') {
    limiter = otpLimiter;
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
      // Redis unavailable — fail open to avoid blocking legitimate traffic
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
