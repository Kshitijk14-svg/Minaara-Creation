import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { haveliHotspots, products } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { invalidateStorefrontHaveliHotspots } from '@/lib/cache';
import { eq } from 'drizzle-orm';

const UpdateHotspotSchema = z.object({
  productId: z.string().uuid().optional(),
  x:         z.number().min(0).max(100).optional(),
  y:         z.number().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id }  = await params;
    const body    = await request.json();
    const parsed  = UpdateHotspotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
    }

    const [existing] = await db.select({ id: haveliHotspots.id }).from(haveliHotspots).where(eq(haveliHotspots.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Hotspot not found' }, { status: 404 });

    if (parsed.data.productId) {
      const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, parsed.data.productId)).limit(1);
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 400 });
    }

    await db.update(haveliHotspots).set({ ...parsed.data, updatedAt: new Date() }).where(eq(haveliHotspots.id, id));

    await invalidateStorefrontHaveliHotspots();
    revalidatePath('/');

    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/haveli-hotspots/[id]]', err);
    return NextResponse.json({ error: 'Failed to update hotspot' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const [row]  = await db.select({ id: haveliHotspots.id }).from(haveliHotspots).where(eq(haveliHotspots.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: 'Hotspot not found' }, { status: 404 });

    await db.delete(haveliHotspots).where(eq(haveliHotspots.id, id));

    await invalidateStorefrontHaveliHotspots();
    revalidatePath('/');

    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/haveli-hotspots/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete hotspot' }, { status: 500 });
  }
}
