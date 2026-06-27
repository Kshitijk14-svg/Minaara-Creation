import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { designConfigs } from '@/db/schema';
import { redis } from '@/lib/redis';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import type { DesignConfig } from '@/types/schema';

const CACHE_KEY = 'design_config';

const HeroBannerSchema = z.object({
  url:      z.string().url(),
  altText:  z.string().min(1),
  linkHref: z.string(),
});

const PatchDesignConfigSchema = z.object({
  heroBanners:     z.array(HeroBannerSchema).optional(),
  isLookbookActive: z.boolean().optional(),
  activeTheme:     z.enum(['pastel-pink', 'ivory-gold', 'midnight-rose', 'sage-green']).optional(),
  promoBannerText: z.string().nullable().optional(),
});

function rowToSchema(c: {
  id: string;
  heroBanners: unknown;
  isLookbookActive: boolean;
  activeTheme: string;
  promoBannerText: string | null;
  updatedAt: Date;
}): DesignConfig {
  return {
    id:              c.id,
    heroBanners:     c.heroBanners as DesignConfig['heroBanners'],
    isLookbookActive: c.isLookbookActive,
    activeTheme:     c.activeTheme,
    promoBannerText: c.promoBannerText ?? undefined,
    updatedAt:       c.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const cached = await redis.get<DesignConfig>(CACHE_KEY).catch(() => null);
    if (cached) return NextResponse.json(cached);

    const [config] = await db
      .select({
        id:              designConfigs.id,
        heroBanners:     designConfigs.heroBanners,
        isLookbookActive: designConfigs.isLookbookActive,
        activeTheme:     designConfigs.activeTheme,
        promoBannerText: designConfigs.promoBannerText,
        updatedAt:       designConfigs.updatedAt,
      })
      .from(designConfigs)
      .where(eq(designConfigs.id, 'current_config'))
      .limit(1);

    if (!config) {
      return NextResponse.json({ error: 'Design config not found' }, { status: 404 });
    }

    const result = rowToSchema(config);
    await redis.set(CACHE_KEY, result, { ex: 3600 }).catch(() => null);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[GET /api/config/design]', err);
    return NextResponse.json({ error: 'Failed to fetch design config' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader    = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.ADMIN_SECRET_KEY}`;
    let authorized      = !!(authHeader && authHeader === expectedToken);

    if (!authorized) {
      const session = await auth();
      if (session?.user && ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes((session.user as any).role)) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = PatchDesignConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.heroBanners !== undefined)     updateData.heroBanners     = parsed.data.heroBanners;
    if (parsed.data.isLookbookActive !== undefined) updateData.isLookbookActive = parsed.data.isLookbookActive;
    if (parsed.data.activeTheme !== undefined)     updateData.activeTheme     = parsed.data.activeTheme;
    if (parsed.data.promoBannerText !== undefined) updateData.promoBannerText = parsed.data.promoBannerText;

    await db
      .update(designConfigs)
      .set(updateData)
      .where(eq(designConfigs.id, 'current_config'));

    const [updated] = await db
      .select({
        id:              designConfigs.id,
        heroBanners:     designConfigs.heroBanners,
        isLookbookActive: designConfigs.isLookbookActive,
        activeTheme:     designConfigs.activeTheme,
        promoBannerText: designConfigs.promoBannerText,
        updatedAt:       designConfigs.updatedAt,
      })
      .from(designConfigs)
      .where(eq(designConfigs.id, 'current_config'))
      .limit(1);

    await redis.del(CACHE_KEY).catch(() => null);
    revalidatePath('/');

    return NextResponse.json(rowToSchema(updated));
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[PATCH /api/config/design]', err);
    return NextResponse.json({ error: 'Failed to update design config' }, { status: 500 });
  }
}
