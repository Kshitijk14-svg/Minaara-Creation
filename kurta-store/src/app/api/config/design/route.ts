import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/index';
import { designConfigs } from '@/db/schema';
import { redis } from '@/lib/redis';
import { isAuthorized } from '@/lib/api-auth';
import { imageUrlSchema } from '@/lib/validators';
import { eq } from 'drizzle-orm';
import type { DesignConfig } from '@/types/schema';

const CACHE_KEY = 'design_config';

const HeroBannerSchema = z.object({
  url:      imageUrlSchema,
  altText:  z.string().min(1),
  linkHref: z.string(),
});

const HeroContentSchema = z.object({
  badgeText:          z.string(),
  headline:           z.string(),
  headlineEmphasis:   z.string(),
  subheading:         z.string(),
  imageUrl:           z.string(),
  ctaPrimaryLabel:    z.string(),
  ctaPrimaryHref:     z.string(),
  ctaSecondaryLabel:  z.string(),
  ctaSecondaryHref:   z.string(),
});

const UspItemSchema = z.object({
  icon:  z.string(),
  title: z.string(),
  sub:   z.string(),
});

const AboutPanelSchema = z.object({
  num:      z.string(),
  label:    z.string(),
  heading:  z.string(),
  body:     z.string(),
  imageUrl: z.string(),
});

const EditorialStorySchema = z.object({
  chapter:  z.string(),
  title:    z.string(),
  desc:     z.string(),
  imageUrl: z.string(),
  href:     z.string(),
});

const StatItemSchema = z.object({
  value:  z.number(),
  suffix: z.string(),
  label:  z.string(),
});

const FooterContentSchema = z.object({
  tagline: z.string(),
  links:   z.array(z.object({ href: z.string(), label: z.string() })),
});

const PatchDesignConfigSchema = z.object({
  heroBanners:      z.array(HeroBannerSchema).optional(),
  isLookbookActive: z.boolean().optional(),
  activeTheme:      z.enum(['pastel-pink', 'ivory-gold', 'midnight-rose', 'sage-green']).optional(),
  promoBannerText:  z.string().nullable().optional(),
  heroContent:      HeroContentSchema.optional(),
  uspItems:         z.array(UspItemSchema).optional(),
  marqueeWords:     z.array(z.string()).optional(),
  aboutPanels:      z.array(AboutPanelSchema).optional(),
  editorialStories: z.array(EditorialStorySchema).optional(),
  stats:            z.array(StatItemSchema).optional(),
  footerContent:    FooterContentSchema.optional(),
});

function rowToSchema(c: {
  id: string;
  heroBanners: unknown;
  isLookbookActive: boolean;
  activeTheme: string;
  promoBannerText: string | null;
  heroContent: unknown;
  uspItems: unknown;
  marqueeWords: unknown;
  aboutPanels: unknown;
  editorialStories: unknown;
  stats: unknown;
  footerContent: unknown;
  updatedAt: Date;
}): DesignConfig {
  return {
    id:               c.id,
    heroBanners:      c.heroBanners as DesignConfig['heroBanners'],
    isLookbookActive: c.isLookbookActive,
    activeTheme:      c.activeTheme,
    promoBannerText:  c.promoBannerText ?? undefined,
    heroContent:      (c.heroContent as DesignConfig['heroContent']) ?? undefined,
    uspItems:         (c.uspItems as DesignConfig['uspItems']) ?? undefined,
    marqueeWords:     (c.marqueeWords as DesignConfig['marqueeWords']) ?? undefined,
    aboutPanels:      (c.aboutPanels as DesignConfig['aboutPanels']) ?? undefined,
    editorialStories: (c.editorialStories as DesignConfig['editorialStories']) ?? undefined,
    stats:            (c.stats as DesignConfig['stats']) ?? undefined,
    footerContent:    (c.footerContent as DesignConfig['footerContent']) ?? undefined,
    updatedAt:        c.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const cached = await redis.get<DesignConfig>(CACHE_KEY).catch(() => null);
    if (cached) return NextResponse.json(cached);

    const [config] = await db
      .select({
        id:               designConfigs.id,
        heroBanners:      designConfigs.heroBanners,
        isLookbookActive: designConfigs.isLookbookActive,
        activeTheme:      designConfigs.activeTheme,
        promoBannerText:  designConfigs.promoBannerText,
        heroContent:      designConfigs.heroContent,
        uspItems:         designConfigs.uspItems,
        marqueeWords:     designConfigs.marqueeWords,
        aboutPanels:      designConfigs.aboutPanels,
        editorialStories: designConfigs.editorialStories,
        stats:            designConfigs.stats,
        footerContent:    designConfigs.footerContent,
        updatedAt:        designConfigs.updatedAt,
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
    if (!(await isAuthorized(request, 'staff_or_above'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = PatchDesignConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.heroBanners !== undefined)      updateData.heroBanners      = parsed.data.heroBanners;
    if (parsed.data.isLookbookActive !== undefined) updateData.isLookbookActive = parsed.data.isLookbookActive;
    if (parsed.data.activeTheme !== undefined)      updateData.activeTheme      = parsed.data.activeTheme;
    if (parsed.data.promoBannerText !== undefined)  updateData.promoBannerText  = parsed.data.promoBannerText;
    if (parsed.data.heroContent !== undefined)      updateData.heroContent      = parsed.data.heroContent;
    if (parsed.data.uspItems !== undefined)         updateData.uspItems         = parsed.data.uspItems;
    if (parsed.data.marqueeWords !== undefined)     updateData.marqueeWords     = parsed.data.marqueeWords;
    if (parsed.data.aboutPanels !== undefined)      updateData.aboutPanels      = parsed.data.aboutPanels;
    if (parsed.data.editorialStories !== undefined) updateData.editorialStories = parsed.data.editorialStories;
    if (parsed.data.stats !== undefined)            updateData.stats            = parsed.data.stats;
    if (parsed.data.footerContent !== undefined)    updateData.footerContent    = parsed.data.footerContent;

    await db
      .update(designConfigs)
      .set(updateData)
      .where(eq(designConfigs.id, 'current_config'));

    const [updated] = await db
      .select({
        id:               designConfigs.id,
        heroBanners:      designConfigs.heroBanners,
        isLookbookActive: designConfigs.isLookbookActive,
        activeTheme:      designConfigs.activeTheme,
        promoBannerText:  designConfigs.promoBannerText,
        heroContent:      designConfigs.heroContent,
        uspItems:         designConfigs.uspItems,
        marqueeWords:     designConfigs.marqueeWords,
        aboutPanels:      designConfigs.aboutPanels,
        editorialStories: designConfigs.editorialStories,
        stats:            designConfigs.stats,
        footerContent:    designConfigs.footerContent,
        updatedAt:        designConfigs.updatedAt,
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
