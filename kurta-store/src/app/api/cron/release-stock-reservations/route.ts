import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { stockReservations } from '@/db/schema';
import { lte, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const authHeader    = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await db
      .delete(stockReservations)
      .where(lte(stockReservations.expiresAt, sql`NOW()`));

    return NextResponse.json({ released: (deleted as any)[0]?.affectedRows ?? 0 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/cron/release-stock-reservations]', err);
    }
    return NextResponse.json({ error: 'Failed to release expired stock reservations' }, { status: 500 });
  }
}
