import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { redis } from '@/lib/redis';
import type { CurrencyRates } from '@/types/schema';

const CACHE_KEY = 'currency_rates';

const CurrencyRatesSchema = z.object({
  INR: z.number(),
  USD: z.number(),
  EUR: z.number(),
  fetchedAt: z.number(),
});

// GET /api/currency-rates — returns cached rates from Upstash
export async function GET() {
  try {
    const cached = await redis.get<CurrencyRates>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }
    return NextResponse.json({ error: 'No cached rates' }, { status: 404 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/currency-rates]', err);
    }
    return NextResponse.json({ error: 'Failed to fetch cached rates' }, { status: 500 });
  }
}

// POST /api/currency-rates — stores fresh rates in Upstash (called from CurrencyProvider)
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = CurrencyRatesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid rates data' }, { status: 400 });
    }

    // Validate rate ranges (INR is base = 1, USD/EUR are per-INR fractions)
    const { INR, USD, EUR, fetchedAt } = parsed.data;
    const now = Date.now();
    if (
      INR < 0.5 || INR > 2 ||
      USD < 0.001 || USD > 0.1 ||
      EUR < 0.001 || EUR > 0.1 ||
      fetchedAt > now + 60_000 || fetchedAt < now - 48 * 60 * 60 * 1000
    ) {
      return NextResponse.json({ error: 'Rate values out of acceptable range' }, { status: 422 });
    }

    await redis.set(CACHE_KEY, parsed.data);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[POST /api/currency-rates]', err);
    }
    return NextResponse.json({ error: 'Failed to store rates' }, { status: 500 });
  }
}
