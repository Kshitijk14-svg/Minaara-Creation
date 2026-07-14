import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { sendEmail, renderAbandonCartEmail } from '@/lib/email';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const authHeader    = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Scan for all abandon_cart:* keys
    let cursor   = 0;
    const keys: string[] = [];

    do {
      const [nextCursor, batch] = await redis.scan(cursor, { match: 'abandon_cart:*', count: 100 });
      cursor = nextCursor as unknown as number;
      keys.push(...(batch as string[]));
    } while (cursor !== 0);

    let sent    = 0;
    let skipped = 0;
    let deleted = 0;

    for (const key of keys) {
      const data = await redis.get<{
        items:   Array<{ title: string; size: string; quantity: number; priceINR: number; imageUrl?: string }>;
        email:   string;
        name:    string;
        savedAt: number;
      }>(key);

      if (!data) { deleted++; continue; }

      // Only email if cart has been idle for at least 2 hours
      const idleMs = Date.now() - data.savedAt;
      if (idleMs < TWO_HOURS_MS) { skipped++; continue; }

      if (!data.email || data.items.length === 0) {
        await redis.del(key);
        deleted++;
        continue;
      }

      try {
        await sendEmail({
          to:      data.email,
          subject: `${data.name ? `${data.name}, you` : 'You'} left something in your Minara bag`,
          html:    renderAbandonCartEmail(data.items, data.name),
        });
        // Delete after sending so we don't spam
        await redis.del(key);
        sent++;
      } catch (err) {
        console.error(`[abandon-cart] failed to send to ${data.email}:`, err);
      }
    }

    return NextResponse.json({ total: keys.length, sent, skipped, deleted });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/cron/abandon-cart]', err);
    return NextResponse.json({ error: 'Failed to process abandon cart emails' }, { status: 500 });
  }
}
