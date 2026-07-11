import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { blogPosts } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { imageUrlSchema } from '@/lib/validators';
import { and, eq, isNotNull } from 'drizzle-orm';

const UpdatePostSchema = z.object({
  title:        z.string().min(1).max(255).optional(),
  content:      z.string().min(1).optional(),
  excerpt:      z.string().max(500).optional(),
  coverImageUrl: imageUrlSchema.optional().or(z.literal('')),
  isPublished:  z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

function serialize(p: any) {
  return {
    ...p,
    publishedAt: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : p.publishedAt ?? null,
    createdAt:   p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt:   p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug }  = await params;
    const isAdmin   = await isAuthorized(request);

    const where = isAdmin
      ? eq(blogPosts.slug, slug)
      : and(eq(blogPosts.slug, slug), eq(blogPosts.isPublished, true), isNotNull(blogPosts.publishedAt));

    const [post] = await db.select().from(blogPosts).where(where).limit(1);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    return NextResponse.json({ post: serialize(post) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/blog/[slug]]', err);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const body     = await request.json();
    const parsed   = UpdatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
    }

    const [existing] = await db.select({ id: blogPosts.id, isPublished: blogPosts.isPublished, publishedAt: blogPosts.publishedAt })
      .from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };

    // Set publishedAt when first publishing
    if (parsed.data.isPublished === true && !existing.isPublished) {
      updateData.publishedAt = new Date();
    }
    // Clear publishedAt when unpublishing
    if (parsed.data.isPublished === false) {
      updateData.publishedAt = null;
    }

    await db.update(blogPosts).set(updateData).where(eq(blogPosts.slug, slug));

    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
    return NextResponse.json({ post: serialize(post) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/blog/[slug]]', err);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const [post]   = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    // Soft delete — unpublish rather than destroy
    await db.update(blogPosts).set({ isPublished: false, publishedAt: null, updatedAt: new Date() }).where(eq(blogPosts.id, post.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[DELETE /api/blog/[slug]]', err);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
