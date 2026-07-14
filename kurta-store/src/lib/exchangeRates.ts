import type { CurrencyRates } from '@/types/schema';

export const CURRENCY_CACHE_KEY = 'currency_rates';

/**
 * Fetches live INR-based exchange rates from exchangerate-api.com.
 * Server-only — callers are API routes (cache-miss warmers and the cron refresh job).
 */
export async function fetchLiveRates(): Promise<CurrencyRates> {
  const apiKey = process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_KEY;
  const url =
    apiKey && apiKey !== 'your_exchange_rate_api_key'
      ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/INR`
      : 'https://api.exchangerate-api.com/v4/latest/INR';

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Exchange rate API: ${res.status}`);

  const data = (await res.json()) as {
    rates?: Record<string, number>;
    conversion_rates?: Record<string, number>;
  };
  const rateMap = data.conversion_rates ?? data.rates;
  if (!rateMap?.USD || !rateMap?.EUR) throw new Error('Unexpected response shape');

  return { INR: 1, USD: rateMap.USD, EUR: rateMap.EUR, fetchedAt: Date.now() };
}
