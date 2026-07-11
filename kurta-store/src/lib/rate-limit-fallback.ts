/**
 * In-memory sliding-window rate limiter, used when Upstash Redis is not
 * configured. Returns the same { success, limit, remaining, reset } shape as
 * @upstash/ratelimit's Ratelimit#limit so call sites accept either
 * implementation. Per-process only — fine for dev and single-instance
 * deploys; distributed limiting resumes once Upstash creds are restored.
 */

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the caller may retry. */
  reset: number;
}

export interface Limiter {
  limit(identifier: string): Promise<LimitResult>;
}

export class MemoryRatelimit implements Limiter {
  private hits = new Map<string, number[]>();
  private lastPrune = Date.now();

  constructor(
    private max: number,
    private windowMs: number,
    private prefix: string,
  ) {}

  async limit(identifier: string): Promise<LimitResult> {
    const now = Date.now();
    this.pruneIfDue(now);

    const key = `${this.prefix}:${identifier}`;
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { success: false, limit: this.max, remaining: 0, reset: recent[0] + this.windowMs };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return {
      success: true,
      limit: this.max,
      remaining: this.max - recent.length,
      reset: now + this.windowMs,
    };
  }

  /** Drop identifiers whose hits have all expired so the map can't grow unbounded. */
  private pruneIfDue(now: number) {
    if (now - this.lastPrune < this.windowMs) return;
    this.lastPrune = now;
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) this.hits.delete(key);
    }
  }
}
