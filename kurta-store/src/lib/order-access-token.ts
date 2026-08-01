import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signs the /order/success/[id] link so a leaked/forwarded URL can't reveal
 * an order's PII (name, address, phone, email) forever — only the owning
 * logged-in user or a holder of a valid, time-bounded token can view it.
 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secret(): string {
  const s = process.env.ORDER_ACCESS_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error('ORDER_ACCESS_TOKEN_SECRET or AUTH_SECRET must be set');
  return s;
}

function sign(orderId: string, expiresAtMs: number): string {
  return createHmac('sha256', secret()).update(`${orderId}.${expiresAtMs}`).digest('hex');
}

export function signOrderAccessToken(orderId: string): string {
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  return `${expiresAtMs}.${sign(orderId, expiresAtMs)}`;
}

export function verifyOrderAccessToken(orderId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const expiresAtMs = Number(token.slice(0, dotIndex));
  const providedSig = token.slice(dotIndex + 1);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const expectedSig = sign(orderId, expiresAtMs);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
