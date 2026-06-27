'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
} from 'react';
import type { CartItem } from '@/types/schema';

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: { productId: string; size: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; size: string; quantity: number } }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; payload: CartItem[] };

interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clear: () => void;
  totalItems: number;
  subtotalINR: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'minaara_cart';

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.payload };

    case 'ADD_ITEM': {
      const existing = state.items.find(
        (i) => i.productId === action.payload.productId && i.size === action.payload.size,
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === action.payload.productId && i.size === action.payload.size
              ? { ...i, quantity: i.quantity + action.payload.quantity }
              : i,
          ),
        };
      }
      return { items: [...state.items, action.payload] };
    }

    case 'REMOVE_ITEM':
      return {
        items: state.items.filter(
          (i) => !(i.productId === action.payload.productId && i.size === action.payload.size),
        ),
      };

    case 'UPDATE_QUANTITY':
      if (action.payload.quantity <= 0) {
        return {
          items: state.items.filter(
            (i) => !(i.productId === action.payload.productId && i.size === action.payload.size),
          ),
        };
      }
      return {
        items: state.items.map((i) =>
          i.productId === action.payload.productId && i.size === action.payload.size
            ? { ...i, quantity: action.payload.quantity }
            : i,
        ),
      };

    case 'CLEAR':
      return { items: [] };

    default:
      return state;
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[];
        dispatch({ type: 'HYDRATE', payload: parsed });
      }
    } catch {
      // Ignore parse errors — start with empty cart
    }
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Ignore storage errors
    }
  }, [state.items]);

  // Sync to server for abandon-cart recovery (logged-in users only)
  useEffect(() => {
    const handleUnload = () => {
      if (state.items.length === 0) return;
      // sendBeacon is fire-and-forget — safe on page unload
      navigator.sendBeacon(
        '/api/cart/sync',
        new Blob([JSON.stringify({ items: state.items })], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [state.items]);

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
  }, []);

  const removeItem = useCallback((productId: string, size: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { productId, size } });
  }, []);

  const updateQuantity = useCallback((productId: string, size: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { productId, size, quantity } });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const totalItems = state.items.reduce((acc, item) => acc + item.quantity, 0);
  const subtotalINR = state.items.reduce((acc, item) => acc + item.priceINR * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items: state.items, addItem, removeItem, updateQuantity, clear, totalItems, subtotalINR }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
