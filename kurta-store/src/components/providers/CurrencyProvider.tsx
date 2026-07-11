'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { Currency, CurrencyRates } from '@/types/schema';

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  convertPrice: (priceINR: number) => number;
  rates: CurrencyRates | null;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const CACHE_KEY = 'currency_rates_local';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function fetchRatesFromExchangeApi(): Promise<CurrencyRates> {
  const apiKey = process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_KEY;
  const url = apiKey
    ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/INR`
    : 'https://api.exchangerate-api.com/v4/latest/INR';

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Exchange rate API error: ${res.status}, using fallback rates.`);
      return { INR: 1, USD: 0.012, EUR: 0.011, fetchedAt: Date.now() };
    }
    const data = (await res.json()) as {
      rates: Record<string, number>;
      conversion_rates?: Record<string, number>;
    };

    const rateMap = data.conversion_rates ?? data.rates;
    if (!rateMap?.USD || !rateMap?.EUR || !rateMap?.INR) {
      console.warn('Unexpected exchange rate API response structure, using fallback rates.');
      return { INR: 1, USD: 0.012, EUR: 0.011, fetchedAt: Date.now() };
    }

    return {
      INR: rateMap.INR ?? 1,
      USD: rateMap.USD,
      EUR: rateMap.EUR,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn('Failed to fetch exchange rates (network error), using fallback rates.');
    return { INR: 1, USD: 0.012, EUR: 0.011, fetchedAt: Date.now() };
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('INR');
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      try {
        // 1. Check Upstash Redis via our API route first
        const redisRes = await fetch('/api/currency-rates');
        if (redisRes.ok) {
          const cached = (await redisRes.json()) as CurrencyRates;
          const isStale = Date.now() - cached.fetchedAt > TWENTY_FOUR_HOURS_MS;
          if (!isStale) {
            if (!cancelled) {
              setRates(cached);
              setIsLoading(false);
            }
            return;
          }
        }

        // 2. Check localStorage for stale-while-revalidate
        const localCached = localStorage.getItem(CACHE_KEY);
        if (localCached) {
          const parsed = JSON.parse(localCached) as CurrencyRates;
          const isStale = Date.now() - parsed.fetchedAt > TWENTY_FOUR_HOURS_MS;
          if (!isStale) {
            if (!cancelled) {
              setRates(parsed);
              setIsLoading(false);
            }
            return;
          }
        }

        // 3. Fetch fresh rates
        const freshRates = await fetchRatesFromExchangeApi();
        localStorage.setItem(CACHE_KEY, JSON.stringify(freshRates));

        // Store in Upstash via our API route
        await fetch('/api/currency-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(freshRates),
        });

        if (!cancelled) {
          setRates(freshRates);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[CurrencyProvider] Failed to load exchange rates:', err);
        }
        // Fallback rates (approximate) so app doesn't break without an API key
        if (!cancelled) {
          setRates({ INR: 1, USD: 0.012, EUR: 0.011, fetchedAt: Date.now() });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadRates();
    return () => { cancelled = true; };
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
  }, []);

  const convertPrice = useCallback(
    (priceINR: number): number => {
      if (!rates) return priceINR;
      // INR rate from API is always 1 (base is INR), so: price_in_target = priceINR * rates[target]
      return priceINR * (rates[currency] ?? 1);
    },
    [rates, currency],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, setCurrency, convertPrice, rates, isLoading }),
    [currency, setCurrency, convertPrice, rates, isLoading],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return ctx;
}
