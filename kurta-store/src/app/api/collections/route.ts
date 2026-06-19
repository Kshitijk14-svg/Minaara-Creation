/**
 * GET    /api/collections      — list all active collections (public, cached 1h)
 * POST   /api/collections      — create a collection (admin)
 * PATCH  /api/collections      — update a collection (admin)
 * DELETE /api/collections      — deactivate a collection (admin, blocks if products linked)
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthorized } from '@/lib/api-auth';
import {
  cacheGet,
  cacheSet,
  invalidateTags,
  CacheKeys,
  CacheTags,
} from '@/lib/cache';

const COLLECTIONS_TTL = 3600; // 1 hour

const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, digits, hyphens'),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const UpdateCollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const cacheKey = CacheKeys.collections.list();
    if (!includeInactive) {
      const cached = await cacheGet(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const where = includeInactive ? {} : { isActive: true };

    const collections = await db.collection.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { deletedAt: null, isActive: true } } } },
      },
    });

    const result = {
      data: collections.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      total: collections.length,
    };

    if (!includeInactive) {
      await cacheSet(cacheKey, result, [CacheTags.collections], COLLECTIONS_TTL);
    }

    return NextResponse.json(result, {
      headers: includeInactive
        ? {}
        : { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/collections]', err);
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = CreateCollectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const collection = await db.collection.create({ data: parsed.data });

    await invalidateTags([CacheTags.collections]);
    revalidatePath('/');

    return NextResponse.json(
      {
        collection: {
          ...collection,
          createdAt: collection.createdAt.toISOString(),
          updatedAt: collection.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Collection name or slug already exists' }, { status: 409 });
    }
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/collections]', err);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = UpdateCollectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { id, ...updateData } = parsed.data;

    const collection = await db.collection.update({
      where: { id },
      data: { ...updateData, updatedAt: new Date() },
    });

    await invalidateTags([CacheTags.collections, CacheTags.collection(id)]);
    revalidatePath('/');

    return NextResponse.json({
      collection: {
        ...collection,
        createdAt: collection.createdAt.toISOString(),
        updatedAt: collection.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Name or slug already in use' }, { status: 409 });
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/collections]', err);
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Collection ID required' }, { status: 400 });

    // Wrap count + delete/update in a transaction to prevent a race where a new
    // product is linked to this collection between the count read and the hard-delete.
    let message: string;
    await db.$transaction(async (tx) => {
      const totalProductCount = await tx.product.count({ where: { collectionId: id } });
      if (totalProductCount > 0) {
        await tx.collection.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });
        message = 'Collection deactivated (has linked products, cannot be hard-deleted)';
      } else {
        await tx.collection.delete({ where: { id } });
        message = 'Collection deleted successfully';
      }
    });

    await invalidateTags([CacheTags.collections, CacheTags.collection(id)]);
    revalidatePath('/');

    return NextResponse.json({ success: true, message: message! });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/collections]', err);
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
