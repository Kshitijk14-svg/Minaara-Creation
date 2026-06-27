import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { products, productSizeVariants } from '@/db/schema';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { sendEmail, renderLowStockAlertEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    const authHeader    = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await db
      .select({
        productId:    products.id,
        productTitle: products.title,
        size:         productSizeVariants.size,
        stock:        productSizeVariants.stock,
      })
      .from(products)
      .innerJoin(productSizeVariants, eq(productSizeVariants.productId, products.id))
      .where(and(
        eq(products.isActive, true),
        isNull(products.deletedAt),
        lte(productSizeVariants.stock, 3),
      ));

    // Build deduplicated alert list
    const alertItems: Array<{ productTitle: string; size: string; stock: number }> = rows.map((r) => ({
      productTitle: r.productTitle,
      size:         r.size,
      stock:        r.stock,
    }));

    const uniqueProducts = [...new Set(rows.map((r) => r.productId))];

    if (alertItems.length > 0 && process.env.ADMIN_EMAIL) {
      sendEmail({
        to:      process.env.ADMIN_EMAIL,
        subject: `[Minaara] Low Stock Alert — ${uniqueProducts.length} product${uniqueProducts.length > 1 ? 's' : ''} need restocking`,
        html:    renderLowStockAlertEmail(alertItems),
      }).catch((err) => {
        console.error('[stock-alert] email failed:', err);
      });
    } else if (alertItems.length > 0) {
      console.warn('[stock-alert] ADMIN_EMAIL not set — skipping email. Low stock items:', alertItems.length);
    }

    // Reconcile coupon.usedCount against actual CouponUsage rows
    await db.execute(sql.raw(
      `UPDATE coupons c SET c.usedCount = (SELECT COUNT(*) FROM coupon_usages cu WHERE cu.couponId = c.id)`
    ));

    return NextResponse.json({
      scanned:         uniqueProducts.length,
      lowStockItems:   alertItems.length,
      emailSent:       alertItems.length > 0 && !!process.env.ADMIN_EMAIL,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/cron/stock-alert]', err);
    }
    return NextResponse.json({ error: 'Failed to run stock alert sweep' }, { status: 500 });
  }
}
