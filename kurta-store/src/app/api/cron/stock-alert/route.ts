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
      where: { isActive: true },
      select: {
        id: true,
        title: true,
        sizes: true,
      },
    });

    const lowStockProducts: string[] = [];

    for (const product of products) {
      const sizeMap = product.sizes as Record<string, number>;
      const hasLowStock = Object.values(sizeMap).some((stock) => stock <= 3);
      if (hasLowStock) {
        const lowSizes = Object.entries(sizeMap)
          .filter(([, stock]) => stock <= 3)
          .map(([size, stock]) => `${size}:${stock}`)
          .join(', ');
        lowStockProducts.push(`${product.title} (${lowSizes})`);

        // Log for monitoring (email integration is future scope)
        if (process.env.NODE_ENV === 'development') {
          console.error(`[STOCK ALERT] Low stock — ${product.title}: ${lowSizes}`);
        }
      }
    }

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
