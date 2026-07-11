/**
 * GET    /api/collections      — list all active collections (public, cached 1h)
 * POST   /api/collections      — create a collection (admin)
 * PATCH  /api/collections      — update a collection (admin)
 * DELETE /api/collections?id=  — deactivate a collection (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { collections, products } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { imageUrlSchema } from '@/lib/validators';
import { invalidateTags, invalidateStorefrontProducts, CacheTags } from '@/lib/cache';
import { getCollectionsList } from '@/lib/admin-list-queries';
import { count, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const CreateCollectionSchema = z.object({
  name:        z.string().min(1).max(100),
  slug:        z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  imageUrl:    imageUrlSchema.optional(),
  isActive:    z.boolean().optional().default(true),
  sortOrder:   z.number().int().min(0).optional().default(0),
});

const UpdateCollectionSchema = z.object({
  id:          z.string().uuid(),
  name:        z.string().min(1).max(100).optional(),
  slug:        z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  imageUrl:    imageUrlSchema.nullable().optional(),
  isActive:    z.boolean().optional(),
  sortOrder:   z.number().int().min(0).optional(),
});

function serializeCollection(c: any) {
  return {
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const limitParam      = searchParams.get('limit');
    const cursor          = searchParams.get('cursor') ?? undefined;
    // Pagination only activates when a caller explicitly passes `limit` — the
    // default (used by the admin table + product-form dropdown) stays unpaginated.
    const paginated = limitParam !== null;
    const limit     = paginated ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : undefined;

    const result = await getCollectionsList({ includeInactive, limit, cursor });

    return NextResponse.json(result, {
      headers: !paginated && !includeInactive
        ? { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
        : {},
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/collections]', err);
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = CreateCollectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const id = randomUUID();
    await db.insert(collections).values({ id, ...parsed.data });

    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);

    await invalidateTags([CacheTags.collections]);
    await invalidateStorefrontProducts();
    revalidatePath('/');
    revalidatePath('/collection');

    return NextResponse.json({ collection: serializeCollection(collection) }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Collection name or slug already exists' }, { status: 409 });
    }
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/collections]', err);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = UpdateCollectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const { id, ...updateData } = parsed.data;

    const [existing] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    await db.update(collections)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(collections.id, id));

    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);

    await invalidateTags([CacheTags.collections, CacheTags.collection(id)]);
    await invalidateStorefrontProducts();
    revalidatePath('/');
    revalidatePath('/collection');

    return NextResponse.json({ collection: serializeCollection(collection) });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Name or slug already in use' }, { status: 409 });
    }
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/collections]', err);
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Collection ID required' }, { status: 400 });

    let message: string;
    await db.transaction(async (tx) => {
      const [{ totalProductCount }] = await tx
        .select({ totalProductCount: count() })
        .from(products)
        .where(eq(products.collectionId, id));

      if (totalProductCount > 0) {
        await tx.update(collections)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(collections.id, id));
        message = 'Collection deactivated (has linked products, cannot be hard-deleted)';
      } else {
        await tx.delete(collections).where(eq(collections.id, id));
        message = 'Collection deleted successfully';
      }
    });

    await invalidateTags([CacheTags.collections, CacheTags.collection(id)]);
    await invalidateStorefrontProducts();
    revalidatePath('/');
    revalidatePath('/collection');

    return NextResponse.json({ success: true, message: message! });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/collections]', err);
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
