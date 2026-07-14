import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Collection } from '@/types/schema';
import { StorefrontKeys } from '@/lib/cache';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'All Collections | Minara Creation',
  description: 'Browse every curated collection of artisanal Indian womenswear from Minara Creation.',
};

const withTimeout = <T,>(p: Promise<T>, ms = 1500): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('DB Timeout')), ms))]);

async function getAllCollections(): Promise<Collection[]> {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.DATABASE_URL?.includes('password@localhost')
  ) {
    return [];
  }

  const CACHE_KEY = StorefrontKeys.allCollections;

  try {
    const { redis } = await import('@/lib/redis');
    const cached = await redis.get<{ collections: Collection[] }>(CACHE_KEY);
    if (cached?.collections) return cached.collections;
  } catch {}

  try {
    const { db } = await import('@/db/index');
    const { collections } = await import('@/db/schema');
    const { asc, eq } = await import('drizzle-orm');

    const rows = await withTimeout(
      db.select({
        id: collections.id, name: collections.name, slug: collections.slug,
        description: collections.description, imageUrl: collections.imageUrl,
        isActive: collections.isActive, sortOrder: collections.sortOrder,
        createdAt: collections.createdAt, updatedAt: collections.updatedAt,
      })
        .from(collections)
        .where(eq(collections.isActive, true))
        .orderBy(asc(collections.sortOrder), asc(collections.name))
    );

    const formatted: Collection[] = rows.map((c) => ({
      ...c,
      description: c.description ?? undefined,
      imageUrl:    c.imageUrl ?? undefined,
      createdAt:   c.createdAt.toISOString(),
      updatedAt:   c.updatedAt.toISOString(),
    }));

    if (formatted.length > 0) {
      const { redis } = await import('@/lib/redis');
      await redis.set(CACHE_KEY, { collections: formatted }, { ex: 600 }).catch(() => {});
    }

    return formatted;
  } catch (e) {
    console.warn('DB error fetching all collections (fallback to empty):', (e as Error).message);
    return [];
  }
}

export default async function CollectionsPage() {
  const collections = await getAllCollections();

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', padding: '120px 0 80px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8C6F63', marginBottom: '8px', fontWeight: 500 }}>Curated for you</p>
          <h1 style={{ fontSize: 'clamp(2rem,3.5vw,3rem)', fontWeight: 300, color: '#1A1A1A', margin: 0 }}>All Collections</h1>
        </div>

        {collections.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(26,26,26,0.35)' }}>No collections available yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', columnGap: '24px', rowGap: '40px' }}>
            {collections.map((collection) => (
              <Link key={collection.id} href={`/collection/${collection.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#F4ECE1' }}>
                  {collection.imageUrl ? (
                    <Image src={collection.imageUrl} alt={collection.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 260px" />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(26,26,26,0.25)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Minara</div>
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)' }} />
                  <h3 style={{ position: 'absolute', bottom: '18px', left: '18px', right: '18px', fontSize: '1.1rem', fontWeight: 400, color: '#fff', margin: 0, fontFamily: 'var(--font-body)' }}>{collection.name}</h3>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
