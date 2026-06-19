import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/cron/stock-alert
// Triggered by Hostinger Cron or Upstash Workflow
// Must include: Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all active products
    const products = await db.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        title: true,
        variants: {
          select: {
            size: true,
            stock: true,
          }
        },
      },
    });

    const lowStockProducts: string[] = [];

    for (const product of products) {
      const lowVariants = product.variants.filter((v) => v.stock <= 3);
      if (lowVariants.length > 0) {
        const lowSizes = lowVariants
          .map((v) => `${v.size}:${v.stock}`)
          .join(', ');
        lowStockProducts.push(`${product.title} (${lowSizes})`);

        // Log for monitoring (email integration is future scope)
        if (process.env.NODE_ENV === 'development') {
          console.error(`[STOCK ALERT] Low stock — ${product.title}: ${lowSizes}`);
        }
      }
    }

    // Reconcile coupon.usedCount against actual CouponUsage rows to fix any drift
    // caused by manual DB edits or failed mid-transaction writes.
    await db.$executeRaw`
      UPDATE coupons c
      SET c.usedCount = (
        SELECT COUNT(*) FROM coupon_usages cu WHERE cu.couponId = c.id
      )
    `;

    return NextResponse.json({
      scanned: products.length,
      lowStockProducts,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/cron/stock-alert]', err);
    }
    return NextResponse.json({ error: 'Failed to run stock alert sweep' }, { status: 500 });
  }
}
