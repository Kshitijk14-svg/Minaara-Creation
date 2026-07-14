import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const; // N = 2^15
const KEY_LENGTH = 64;

// Stored format: scrypt$N$r$p$<salt-b64>$<hash-b64> — self-describing so the
// params can change later without invalidating already-hashed passwords.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

// Always resolves — never throws — so a caller can invoke this unconditionally
// (even with a null/missing stored hash) to keep response timing uniform and
// avoid leaking "this account has no password" via a fast-path return.
export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  const normalized = password.normalize('NFKC');

  if (!stored) {
    // Burn roughly the same amount of time as a real verification so a
    // missing-hash account isn't distinguishable from a wrong-password one.
    await scryptAsync(normalized, randomBytes(16), KEY_LENGTH, PARAMS);
    return false;
  }

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await scryptAsync(normalized, randomBytes(16), KEY_LENGTH, PARAMS);
    return false;
  }

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    await scryptAsync(normalized, randomBytes(16), KEY_LENGTH, PARAMS);
    return false;
  }

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(normalized, salt, expected.length, { N, r, p, maxmem: PARAMS.maxmem });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
