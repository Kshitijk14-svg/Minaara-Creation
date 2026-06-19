/**
 * Data Migration Script
 *
 * Since `prisma db push` already applied the new schema (dropping the old JSON blob
 * columns — images, sizes, category, shippingAddress, items), this script now:
 *   1. Ensures all Collections exist (idempotent)
 *   2. Backfills any orders that are missing subtotalINR / orderNumber
 *   3. Prints a database health check
 *
 * Run: npm run db:migrate
 * Safe to re-run.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COLLECTION_MAP = [
  { name: 'Casual',  slug: 'casual',  description: 'Everyday casual kurtas for comfort and style',           sortOrder: 0 },
  { name: 'Festive', slug: 'festive', description: 'Vibrant festive wear for celebrations',                   sortOrder: 1 },
  { name: 'Wedding', slug: 'wedding', description: 'Elegant bridal and wedding occasion wear',                sortOrder: 2 },
  { name: 'Work',    slug: 'work',    description: 'Polished work-appropriate ethnic wear for professionals', sortOrder: 3 },
];

async function main() {
  console.log('🚀 Running post-push data migration...\n');

  // ── Step 1: Ensure Collections exist ────────────────────────────────────────
  console.log('📦 Step 1: Ensuring Collections exist...');
  for (const col of COLLECTION_MAP) {
    const c = await prisma.collection.upsert({
      where:  { slug: col.slug },
      update: { name: col.name, description: col.description, sortOrder: col.sortOrder },
      create: { ...col, isActive: true },
    });
    console.log(`  ✅ "${c.name}" → ID: ${c.id}`);
  }

  // ── Step 2: Backfill orders missing orderNumber or subtotalINR ──────────────
  console.log('\n📦 Step 2: Backfilling orders...');
  const orders = await prisma.order.findMany({
    select: { id: true, orderNumber: true, subtotalINR: true, totalAmountINR: true },
  });
  console.log(`  Found ${orders.length} orders`);

  let patched = 0;
  for (const o of orders) {
    const updates: Record<string, unknown> = {};

    if (!o.orderNumber || o.orderNumber.trim() === '') {
      updates.orderNumber = `MNC-LEGACY-${o.id.slice(0, 8).toUpperCase()}`;
    }
    if (o.subtotalINR === 0 && o.totalAmountINR > 0) {
      updates.subtotalINR = o.totalAmountINR;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.order.update({ where: { id: o.id }, data: updates });
      patched++;
    }
  }
  console.log(`  Patched ${patched} orders`);

  // ── Step 3: Health check ─────────────────────────────────────────────────────
  console.log('\n🔍 Step 3: Database Health Check...');
  const [collections, products, variants, images, orderCount, orderItems] = await Promise.all([
    prisma.collection.count(),
    prisma.product.count(),
    prisma.productSizeVariant.count(),
    prisma.productImage.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
  ]);

  console.log(`  Collections:    ${collections}`);
  console.log(`  Products:       ${products}`);
  console.log(`  Size Variants:  ${variants}`);
  console.log(`  Product Images: ${images}`);
  console.log(`  Orders:         ${orderCount}`);
  console.log(`  Order Items:    ${orderItems}`);

  if (products > 0 && variants === 0) {
    console.log('\n⚠️  Products exist but no size variants found.');
    console.log('    Run: npm run db:seed');
  }

  console.log('\n✅ Migration complete! Next: npm run db:seed');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
