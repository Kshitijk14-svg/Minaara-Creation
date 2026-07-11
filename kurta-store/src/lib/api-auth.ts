/**
 * Shared auth utilities for API route handlers.
 * Centralises the "Bearer token OR session role" check to avoid copy-pasting.
 */
import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { auth } from '@/lib/auth';

export type AuthLevel = 'admin' | 'staff_or_above' | 'any_logged_in';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
const STAFF_OR_ABOVE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF'] as const;

/**
 * Constant-time string comparison. Returns false if either side is empty/unset,
 * so a missing env secret can never be matched by an empty header.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * True only for a trusted server-to-server caller presenting the internal key.
 * Used to gate endpoints (e.g. order creation) that must never be hit directly
 * by a browser.
 */
export function isInternalRequest(request: NextRequest): boolean {
  return safeEqual(request.headers.get('x-internal-key'), process.env.INTERNAL_API_KEY);
}

/**
 * Returns true if the request carries a valid admin Bearer token
 * OR a session with sufficient role level.
 */
export async function isAuthorized(
  request: NextRequest,
  level: AuthLevel = 'staff_or_above',
): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  const adminSecret = process.env.ADMIN_SECRET_KEY;

  if (adminSecret && authHeader?.startsWith('Bearer ') && safeEqual(authHeader.slice(7), adminSecret)) {
    return true;
  }

  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!role) return false;

  if (level === 'staff_or_above') {
    return (STAFF_OR_ABOVE_ROLES as readonly string[]).includes(role);
  }
  if (level === 'admin') {
    return (ADMIN_ROLES as readonly string[]).includes(role);
  }
  if (level === 'any_logged_in') {
    return !!session?.user;
  }
  return false;
}

/**
 * Returns the current session's userId, or null if not logged in.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as any)?.id ?? null;
}

/**
 * Returns the current session, or null.
 */
export async function getSession() {
  return auth();
}
