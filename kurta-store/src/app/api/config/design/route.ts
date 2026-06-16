import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import type { DesignConfig } from '@/types/schema';

const CACHE_KEY = 'design_config';

const HeroBannerSchema = z.object({
  url: z.string().url(),
  altText: z.string().min(1),
  linkHref: z.string(),
});

const PatchDesignConfigSchema = z.object({
  heroBanners: z.array(HeroBannerSchema).optional(),
  isLookbookActive: z.boolean().optional(),
  activeTheme: z.enum(['pastel-pink', 'ivory-gold', 'midnight-rose', 'sage-green']).optional(),
  promoBannerText: z.string().nullable().optional(),
});

function dbConfigToSchema(c: {
  id: string;
  heroBanners: unknown;
  isLookbookActive: boolean;
  activeTheme: string;
  promoBannerText: string | null;
  updatedAt: Date;
}): DesignConfig {
  return {
    id: c.id,
    heroBanners: c.heroBanners as DesignConfig['heroBanners'],
    isLookbookActive: c.isLookbookActive,
    activeTheme: c.activeTheme,
    promoBannerText: c.promoBannerText ?? undefined,
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /api/config/design — returns current DesignConfig
export async function GET() {
  try {
    // Check Redis cache first
    const cached = await redis.get<DesignConfig>(CACHE_KEY).catch(() => null);
    if (cached) {
      return NextResponse.json(cached);
    }

    const config = await db.designConfig.findUnique({
      where: { id: 'current_config' },
      select: {
        id: true,
        heroBanners: true,
        isLookbookActive: true,
        activeTheme: true,
        promoBannerText: true,
        updatedAt: true,
      },
    });

    if (!config) {
      return NextResponse.json({ error: 'Design config not found' }, { status: 404 });
    }

    const result = dbConfigToSchema(config);

    // Store in Redis (no TTL — invalidated on admin save)
    await redis.set(CACHE_KEY, result).catch(() => null);

    return NextResponse.json(result);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/config/design]', err);
    }
    return NextResponse.json({ error: 'Failed to fetch design config' }, { status: 500 });
  }
}

// PATCH /api/config/design — admin update
export async function PATCH(request: NextRequest) {
  try {
    // Admin auth
    const authHeader = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.ADMIN_SECRET_KEY}`;
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = PatchDesignConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.heroBanners !== undefined) updateData.heroBanners = parsed.data.heroBanners;
    if (parsed.data.isLookbookActive !== undefined) updateData.isLookbookActive = parsed.data.isLookbookActive;
    if (parsed.data.activeTheme !== undefined) updateData.activeTheme = parsed.data.activeTheme;
    if (parsed.data.promoBannerText !== undefined) updateData.promoBannerText = parsed.data.promoBannerText;

    const updated = await db.designConfig.update({
      where: { id: 'current_config' },
      data: updateData,
      select: {
        id: true,
        heroBanners: true,
        isLookbookActive: true,
        activeTheme: true,
        promoBannerText: true,
        updatedAt: true,
      },
    });

    // Invalidate Redis cache
    await redis.del(CACHE_KEY).catch(() => null);

    return NextResponse.json(dbConfigToSchema(updated));
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[PATCH /api/config/design]', err);
    }
    return NextResponse.json({ error: 'Failed to update design config' }, { status: 500 });
  }
}
