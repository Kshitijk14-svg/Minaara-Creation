import { NextResponse } from 'next/server';
import { redis, redisConfigured } from '@/lib/redis';
import { fetchLiveRates, CURRENCY_CACHE_KEY as CACHE_KEY } from '@/lib/exchangeRates';
import type { CurrencyRates } from '@/types/schema';

// GET /api/currency-rates — returns cached rates from Upstash (or fetches live if cache is empty)
export async function GET() {
  if (!redisConfigured) {
    // No Redis — fetch live directly so the client always gets real rates
    try {
      const live = await fetchLiveRates();
      return NextResponse.json(live);
    } catch {
      return NextResponse.json({ error: 'No cached rates' }, { status: 404 });
    }
  }

  try {
    const cached = await redis.get<CurrencyRates>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Cache miss — fetch live and warm the cache
    try {
      const live = await fetchLiveRates();
      await redis.set(CACHE_KEY, live);
      return NextResponse.json(live);
    } catch {
      return NextResponse.json({ error: 'No cached rates' }, { status: 404 });
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/currency-rates]', err);
    }
    return NextResponse.json({ error: 'Failed to fetch cached rates' }, { status: 500 });
  }
}
