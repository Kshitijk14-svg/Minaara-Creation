import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { testimonials } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { invalidateStorefrontTestimonials } from '@/lib/cache';
import { eq } from 'drizzle-orm';

const UpdateTestimonialSchema = z.object({
  name:      z.string().min(1).max(255).optional(),
  city:      z.string().max(100).nullable().optional(),
  text:      z.string().min(1).optional(),
  rating:    z.number().int().min(1).max(5).optional(),
  isActive:  z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

function serialize(t: any) {
  return {
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

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
    const parsed  = UpdateTestimonialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
    }

    const [existing] = await db.select({ id: testimonials.id }).from(testimonials).where(eq(testimonials.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Testimonial not found' }, { status: 404 });

    await db.update(testimonials).set({ ...parsed.data, updatedAt: new Date() }).where(eq(testimonials.id, id));

    const [row] = await db.select().from(testimonials).where(eq(testimonials.id, id)).limit(1);

    await invalidateStorefrontTestimonials();
    revalidatePath('/');

    return NextResponse.json({ testimonial: serialize(row) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/testimonials/[id]]', err);
    return NextResponse.json({ error: 'Failed to update testimonial' }, { status: 500 });
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
    const [row]  = await db.select({ id: testimonials.id }).from(testimonials).where(eq(testimonials.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: 'Testimonial not found' }, { status: 404 });

    await db.delete(testimonials).where(eq(testimonials.id, id));

    await invalidateStorefrontTestimonials();
    revalidatePath('/');

    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/testimonials/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete testimonial' }, { status: 500 });
  }
}
