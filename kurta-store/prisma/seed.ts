/**
 * Database Seed — Normalized Schema
 * Creates Collections first, then Products with variants and images.
 * Run: npx ts-node prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('[seed] Starting database seed...');

  // ── Collections ────────────────────────────────────────────────────────────
  const collections = [
    { name: 'Casual',  slug: 'casual',  description: 'Everyday casual kurtas for comfort and everyday style', sortOrder: 0 },
    { name: 'Festive', slug: 'festive', description: 'Vibrant festive wear for celebrations and special occasions', sortOrder: 1 },
    { name: 'Wedding', slug: 'wedding', description: 'Elegant bridal and wedding occasion wear', sortOrder: 2 },
    { name: 'Work',    slug: 'work',    description: 'Polished work-appropriate ethnic wear for professionals', sortOrder: 3 },
  ];

  const collectionMap: Record<string, string> = {};
  for (const col of collections) {
    const created = await prisma.collection.upsert({
      where:  { slug: col.slug },
      update: { name: col.name, description: col.description, sortOrder: col.sortOrder },
      create: { ...col, isActive: true },
    });
    collectionMap[col.slug] = created.id;
    console.log(`[seed] Collection: ${col.name} → ${created.id}`);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  const products = [
    {
      id:           'seed-casual-indigo-linen',
      title:        'Indigo Linen Straight Kurta',
      slug:         'indigo-linen-straight-kurta',
      description:  'A breathable, straight-cut kurta in handwoven indigo linen. Perfect for everyday wear — pairs beautifully with white linen trousers or straight-fit jeans. Mandarin collar, three-quarter sleeves.',
      priceINR:     1299,
      collectionSlug: 'casual',
      isActive:     true,
      isFeatured:   true,
      images: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/ecommerce/leather-bag-gray.jpg', altText: 'Indigo Linen Kurta - Front', sortOrder: 0 },
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/ecommerce/shoes.png',            altText: 'Indigo Linen Kurta - Detail', sortOrder: 1 },
      ],
      variants: [
        { size: 'XS' as const, stock: 3 },
        { size: 'S'  as const, stock: 8 },
        { size: 'M'  as const, stock: 12 },
        { size: 'L'  as const, stock: 5 },
        { size: 'XL' as const, stock: 2 },
        { size: 'XXL' as const, stock: 0 },
      ],
    },
    {
      id:           'seed-casual-dusty-rose',
      title:        'Dusty Rose Cotton A-Line Kurta',
      slug:         'dusty-rose-cotton-a-line-kurta',
      description:  'A relaxed A-line silhouette in soft-washed cotton, in a muted dusty rose that transitions from morning chai to evening gatherings. Side slits for ease of movement.',
      priceINR:     899,
      compareAtPriceINR: 1199,
      collectionSlug: 'casual',
      isActive:     true,
      isFeatured:   false,
      images: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/ecommerce/accessories-bag.jpg', altText: 'Dusty Rose Kurta', sortOrder: 0 },
      ],
      variants: [
        { size: 'XS' as const, stock: 0 },
        { size: 'S'  as const, stock: 4 },
        { size: 'M'  as const, stock: 9 },
        { size: 'L'  as const, stock: 6 },
        { size: 'XL' as const, stock: 3 },
        { size: 'XXL' as const, stock: 1 },
      ],
    },
    {
      id:           'seed-festive-champagne',
      title:        'Champagne Chanderi Anarkali',
      slug:         'champagne-chanderi-anarkali',
      description:  'Floor-length anarkali in sheer champagne chanderi with delicate zari border at the hem. Fully lined, with a fitted bodice and flowing flare. Comes with matching dupatta.',
      priceINR:     3499,
      collectionSlug: 'festive',
      isActive:     true,
      isFeatured:   true,
      images: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/landscapes/landscape-panorama.jpg', altText: 'Champagne Chanderi Anarkali', sortOrder: 0 },
      ],
      variants: [
        { size: 'XS' as const, stock: 2 },
        { size: 'S'  as const, stock: 5 },
        { size: 'M'  as const, stock: 7 },
        { size: 'L'  as const, stock: 3 },
        { size: 'XL' as const, stock: 1 },
        { size: 'XXL' as const, stock: 0 },
      ],
    },
    {
      id:           'seed-festive-emerald',
      title:        'Emerald Silk Straight Set',
      slug:         'emerald-silk-straight-set',
      description:  'Rich emerald green mulberry silk kurta with palazzo pants. Hand block-printed floral motifs along the yoke. A statement piece for festive evenings.',
      priceINR:     2799,
      collectionSlug: 'festive',
      isActive:     true,
      isFeatured:   false,
      images: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/animals/reindeer.jpg', altText: 'Emerald Silk Straight Set', sortOrder: 0 },
      ],
      variants: [
        { size: 'S'  as const, stock: 3 },
        { size: 'M'  as const, stock: 6 },
        { size: 'L'  as const, stock: 4 },
        { size: 'XL' as const, stock: 2 },
      ],
    },
    {
      id:           'seed-wedding-blush',
      title:        'Blush Tissue Gharara Set',
      slug:         'blush-tissue-gharara-set',
      description:  'Bridal blush tissue silk gharara set with intricate tilla embroidery. The kurta features a deep V-neckline with pearl button detailing. Includes gharara and hand-embroidered dupatta.',
      priceINR:     4999,
      collectionSlug: 'wedding',
      isActive:     true,
      isFeatured:   true,
      images: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/people/boy-snow-hoodie.jpg', altText: 'Blush Tissue Gharara Set', sortOrder: 0 },
      ],
      variants: [
        { size: 'XS' as const, stock: 1 },
        { size: 'S'  as const, stock: 2 },
        { size: 'M'  as const, stock: 3 },
        { size: 'L'  as const, stock: 2 },
        { size: 'XL' as const, stock: 1 },
        { size: 'XXL' as const, stock: 0 },
      ],
    },
    {
      id:           'seed-work-sage',
      title:        'Sage Linen Work Kurta',
      slug:         'sage-linen-work-kurta',
      description:  'A polished, collarless kurta in sage green linen-viscose blend. Structured enough for boardroom meetings, relaxed enough for a long day. Side pockets, concealed placket.',
      priceINR:     1799,
      collectionSlug: 'work',
      isActive:     true,
      isFeatured:   false,
      images: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/food/fish-vegetables.jpg', altText: 'Sage Linen Work Kurta', sortOrder: 0 },
      ],
      variants: [
        { size: 'XS' as const, stock: 2 },
        { size: 'S'  as const, stock: 6 },
        { size: 'M'  as const, stock: 10 },
        { size: 'L'  as const, stock: 7 },
        { size: 'XL' as const, stock: 4 },
        { size: 'XXL' as const, stock: 2 },
      ],
    },
  ];

  for (const product of products) {
    const { collectionSlug, images, variants, ...productData } = product;
    const collectionId = collectionMap[collectionSlug];

    await prisma.product.upsert({
      where:  { id: productData.id },
      update: {},
      create: {
        ...productData,
        collectionId,
        images:   { create: images },
        variants: { create: variants },
      },
    });
    console.log(`[seed] Product: ${productData.title}`);
  }

  // ── DesignConfig ───────────────────────────────────────────────────────────
  await prisma.designConfig.upsert({
    where:  { id: 'current_config' },
    update: {},
    create: {
      id:          'current_config',
      heroBanners: [
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/landscapes/landscape-panorama.jpg', altText: 'SS 2025 Collection — The Art of Quiet Elegance', linkHref: '/' },
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/people/smiling-man.jpg',            altText: 'Lookbook Background', linkHref: '/lookbook' },
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/landscapes/beach-boat.jpg',         altText: 'Festive Collection',  linkHref: '/?collection=festive' },
      ],
      isLookbookActive: true,
      activeTheme:      'pastel-pink',
      promoBannerText:  'Free shipping on orders above ₹1999 · Use code WELCOME10 for 10% off your first order',
    },
  });
  console.log('[seed] DesignConfig created');

  // ── Coupons ────────────────────────────────────────────────────────────────
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);

  await prisma.coupon.upsert({
    where:  { code: 'WELCOME10' },
    update: {},
    create: {
      code:              'WELCOME10',
      discountType:      'PERCENT',
      discountValue:     10,
      minOrderAmountINR: 0,
      maxDiscountINR:    500,
      maxUses:           null, // unlimited total
      perUserLimit:      1,    // once per user
      expiryDate:        oneYearFromNow,
      isActive:          true,
    },
  });
  console.log('[seed] Coupon: WELCOME10');

  await prisma.coupon.upsert({
    where:  { code: 'FLAT200' },
    update: {},
    create: {
      code:              'FLAT200',
      discountType:      'FIXED',
      discountValue:     200,
      minOrderAmountINR: 1000,
      maxDiscountINR:    null,
      maxUses:           100,
      perUserLimit:      1,
      expiryDate:        oneYearFromNow,
      isActive:          true,
    },
  });
  console.log('[seed] Coupon: FLAT200');

  await prisma.coupon.upsert({
    where:  { code: 'SALE20' },
    update: {},
    create: {
      code:              'SALE20',
      discountType:      'PERCENT',
      discountValue:     20,
      minOrderAmountINR: 500,
      maxDiscountINR:    1000,
      maxUses:           null,
      perUserLimit:      1,
      expiryDate:        lastYear,
      isActive:          false,
    },
  });
  console.log('[seed] Coupon: SALE20 (expired, inactive)');

  console.log('\n[seed] ✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
