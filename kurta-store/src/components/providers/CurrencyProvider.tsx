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
const FALLBACK_RATES: CurrencyRates = { INR: 1, USD: 0.012, EUR: 0.011, fetchedAt: Date.now() };

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('INR');
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      try {
        // 1. Ask our API route — it serves the Redis cache, or (on a miss)
        // fetches live rates itself and warms the cache server-side.
        const res = await fetch('/api/currency-rates');
        if (res.ok) {
          const rates = (await res.json()) as CurrencyRates;
          localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
          if (!cancelled) setRates(rates);
          return;
        }

        // 2. Server route failed (network down, API down, etc.) — fall back
        // to whatever we last cached locally, even if stale.
        const localCached = localStorage.getItem(CACHE_KEY);
        if (localCached) {
          const parsed = JSON.parse(localCached) as CurrencyRates;
          if (!cancelled) setRates(parsed);
          return;
        }

        // 3. Nothing available anywhere — approximate fallback so the app doesn't break.
        if (!cancelled) setRates(FALLBACK_RATES);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[CurrencyProvider] Failed to load exchange rates:', err);
        }
        if (!cancelled) {
          setRates(FALLBACK_RATES);
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
