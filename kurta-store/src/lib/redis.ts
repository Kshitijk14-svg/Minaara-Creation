import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * True when Upstash credentials are present. Rate limiters use this to pick
 * between distributed (Upstash) and in-memory fallback limiting.
 */
export const redisConfigured = Boolean(url && token);

/**
 * Stub used when Redis is not configured: every command rejects immediately.
 * All redis call sites wrap commands in try/catch and fail open, so an
 * unconfigured Redis behaves as an instant cache miss instead of an outage.
 */
function createRedisStub(): Redis {
  const reject = () => Promise.reject(new Error('Redis not configured'));
  const pipeline = () => {
    // Builder methods chain (return the pipeline); only exec() rejects.
    const p: object = new Proxy({}, {
      get: (_t, prop) => (prop === 'exec' ? reject : () => p),
    });
    return p;
  };
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined; // keep the stub non-thenable
      if (prop === 'pipeline' || prop === 'multi') return pipeline;
      return reject;
    },
  }) as unknown as Redis;
}

/**
 * Shared Upstash client. Retries are capped low so an unreachable Redis costs
 * well under a second per command instead of the client default (~10s of
 * exponential backoff), since every caller fails open anyway.
 */
export const redis = redisConfigured
  ? new Redis({ url: url!, token: token!, retry: { retries: 1, backoff: () => 300 } })
  : createRedisStub();
