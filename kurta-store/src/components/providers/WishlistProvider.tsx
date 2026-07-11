'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useMemo,
} from 'react';
import type { WishlistItem } from '@/types/schema';

interface WishlistState {
  items: WishlistItem[];
}

type WishlistAction =
  | { type: 'TOGGLE'; payload: WishlistItem }
  | { type: 'REMOVE'; payload: { productId: string } }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; payload: WishlistItem[] };

interface WishlistContextValue {
  items: WishlistItem[];
  toggle: (item: WishlistItem) => void;
  remove: (productId: string) => void;
  has: (productId: string) => boolean;
  clear: () => void;
  count: number;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);
const STORAGE_KEY = 'minaara_wishlist';

function wishlistReducer(state: WishlistState, action: WishlistAction): WishlistState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.payload };

    case 'TOGGLE': {
      const exists = state.items.some((i) => i.productId === action.payload.productId);
      if (exists) {
        return { items: state.items.filter((i) => i.productId !== action.payload.productId) };
      }
      return { items: [...state.items, action.payload] };
    }

    case 'REMOVE':
      return { items: state.items.filter((i) => i.productId !== action.payload.productId) };

    case 'CLEAR':
      return { items: [] };

    default:
      return state;
  }
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(wishlistReducer, { items: [] });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WishlistItem[];
        dispatch({ type: 'HYDRATE', payload: parsed });
      }
    } catch {
      // Ignore parse errors — start with empty wishlist
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Ignore storage errors
    }
  }, [state.items]);

  const toggle = useCallback((item: WishlistItem) => {
    dispatch({ type: 'TOGGLE', payload: item });
  }, []);

  const remove = useCallback((productId: string) => {
    dispatch({ type: 'REMOVE', payload: { productId } });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const value = useMemo<WishlistContextValue>(() => {
    const has = (productId: string) => state.items.some((i) => i.productId === productId);
    return { items: state.items, toggle, remove, has, clear, count: state.items.length };
  }, [state.items, toggle, remove, clear]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return ctx;
}
