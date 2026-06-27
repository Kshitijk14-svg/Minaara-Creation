import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { blogPosts } from '@/db/schema';
import { isAuthorized, getSession } from '@/lib/api-auth';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const CreatePostSchema = z.object({
  title:        z.string().min(1).max(255),
  slug:         z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  content:      z.string().min(1),
  excerpt:      z.string().max(500).optional(),
  coverImageUrl: z.string().url().optional().or(z.literal('')),
  isPublished:  z.boolean().optional().default(false),
});

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const isAdmin      = await isAuthorized(request);
    const { searchParams } = new URL(request.url);
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

    const where = isAdmin ? undefined : and(eq(blogPosts.isPublished, true), isNotNull(blogPosts.publishedAt));

    const posts = await db.select({
      id: blogPosts.id, title: blogPosts.title, slug: blogPosts.slug,
      excerpt: blogPosts.excerpt, coverImageUrl: blogPosts.coverImageUrl,
      isPublished: blogPosts.isPublished, publishedAt: blogPosts.publishedAt,
      createdAt: blogPosts.createdAt, updatedAt: blogPosts.updatedAt,
    })
      .from(blogPosts)
      .where(where)
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit);

    return NextResponse.json({
      posts: posts.map((p) => ({
        ...p,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        createdAt:   p.createdAt.toISOString(),
        updatedAt:   p.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/blog]', err);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await getSession();
    const authorId = (session?.user as any)?.id as string | undefined;

    const body   = await request.json();
    const parsed = CreatePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid post data', issues: parsed.error.issues }, { status: 400 });
    }

    const { title, slug: rawSlug, content, excerpt, coverImageUrl, isPublished } = parsed.data;
    const slug = rawSlug ?? toSlug(title);
    const now  = new Date();

    const id = randomUUID();
    await db.insert(blogPosts).values({
      id, title, slug, content,
      excerpt:       excerpt ?? null,
      coverImageUrl: coverImageUrl || null,
      isPublished,
      publishedAt:   isPublished ? now : null,
      authorId:      authorId ?? null,
      createdAt:     now,
      updatedAt:     now,
    });

    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);

    return NextResponse.json({
      post: {
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt:   post.createdAt.toISOString(),
        updatedAt:   post.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'A post with this slug already exists' }, { status: 409 });
    }
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/blog]', err);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
