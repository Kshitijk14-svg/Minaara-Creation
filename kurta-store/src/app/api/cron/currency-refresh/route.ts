import { NextRequest, NextResponse } from 'next/server';
import { redis, redisConfigured } from '@/lib/redis';
import { fetchLiveRates as fetchFreshRates, CURRENCY_CACHE_KEY as CACHE_KEY } from '@/lib/exchangeRates';
import type { CurrencyRates } from '@/types/schema';

/**
 * GET /api/cron/currency-refresh
 *
 * Fetches fresh INR→USD/EUR rates from exchangerate-api.com and stores
 * them in Upstash Redis so every page load uses today's rates.
 *
 * Secured with Bearer token (CRON_SECRET env var).
 *
 * Set up as a daily Linux cron on the VPS:
 *   0 2 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" \
 *     https://labelminara.com/api/cron/currency-refresh >> /var/log/currency-refresh.log 2>&1
 */
export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Fetch ─────────────────────────────────────────────────────────
  let rates: CurrencyRates;
  try {
    rates = await fetchFreshRates();
  } catch (err) {
    console.error('[currency-refresh] Failed to fetch rates:', err);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rates', detail: String(err) },
      { status: 502 },
    );
  }

  // ── Store in Redis ────────────────────────────────────────────────
  if (redisConfigured) {
    try {
      await redis.set(CACHE_KEY, rates);
      console.log('[currency-refresh] Stored in Redis:', rates);
    } catch (err) {
      // Don't fail the cron — just log
      console.error('[currency-refresh] Redis store failed:', err);
    }
  } else {
    console.warn('[currency-refresh] Redis not configured — rates fetched but not cached server-side.');
  }

  return NextResponse.json({
    success: true,
    rates,
    redisStored: redisConfigured,
    fetchedAt: new Date(rates.fetchedAt).toISOString(),
  });
}
