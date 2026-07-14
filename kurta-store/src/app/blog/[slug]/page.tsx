import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/db/index';
import { blogPosts, users } from '@/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

export const revalidate = 1800;

interface PostFull {
  id: string; title: string; slug: string; content: string;
  excerpt: string | null; coverImageUrl: string | null;
  isPublished: boolean; publishedAt: string | null;
  authorName: string | null;
}

async function getPost(slug: string): Promise<PostFull | null> {
  if (process.env.DATABASE_URL?.includes('password@localhost')) return null;
  try {
    const [row] = await db.select({
      id: blogPosts.id, title: blogPosts.title, slug: blogPosts.slug,
      content: blogPosts.content, excerpt: blogPosts.excerpt,
      coverImageUrl: blogPosts.coverImageUrl, isPublished: blogPosts.isPublished,
      publishedAt: blogPosts.publishedAt, authorName: users.name,
    })
      .from(blogPosts)
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.isPublished, true), isNotNull(blogPosts.publishedAt)))
      .limit(1);

    if (!row) return null;

    return { ...row, publishedAt: row.publishedAt?.toISOString() ?? null };
  } catch { return null; }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Not Found | Minara Journal' };
  return {
    title: `${post.title} | Minara Journal`,
    description: post.excerpt ?? post.content.slice(0, 160),
    openGraph: {
      title: post.title,
      description: post.excerpt ?? '',
      images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : [],
      type: 'article',
    },
  };
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingBottom: '80px' }}>

      {/* Cover Image */}
      {post.coverImageUrl && (
        <div style={{ position: 'relative', width: '100%', height: '55vh', overflow: 'hidden' }}>
          <Image src={post.coverImageUrl} alt={post.title} fill priority style={{ objectFit: 'cover', objectPosition: 'center' }} sizes="100vw" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(250,248,245,0.95) 100%)' }} />
        </div>
      )}

      {/* Article */}
      <article style={{ maxWidth: '720px', margin: '0 auto', padding: post.coverImageUrl ? '0 24px 0' : '80px 24px 0' }}>

        {/* Back */}
        <Link href="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-charcoal)', opacity: 0.5, textDecoration: 'none', marginBottom: '32px' }}>
          ← Journal
        </Link>

        {/* Meta */}
        {post.publishedAt && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-brand-mauve)', marginBottom: '16px' }}>
            {fmtDate(post.publishedAt)}{post.authorName ? ` · ${post.authorName}` : ''}
          </p>
        )}

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, color: 'var(--color-brand-charcoal)', lineHeight: 1.1, marginBottom: '24px' }}>
          {post.title}
        </h1>

        {post.excerpt && (
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontStyle: 'italic', color: 'var(--color-brand-charcoal)', opacity: 0.7, lineHeight: 1.7, marginBottom: '32px', borderLeft: '3px solid var(--color-brand-mauve)', paddingLeft: '20px' }}>
            {post.excerpt}
          </p>
        )}

        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-brand-mist)', marginBottom: '40px' }} />

        {/* Content rendered as HTML — content is admin-controlled so XSS risk is acceptable */}
        <div
          dangerouslySetInnerHTML={{ __html: post.content }}
          style={{ fontFamily: 'var(--font-body)', fontSize: '16px', lineHeight: 1.9, color: 'var(--color-brand-charcoal)' }}
        />

        {/* Footer CTA */}
        <div style={{ marginTop: '60px', padding: '32px', backgroundColor: 'var(--color-brand-blush)', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--color-brand-blush-deep)' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--color-brand-charcoal)', marginBottom: '16px' }}>
            Explore the collection
          </p>
          <Link href="/collection" style={{ display: 'inline-block', padding: '14px 32px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Shop Now
          </Link>
        </div>
      </article>
    </main>
  );
}
