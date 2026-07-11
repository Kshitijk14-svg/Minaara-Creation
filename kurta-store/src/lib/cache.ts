/**
 * Tag-based Redis cache helper wrapping Upstash Redis.
 *
 * Strategy:
 *  - Each cache entry is stored at its key with a TTL.
 *  - Tags are stored as Redis Sets (key = "tag:{tag}", members = cache keys).
 *  - Invalidating a tag deletes all member keys atomically via a pipeline.
 *
 * This eliminates dangerous O(N) KEYS/SCAN operations.
 */
import { redis } from '@/lib/redis';

const TAG_PREFIX = 'tag:';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Store a value in cache, associated with one or more tags for grouped invalidation.
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  tags: string[],
  ttlSeconds: number,
): Promise<void> {
  try {
    const pipeline = redis.pipeline();
    pipeline.set(key, JSON.stringify(value), { ex: ttlSeconds });
    for (const tag of tags) {
      // SADD tag→key mapping; expire tag set slightly longer than data TTL
      pipeline.sadd(`${TAG_PREFIX}${tag}`, key);
      pipeline.expire(`${TAG_PREFIX}${tag}`, ttlSeconds + 60);
    }
    await pipeline.exec();
  } catch {
    // Cache failures are non-fatal — silently swallow
  }
}

/**
 * Retrieve a cached value. Returns null on miss or error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get<string>(key);
    if (raw == null) return null;
    // Upstash may auto-deserialise JSON; handle both cases
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    return raw as T;
  } catch {
    return null;
  }
}

/**
 * Invalidate a single cache key directly.
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // non-fatal
  }
}

/**
 * Invalidate all cache keys associated with a tag.
 * Uses a pipeline — atomic, O(members) not O(total keyspace).
 */
export async function invalidateTag(tag: string): Promise<void> {
  try {
    const tagKey = `${TAG_PREFIX}${tag}`;
    const members = await redis.smembers(tagKey);
    if (!members || members.length === 0) return;

    const pipeline = redis.pipeline();
    for (const key of members) pipeline.del(key);
    pipeline.del(tagKey);
    await pipeline.exec();
  } catch {
    // non-fatal
  }
}

/**
 * Invalidate multiple tags at once.
 */
export async function invalidateTags(tags: string[]): Promise<void> {
  try {
    const tagKeys = tags.map((tag) => `${TAG_PREFIX}${tag}`);

    // Fetch all tag members in parallel instead of sequentially
    const memberArrays = await Promise.all(tagKeys.map((k) => redis.smembers(k)));

    const allKeys = [...new Set(memberArrays.flat())];
    if (allKeys.length === 0 && tagKeys.length === 0) return;

    const pipeline = redis.pipeline();
    for (const key of allKeys) pipeline.del(key);
    for (const tagKey of tagKeys) pipeline.del(tagKey);
    await pipeline.exec();
  } catch {
    // non-fatal
  }
}

// ── Storefront (hand-rolled) caches ───────────────────────────────────────────
// The home page, collection landing, and design config cache directly via redis
// (outside the tag system) for build-time resilience. These helpers let mutation
// routes purge them so edits show up immediately instead of after the TTL.

export const StorefrontKeys = {
  homeProducts:       'products_list:all:true:20:0',
  collectionProducts: 'products_list:all:all:100:0',
  homeNewArrivals:    'products_list:new-arrivals:true:8:0',
  homeBestsellers:    'products_list:bestsellers:true:8:0',
  homeFeatured:       'products_list:featured:true:8:0',
  homeCollections:    'collections_list:home:8:0',
  homeTestimonials:   'testimonials_list:home',
} as const;

/** Purge the homepage testimonials cache. Call after any testimonial mutation. */
export async function invalidateStorefrontTestimonials(): Promise<void> {
  try {
    await redis.del(StorefrontKeys.homeTestimonials);
  } catch {
    // non-fatal
  }
}

/** Purge home + collection-landing product caches. Call after any product/collection mutation. */
export async function invalidateStorefrontProducts(): Promise<void> {
  try {
    await redis.del(
      StorefrontKeys.homeProducts,
      StorefrontKeys.collectionProducts,
      StorefrontKeys.homeNewArrivals,
      StorefrontKeys.homeBestsellers,
      StorefrontKeys.homeFeatured,
      StorefrontKeys.homeCollections,
    );
  } catch {
    // non-fatal
  }
}

// ── Cache Key Factories ──────────────────────────────────────────────────────
// Centralised so key patterns never drift between set and invalidate calls.

export const CacheKeys = {
  products: {
    list: (params: string) => `products:list:${params}`,
    single: (id: string) => `products:single:${id}`,
  },
  collections: {
    list: () => 'collections:list',
    single: (id: string) => `collections:single:${id}`,
    products: (id: string, cursor: string) => `collections:${id}:products:${cursor}`,
  },
  orders: {
    adminList: (params: string) => `orders:admin:${params}`,
    userList: (userId: string, params: string) => `orders:user:${userId}:${params}`,
    single: (id: string) => `orders:single:${id}`,
  },
  coupons: {
    list: (params: string) => `coupons:list:${params}`,
    byCode: (code: string) => `coupons:code:${code}`,
  },
} as const;

export const CacheTags = {
  products: 'products',
  product: (id: string) => `product:${id}`,
  collections: 'collections',
  collection: (id: string) => `collection:${id}`,
  orders: 'orders',
  ordersByUser: (userId: string) => `orders:user:${userId}`,
  orderSingle: (id: string) => `order:${id}`,
  coupons: 'coupons',
} as const;
