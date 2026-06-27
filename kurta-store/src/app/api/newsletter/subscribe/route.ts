import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { newsletterSubscribers } from '@/db/schema';
import { eq } from 'drizzle-orm';

const Schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }

  const { email } = parsed.data;

  const [existing] = await db
    .select({ id: newsletterSubscribers.id, isActive: newsletterSubscribers.isActive })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  if (existing) {
    if (!existing.isActive) {
      await db
        .update(newsletterSubscribers)
        .set({ isActive: true })
        .where(eq(newsletterSubscribers.email, email));
    }
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  await db.insert(newsletterSubscribers).values({ email });
  return NextResponse.json({ ok: true, alreadySubscribed: false });
}
