import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/api-auth';
import { redis } from '@/lib/redis';

const SyncSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string(),
    title:     z.string(),
    size:      z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
    imageUrl:  z.string(),
    quantity:  z.number().int().positive(),
    priceINR:  z.number().positive(),
  })),
});

// 26-hour TTL — long enough to catch users who come back the next day
const TTL_SECONDS = 26 * 60 * 60;

function cartKey(userId: string) {
  return `abandon_cart:${userId}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId  = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body   = await request.json();
    const parsed = SyncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { items } = parsed.data;

    if (items.length === 0) {
      // Cart cleared — delete the abandon record
      await redis.del(cartKey(userId));
      return NextResponse.json({ success: true });
    }

    const userName = (session?.user as any)?.name as string | undefined;
    await redis.set(
      cartKey(userId),
      { items, email: session?.user?.email ?? '', name: userName ?? '', savedAt: Date.now() },
      { ex: TTL_SECONDS }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/cart/sync]', err);
    return NextResponse.json({ error: 'Failed to sync cart' }, { status: 500 });
  }
}

// Called by cron — not a public endpoint
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Deletion is handled per-key in the cron route; this stub exists for future use
  return NextResponse.json({ success: true });
}
