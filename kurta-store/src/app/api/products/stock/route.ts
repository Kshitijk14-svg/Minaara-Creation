/**
 * POST /api/products/stock — live stock lookup for a set of variant ids (public, uncached)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { productSizeVariants } from '@/db/schema';
import { inArray } from 'drizzle-orm';

const StockRequestSchema = z.object({
  variantIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = StockRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const rows = await db
      .select({ id: productSizeVariants.id, stock: productSizeVariants.stock })
      .from(productSizeVariants)
      .where(inArray(productSizeVariants.id, parsed.data.variantIds));

    const stocks: Record<string, number> = {};
    for (const id of parsed.data.variantIds) stocks[id] = 0;
    for (const row of rows) stocks[row.id] = row.stock;

    return NextResponse.json({ stocks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[POST /api/products/stock]', err);
    return NextResponse.json({ error: 'Failed to fetch stock' }, { status: 500 });
  }
}
