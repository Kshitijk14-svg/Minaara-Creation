import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq, like, and, desc } from 'drizzle-orm';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER';

const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 4, ADMIN: 3, STAFF: 2, CUSTOMER: 1,
};

async function getCallerRole(): Promise<Role | null> {
  const session = await auth();
  const role = (session?.user as any)?.role as Role | undefined;
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) return null;
  return role;
}

export async function GET(request: NextRequest) {
  try {
    const callerRole = await getCallerRole();
    if (!callerRole) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const roleFilter  = searchParams.get('role') as Role | null;
    const emailSearch = searchParams.get('email')?.trim();

    const conditions: ReturnType<typeof eq>[] = [];
    if (roleFilter && ROLE_RANK[roleFilter]) conditions.push(eq(users.role, roleFilter));
    if (emailSearch) conditions.push(like(users.email, `%${emailSearch}%`));

    const rows = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(100);

    return NextResponse.json({ users: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })) });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[GET /api/admin/users]', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

const PatchSchema = z.object({
  userId: z.string().min(1),
  role:   z.enum(['SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER']),
});

export async function PATCH(request: NextRequest) {
  try {
    const callerRole = await getCallerRole();
    if (!callerRole) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body: unknown = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const { userId, role: targetRole } = parsed.data;

    // Only SUPER_ADMIN can assign ADMIN or above
    if (ROLE_RANK[targetRole] >= ROLE_RANK['ADMIN'] && callerRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only a Super Admin can assign Admin roles' }, { status: 403 });
    }

    // Prevent privilege escalation beyond caller's own rank
    if (ROLE_RANK[targetRole] > ROLE_RANK[callerRole]) {
      return NextResponse.json({ error: 'Cannot assign a role higher than your own' }, { status: 403 });
    }

    await db.update(users).set({ role: targetRole, updatedAt: new Date() }).where(eq(users.id, userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[PATCH /api/admin/users]', err);
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
  }
}
