/**
 * GET  /api/haveli-hotspots  — list all pins, enriched with product info (public)
 * POST /api/haveli-hotspots  — create a pin (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { haveliHotspots, products, productImages } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { invalidateStorefrontHaveliHotspots } from '@/lib/cache';
import { asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const CreateHotspotSchema = z.object({
  productId: z.string().uuid(),
  x:         z.number().min(0).max(100),
  y:         z.number().min(0).max(100),
  sortOrder: z.number().int().optional().default(0),
});

async function withProductInfo(rows: Array<{ id: string; productId: string; x: number; y: number; sortOrder: number }>) {
  const productIds = [...new Set(rows.map((r) => r.productId))];
  if (productIds.length === 0) return [];

  const [productRows, imageRows] = await Promise.all([
    db.select({ id: products.id, title: products.title, slug: products.slug, priceINR: products.priceINR })
      .from(products).where(inArray(products.id, productIds)),
    db.select({ productId: productImages.productId, url: productImages.url })
      .from(productImages).where(inArray(productImages.productId, productIds)).orderBy(asc(productImages.sortOrder)),
  ]);

  const productMap = new Map(productRows.map((p) => [p.id, p]));
  const firstImageMap = new Map<string, string>();
  for (const img of imageRows) {
    if (!firstImageMap.has(img.productId)) firstImageMap.set(img.productId, img.url);
  }

  return rows.map((r) => {
    const product = productMap.get(r.productId);
    return {
      id:        r.id,
      productId: r.productId,
      x:         r.x,
      y:         r.y,
      sortOrder: r.sortOrder,
      product: product ? {
        id:       product.id,
        title:    product.title,
        slug:     product.slug,
        priceINR: product.priceINR,
        images:   firstImageMap.has(r.productId) ? [firstImageMap.get(r.productId)!] : [],
      } : undefined,
    };
  });
}

export async function GET() {
  try {
    const rows = await db.select().from(haveliHotspots).orderBy(asc(haveliHotspots.sortOrder));
    return NextResponse.json({ hotspots: await withProductInfo(rows) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/haveli-hotspots]', err);
    return NextResponse.json({ error: 'Failed to fetch hotspots' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = CreateHotspotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid hotspot data', issues: parsed.error.issues }, { status: 400 });
    }

    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, parsed.data.productId)).limit(1);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 400 });
    }

    const { productId, x, y, sortOrder } = parsed.data;
    const id  = randomUUID();
    const now = new Date();

    await db.insert(haveliHotspots).values({ id, productId, x, y, sortOrder, createdAt: now, updatedAt: now });

    const [row] = await db.select().from(haveliHotspots).where(eq(haveliHotspots.id, id)).limit(1);

    await invalidateStorefrontHaveliHotspots();
    revalidatePath('/');

    const [hotspot] = await withProductInfo([row]);
    return NextResponse.json({ hotspot }, { status: 201 });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/haveli-hotspots]', err);
    return NextResponse.json({ error: 'Failed to create hotspot' }, { status: 500 });
  }
}
