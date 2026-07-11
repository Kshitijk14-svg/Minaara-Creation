import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { testimonials } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { invalidateStorefrontTestimonials } from '@/lib/cache';
import { asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const CreateTestimonialSchema = z.object({
  name:      z.string().min(1).max(255),
  city:      z.string().max(100).optional(),
  text:      z.string().min(1),
  rating:    z.number().int().min(1).max(5).optional().default(5),
  isActive:  z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

function serialize(t: any) {
  return {
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAuthorized(request);
    const where   = isAdmin ? undefined : eq(testimonials.isActive, true);

    const rows = await db.select().from(testimonials)
      .where(where)
      .orderBy(asc(testimonials.sortOrder), desc(testimonials.createdAt));

    return NextResponse.json({ testimonials: rows.map(serialize) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/testimonials]', err);
    return NextResponse.json({ error: 'Failed to fetch testimonials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = CreateTestimonialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid testimonial data', issues: parsed.error.issues }, { status: 400 });
    }

    const { name, city, text, rating, isActive, sortOrder } = parsed.data;
    const id  = randomUUID();
    const now = new Date();

    await db.insert(testimonials).values({
      id, name, text, rating, isActive, sortOrder,
      city:      city || null,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(testimonials).where(eq(testimonials.id, id)).limit(1);

    await invalidateStorefrontTestimonials();
    revalidatePath('/');

    return NextResponse.json({ testimonial: serialize(row) }, { status: 201 });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/testimonials]', err);
    return NextResponse.json({ error: 'Failed to create testimonial' }, { status: 500 });
  }
}
