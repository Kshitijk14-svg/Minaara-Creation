/**
 * Seeds ~15-25 realistic orders (varied statuses/payment states/dates) so the
 * admin Order Manager has real data to explore. Run with `npm run seed:orders`.
 *
 * Uses the real createOrder() ACID transaction (real product/variant FKs,
 * real stock decrement) — this is NOT a synthetic row insert.
 */
import * as fs from 'fs';
import * as path from 'path';
import { eq, and, isNull, gt } from 'drizzle-orm';

// ── Load .env.local / .env before anything that reads process.env at import time ──
function loadEnvFile(filename: string) {
  const filePath = path.resolve(__dirname, '..', filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

// require() (not import) so these modules load *after* env vars are set above.
const { db } = require('../src/db') as typeof import('../src/db');
const schema = require('../src/db/schema') as typeof import('../src/db/schema');
const { createOrder } = require('../src/lib/orders') as typeof import('../src/lib/orders');

const ORDER_COUNT = 20;

const CUSTOMERS = [
  { name: 'Ananya Sharma',   email: 'mock.ananya@example.com',  phone: '9000000001', city: 'Mumbai',    state: 'Maharashtra',  pincode: '400001' },
  { name: 'Rohan Verma',     email: 'mock.rohan@example.com',   phone: '9000000002', city: 'Delhi',     state: 'Delhi',        pincode: '110001' },
  { name: 'Priya Nair',      email: 'mock.priya@example.com',   phone: '9000000003', city: 'Bengaluru', state: 'Karnataka',    pincode: '560001' },
  { name: 'Karthik Iyer',    email: 'mock.karthik@example.com', phone: '9000000004', city: 'Chennai',   state: 'Tamil Nadu',   pincode: '600001' },
  { name: 'Sneha Das',       email: 'mock.sneha@example.com',   phone: '9000000005', city: 'Kolkata',   state: 'West Bengal',  pincode: '700001' },
  { name: 'Aditya Reddy',    email: 'mock.aditya@example.com',  phone: '9000000006', city: 'Hyderabad', state: 'Telangana',    pincode: '500001' },
  { name: 'Meera Joshi',     email: 'mock.meera@example.com',   phone: '9000000007', city: 'Pune',      state: 'Maharashtra',  pincode: '411001' },
  { name: 'Vikram Patel',    email: 'mock.vikram@example.com',  phone: '9000000008', city: 'Ahmedabad', state: 'Gujarat',      pincode: '380001' },
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log('Fetching active products with in-stock variants…');
  const variantPool = await db
    .select({
      productId: schema.products.id,
      variantId: schema.productSizeVariants.id,
      size:      schema.productSizeVariants.size,
      stock:     schema.productSizeVariants.stock,
    })
    .from(schema.products)
    .innerJoin(schema.productSizeVariants, eq(schema.productSizeVariants.productId, schema.products.id))
    .where(and(
      eq(schema.products.isActive, true),
      isNull(schema.products.deletedAt),
      gt(schema.productSizeVariants.stock, 0),
    ));

  if (variantPool.length === 0) {
    throw new Error('No active products with in-stock variants found — seed/activate products first.');
  }
  console.log(`Found ${variantPool.length} in-stock product/variant combos.`);

  const created: { id: string; orderNumber: string }[] = [];
  let failures = 0;

  for (let i = 0; i < ORDER_COUNT; i++) {
    const customer = CUSTOMERS[i % CUSTOMERS.length];
    const itemCount = 1 + (i % 3); // 1-3 items
    const picks = shuffle(variantPool).slice(0, Math.min(itemCount, variantPool.length));

    const paymentStatus: 'PAID' | 'PENDING' | 'FAILED' =
      i % 10 === 9 ? 'FAILED' : i % 10 >= 7 ? 'PENDING' : 'PAID';

    try {
      const order = await createOrder(
        {
          customerEmail: customer.email,
          customerPhone: customer.phone,
          shippingAddress: {
            fullName: customer.name,
            line1: `${100 + i}, MG Road`,
            line2: i % 2 === 0 ? 'Near City Mall' : undefined,
            city: customer.city,
            state: customer.state,
            pincode: customer.pincode,
            country: 'India',
          },
          items: picks.map((p) => ({
            productId: p.productId,
            variantId: p.variantId,
            size: p.size,
            quantity: 1 + (Math.random() < 0.3 ? 1 : 0), // mostly 1, sometimes 2
          })),
          currency: 'INR',
          notes: undefined,
        },
        { paymentStatus },
      );
      created.push({ id: order.id, orderNumber: order.orderNumber });
      console.log(`  ✓ ${order.orderNumber} — ₹${order.totalAmountINR} (${paymentStatus})`);
    } catch (err) {
      failures++;
      console.warn(`  ✗ order ${i + 1} skipped:`, err instanceof Error ? err.message : err);
    }
  }

  if (created.length === 0) {
    throw new Error('No orders were created successfully — aborting before backfill pass.');
  }

  console.log(`\nCreated ${created.length} orders (${failures} skipped). Backfilling status/date variety…`);

  // Follow-up status + createdAt backfill for variety.
  for (let i = 0; i < created.length; i++) {
    const { id } = created[i];
    const bucket = i % 6;
    const createdAt = daysAgo(1 + Math.floor(Math.random() * 29)); // spread over last 30 days

    if (bucket === 0) {
      await db.update(schema.orders)
        .set({ status: 'DELIVERED', deliveredAt: daysAgo(1), createdAt, updatedAt: new Date() })
        .where(eq(schema.orders.id, id));
    } else if (bucket === 1) {
      await db.update(schema.orders)
        .set({ status: 'SHIPPED', createdAt, updatedAt: new Date() })
        .where(eq(schema.orders.id, id));
    } else if (bucket === 2) {
      await db.update(schema.orders)
        .set({ status: 'PROCESSING', createdAt, updatedAt: new Date() })
        .where(eq(schema.orders.id, id));
    } else if (bucket === 3) {
      await db.update(schema.orders)
        .set({ status: 'CONFIRMED', createdAt, updatedAt: new Date() })
        .where(eq(schema.orders.id, id));
    } else if (bucket === 4) {
      await db.update(schema.orders)
        .set({ status: 'CANCELLED', cancelledAt: daysAgo(1), createdAt, updatedAt: new Date() })
        .where(eq(schema.orders.id, id));
    } else {
      // leave as PENDING (default), just backfill createdAt
      await db.update(schema.orders)
        .set({ createdAt, updatedAt: new Date() })
        .where(eq(schema.orders.id, id));
    }
  }

  // Final summary
  console.log('\n── Summary ──');
  for (const { id, orderNumber } of created) {
    const [row] = await db
      .select({
        status:         schema.orders.status,
        paymentStatus:  schema.orders.paymentStatus,
        totalAmountINR: schema.orders.totalAmountINR,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, id))
      .limit(1);
    console.log(`${orderNumber} → ${row.status} / ${row.paymentStatus} / ₹${row.totalAmountINR}`);
  }

  console.log(`\nDone. ${created.length} orders created, ${failures} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
