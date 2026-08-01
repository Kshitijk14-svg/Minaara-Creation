import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthorized } from '@/lib/api-auth';
import { db } from '@/db/index';
import { failedRefunds } from '@/db/schema';
import { desc, eq, isNull } from 'drizzle-orm';

// Unresolved auto-refund failures from /api/payment/verify — a payment
// Razorpay captured but that never made it into an order, and whose refund
// also failed. Needs a human to refund manually via the Razorpay dashboard.
export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await db
      .select()
      .from(failedRefunds)
      .where(isNull(failedRefunds.resolvedAt))
      .orderBy(desc(failedRefunds.createdAt));

    return NextResponse.json({ failedRefunds: rows });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/admin/failed-refunds]', err);
    return NextResponse.json({ error: 'Failed to fetch failed refunds' }, { status: 500 });
  }
}

const ResolveSchema = z.object({ id: z.string().min(1) });

// Marks a failed-refund row resolved once support has issued the refund
// manually (e.g. via the Razorpay dashboard) — doesn't touch Razorpay itself.
export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = ResolveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    await db.update(failedRefunds)
      .set({ resolvedAt: new Date() })
      .where(eq(failedRefunds.id, parsed.data.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/admin/failed-refunds]', err);
    return NextResponse.json({ error: 'Failed to update failed refund' }, { status: 500 });
  }
}
