import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.error('[seed] Starting database seed...');

  // ── Products ─────────────────────────────────────────────────────────────
  const products = [
    // 2 Casual
    {
      title: 'Indigo Linen Straight Kurta',
      description:
        'A breathable, straight-cut kurta in handwoven indigo linen. Perfect for everyday wear — pairs beautifully with white linen trousers or straight-fit jeans. Mandarin collar, three-quarter sleeves.',
      priceINR: 1299,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/samples/ecommerce/leather-bag-gray.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/samples/ecommerce/shoes.png',
      ],
      sizes: { XS: 3, S: 8, M: 12, L: 5, XL: 2, XXL: 0 },
      category: 'Casual',
      isActive: true,
    },
    {
      title: 'Dusty Rose Cotton A-Line Kurta',
      description:
        'A relaxed A-line silhouette in soft-washed cotton, in a muted dusty rose that transitions from morning chai to evening gatherings. Side slits for ease of movement.',
      priceINR: 899,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/samples/ecommerce/accessories-bag.jpg',
      ],
      sizes: { XS: 0, S: 4, M: 9, L: 6, XL: 3, XXL: 1 },
      category: 'Casual',
      isActive: true,
    },
    // 2 Festive
    {
      title: 'Champagne Chanderi Anarkali',
      description:
        'Floor-length anarkali in sheer champagne chanderi with delicate zari border at the hem. Fully lined, with a fitted bodice and flowing flare. Comes with matching dupatta.',
      priceINR: 3499,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/samples/landscapes/landscape-panorama.jpg',
      ],
      sizes: { XS: 2, S: 5, M: 7, L: 3, XL: 1, XXL: 0 },
      category: 'Festive',
      isActive: true,
    },
    {
      title: 'Emerald Silk Straight Set',
      description:
        'Rich emerald green mulberry silk kurta with palazzo pants. Hand block-printed floral motifs along the yoke. A statement piece for festive evenings.',
      priceINR: 2799,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/samples/animals/reindeer.jpg',
      ],
      sizes: { S: 3, M: 6, L: 4, XL: 2 },
      category: 'Festive',
      isActive: true,
    },
    // 1 Wedding
    {
      title: 'Blush Tissue Gharara Set',
      description:
        'Bridal blush tissue silk gharara set with intricate tilla embroidery. The kurta features a deep V-neckline with pearl button detailing. Includes gharara and hand-embroidered dupatta.',
      priceINR: 4999,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/samples/people/boy-snow-hoodie.jpg',
      ],
      sizes: { XS: 1, S: 2, M: 3, L: 2, XL: 1, XXL: 0 },
      category: 'Wedding',
      isActive: true,
    },
    // 1 Work
    {
      title: 'Sage Linen Work Kurta',
      description:
        'A polished, collarless kurta in sage green linen-viscose blend. Structured enough for boardroom meetings, relaxed enough for a long day. Side pockets, concealed placket.',
      priceINR: 1799,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/samples/food/fish-vegetables.jpg',
      ],
      sizes: { XS: 2, S: 6, M: 10, L: 7, XL: 4, XXL: 2 },
      category: 'Work',
      isActive: true,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: `seed-product-${product.title.toLowerCase().replace(/\s+/g, '-').slice(0, 20)}` },
      update: {},
      create: {
        id: `seed-product-${product.title.toLowerCase().replace(/\s+/g, '-').slice(0, 20)}`,
        ...product,
      },
    });
    console.error(`[seed] Created product: ${product.title}`);
  }

  // ── DesignConfig ─────────────────────────────────────────────────────────
  await prisma.designConfig.upsert({
    where: { id: 'current_config' },
    update: {},
    create: {
      id: 'current_config',
      heroBanners: [
        {
          url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/landscapes/landscape-panorama.jpg',
          altText: 'SS 2025 Collection — The Art of Quiet Elegance',
          linkHref: '/',
        },
        {
          url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/people/smiling-man.jpg',
          altText: 'Lookbook Background',
          linkHref: '/lookbook',
        },
        {
          url: 'https://res.cloudinary.com/demo/image/upload/v1/samples/landscapes/beach-boat.jpg',
          altText: 'Festive Collection',
          linkHref: '/?category=Festive',
        },
      ],
      isLookbookActive: true,
      activeTheme: 'pastel-pink',
      promoBannerText:
        'Free shipping on orders above ₹1999 · Use code WELCOME10 for 10% off your first order',
    },
  });
  console.error('[seed] Created DesignConfig');

  // ── Coupons ───────────────────────────────────────────────────────────────
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      discountPercent: 10,
      expiryDate: oneYearFromNow,
      isActive: true,
    },
  });
  console.error('[seed] Created coupon: WELCOME10');

  await prisma.coupon.upsert({
    where: { code: 'SALE20' },
    update: {},
    create: {
      code: 'SALE20',
      discountPercent: 20,
      expiryDate: lastYear,
      isActive: false,
    },
  });
  console.error('[seed] Created coupon: SALE20 (expired)');

  console.error('[seed] Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
