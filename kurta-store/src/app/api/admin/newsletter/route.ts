import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { newsletterSubscribers } from '@/db/schema';
import { isAuthorized } from '@/lib/api-auth';
import { count, desc, eq, lt } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request, 'staff_or_above'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') ?? undefined;
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);

    let cursorDate: Date | undefined;
    if (cursor) {
      const [ci] = await db.select({ subscribedAt: newsletterSubscribers.subscribedAt })
        .from(newsletterSubscribers).where(eq(newsletterSubscribers.id, cursor)).limit(1);
      cursorDate = ci?.subscribedAt;
    }

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id: newsletterSubscribers.id, email: newsletterSubscribers.email,
        isActive: newsletterSubscribers.isActive, subscribedAt: newsletterSubscribers.subscribedAt,
      })
        .from(newsletterSubscribers)
        .where(cursorDate ? lt(newsletterSubscribers.subscribedAt, cursorDate) : undefined)
        .orderBy(desc(newsletterSubscribers.subscribedAt))
        .limit(limit + 1),
      db.select({ total: count() }).from(newsletterSubscribers),
    ]);

    const hasMore    = rows.length > limit;
    const page        = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor  = hasMore ? page[page.length - 1].id : null;

    return NextResponse.json({
      data: page.map((r) => ({ ...r, subscribedAt: r.subscribedAt.toISOString() })),
      nextCursor,
      total,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/admin/newsletter]', err);
    return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
  }
}
