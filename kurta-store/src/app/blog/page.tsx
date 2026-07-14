import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/db/index';
import { blogPosts } from '@/db/schema';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Journal | Minara Creation',
  description: 'Stories of craft, culture and conscious fashion from the studio of Minara Creation.',
};

interface Post {
  id: string; title: string; slug: string;
  excerpt: string | null; coverImageUrl: string | null;
  publishedAt: string | null;
}

async function getPosts(): Promise<Post[]> {
  if (process.env.DATABASE_URL?.includes('password@localhost')) return [];
  try {
    const rows = await db.select({
      id: blogPosts.id, title: blogPosts.title, slug: blogPosts.slug,
      excerpt: blogPosts.excerpt, coverImageUrl: blogPosts.coverImageUrl,
      publishedAt: blogPosts.publishedAt,
    })
      .from(blogPosts)
      .where(and(eq(blogPosts.isPublished, true), isNotNull(blogPosts.publishedAt)))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(50);

    return rows.map((p) => ({ ...p, publishedAt: p.publishedAt?.toISOString() ?? null }));
  } catch { return []; }
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <main style={{ backgroundColor: '#FAF8F5', minHeight: '100vh', paddingBottom: '80px' }}>

      {/* Hero */}
      <section style={{ padding: '80px 24px 48px', textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--color-brand-mauve)', marginBottom: '16px' }}>
          Stories &amp; Craft
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 300, color: 'var(--color-brand-charcoal)', lineHeight: 1.1 }}>
          The Journal
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.6, marginTop: '16px', lineHeight: 1.8 }}>
          Behind the weaves, the weavers, and the world of Minara Creation.
        </p>
      </section>

      {/* Post Grid */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', fontFamily: 'var(--font-body)', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>
            No stories published yet. Check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '40px' }}>
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                <article style={{ borderRadius: '16px', overflow: 'hidden', backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', transition: 'box-shadow 0.3s, transform 0.3s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--glass-shadow)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}
                >
                  {post.coverImageUrl ? (
                    <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                      <Image src={post.coverImageUrl} alt={post.title} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 33vw" />
                    </div>
                  ) : (
                    <div style={{ aspectRatio: '16/9', backgroundColor: 'var(--color-brand-blush)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--color-brand-mauve)', opacity: 0.3 }}>✦</span>
                    </div>
                  )}
                  <div style={{ padding: '24px' }}>
                    {post.publishedAt && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-brand-mauve)', opacity: 0.7, marginBottom: '10px' }}>
                        {fmt(post.publishedAt)}
                      </p>
                    )}
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', lineHeight: 1.25, marginBottom: '10px' }}>
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)', opacity: 0.65, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {post.excerpt}
                      </p>
                    )}
                    <p style={{ marginTop: '16px', fontFamily: 'var(--font-body)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, color: 'var(--color-brand-mauve)' }}>
                      Read More →
                    </p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
